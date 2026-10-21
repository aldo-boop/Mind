import * as fs from 'node:fs';
import {join} from 'node:path';
import {tmpdir,hostname} from 'node:os';
import {META,REGISTRO,CONFIANZA,sha,hash,leer,atomico,verificarSobre,validarManifiesto,comprobarPaquete,error,sinEnlaces,versionMemoria,versionInstalada} from './contrato.mjs';
import {extraerZip} from './zip.mjs';
import {actualizar,revisar,recuperar} from '../actualizar.mjs';
const ESTADO='Motor/.canal-estado.json';
function urlPermitida(valor,base,{permitirLocal=false}={}){const u=new URL(valor,base);if(u.username||u.password||u.hash||(u.protocol!=='https:'&&!(permitirLocal&&u.protocol==='http:'&&['127.0.0.1','[::1]','localhost'].includes(u.hostname))))throw error('CANAL_INVALIDO','El canal requiere HTTPS sin credenciales');if(base&&u.origin!==new URL(base).origin)throw error('CANAL_INVALIDO','El paquete debe pertenecer al origen autorizado del canal');return u.href;}
async function recibir(url,maximo,{permitirLocal=false}={}){
 urlPermitida(url,undefined,{permitirLocal});const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),15000);
 try{const r=await fetch(url,{redirect:'error',signal:ac.signal,headers:{'Accept-Encoding':'identity'}});if(!r.ok)throw error('DESCARGA_FALLIDA','El canal respondió '+r.status);const declared=Number(r.headers.get('content-length'));if(declared&&declared>maximo)throw error('PAQUETE_GRANDE','La descarga excede el tamaño');let bytes=0;const partes=[];for await(const p of r.body){bytes+=p.length;if(bytes>maximo)throw error('PAQUETE_GRANDE','La descarga excede el tamaño');partes.push(p);}if(declared&&declared!==bytes)throw error('DESCARGA_INCOMPLETA','La descarga quedó incompleta');return Buffer.concat(partes);}finally{clearTimeout(timer);}
}
export function compararVersion(a,b){const partir=valor=>{const v=/^2\.0\.0-dev\.\d+$/.test(valor)?valor.replace('2.0.0-dev.','1.2.0-dev.'):valor;const m=/^(\d+)\.(\d+)\.(\d+)(?:-(.*))?$/.exec(v);if(!m)throw error('VERSION_INVALIDA','Versión no admitida');return [+m[1],+m[2],+m[3],m[4]];};const x=partir(a),y=partir(b);for(let i=0;i<3;i++)if(x[i]!==y[i])return Math.sign(x[i]-y[i]);if(x[3]===y[3])return 0;if(x[3]===undefined)return 1;if(y[3]===undefined)return -1;const u=x[3].split('.'),v=y[3].split('.');for(let i=0;i<Math.max(u.length,v.length);i++){if(u[i]===v[i])continue;if(u[i]===undefined)return -1;if(v[i]===undefined)return 1;const n=/^\d+$/.test(u[i]),m=/^\d+$/.test(v[i]);return n&&m?Math.sign(+u[i]-+v[i]):n!==m?(n?-1:1):u[i]<v[i]?-1:1;}return 0;}
function confianza(destino){const c=leer(join(destino,CONFIANZA));if(c.formato!==1||!c.claves||typeof c.claves!=='object')throw error('CONFIANZA_INVALIDA','Configuración de confianza inválida');return c;}
export async function consultar({destino,permitirLocal=false}={}){
 const c=confianza(destino);if(!c.canal)return {estado:'sin-canal',nota:'No se publicó ni configuró un canal oficial; el Motor local sigue disponible.'};
 const url=urlPermitida(c.canal,undefined,{permitirLocal});let sobre;try{sobre=JSON.parse((await recibir(url,4*1024*1024,{permitirLocal})).toString('utf8'));}catch(e){if(e.codigo)throw e;throw error('CANAL_NO_DISPONIBLE','No se pudo consultar el canal; se conserva la versión instalada');}
 const p=verificarSobre(sobre,c.claves);if(p?.formato!==1||!Number.isSafeInteger(p.secuencia)||p.secuencia<1||!Number.isFinite(Date.parse(p.publicado))||p.motor!==p.manifiesto?.motor||p.memoria!==p.manifiesto?.memoria||!p.paquete||!Number.isSafeInteger(p.paquete.bytes)||p.paquete.bytes<22||p.paquete.bytes>700*1024*1024||!/^[a-f0-9]{64}$/.test(p.paquete.sha256))throw error('PUBLICACION_INVALIDA','Metadatos de publicación inválidos');validarManifiesto(p.manifiesto);
 // Un descriptor firmado caduca: servir indefinidamente uno antiguo no puede ocultar versiones nuevas sin que se note.
 if(p.vence!==undefined&&(!Number.isFinite(Date.parse(p.vence))||Date.parse(p.vence)<Date.now()))throw error('PUBLICACION_VENCIDA','La publicación firmada venció; se conserva la versión instalada');
 const estado=fs.existsSync(join(destino,ESTADO))?leer(join(destino,ESTADO)):{};
 if((estado.canal===undefined||estado.canal===url)&&(estado.secuencia>p.secuencia||estado.secuencia===p.secuencia&&estado.huella&&estado.huella!==sha(Buffer.from(sobre.contenido))))throw error('PUBLICACION_ANTIGUA','Se rechazó una publicación anterior o contradictoria');
 const instalada=versionInstalada(destino);if(!instalada)throw error('VERSION_DESCONOCIDA','No se puede demostrar la versión instalada; usar una copia oficial para diagnosticar');if(compararVersion(p.motor,instalada)<0)throw error('PUBLICACION_ANTIGUA','El canal no puede degradar el Motor instalado');
 return {estado:'verificada',publicacion:p,sobre,url,actual:instalada,nueva:compararVersion(p.motor,instalada)>0};
}
export async function descargar({consulta,permitirLocal=false}={}){
 const {publicacion:p,url}=consulta;if(consulta.estado!=='verificada')throw error('FIRMA_INVALIDA','La descarga requiere una publicación verificada');const paquete=urlPermitida(p.paquete.url,url,{permitirLocal}),zip=await recibir(paquete,p.paquete.bytes,{permitirLocal});
 if(zip.length!==p.paquete.bytes||sha(zip)!==p.paquete.sha256)throw error('INTEGRIDAD_INVALIDA','El ZIP no coincide con la publicación firmada');
 const dir=fs.mkdtempSync(join(tmpdir(),'mind-publicacion-')),permitidas=new Set([...p.manifiesto.archivos.map(f=>f.ruta),META,REGISTRO]);
 try{extraerZip(zip,dir,permitidas);const m=comprobarPaquete(dir);if(JSON.stringify(m)!==JSON.stringify(p.manifiesto))throw error('MANIFIESTO_INVALIDO','El ZIP no corresponde al manifiesto firmado');}
 catch(e){fs.rmSync(dir,{recursive:true,force:true});throw e;}
 // El recibo de fábrica se deriva del manifiesto firmado; no se ejecuta contenido adicional del ZIP.
 return {origen:dir,paquete,sha256:p.paquete.sha256};
}
export async function inicio({destino,permitirLocal=false,soloConsultar=false}={}){
 recuperar(destino);
 let q;try{q=await consultar({destino,permitirLocal});}catch(e){return {estado:'aplazada',codigo:e.codigo??'CANAL_NO_DISPONIBLE',motivo:e.message,versionInstaladaConservada:true};}
 if(q.estado==='sin-canal')return q;
 if(soloConsultar)return {estado:q.nueva?'actualizacion-disponible':'sin-novedades',actual:q.actual,nueva:q.publicacion.motor};
 const memoria=versionMemoria(destino,q.publicacion.memoria);if(memoria!==q.publicacion.memoria)return {estado:'necesita-autorizacion',codigo:'ADAPTACION_REQUERIDA',motorActual:q.actual,motorPropuesto:q.publicacion.motor,memoriaActual:memoria,memoriaPropuesta:q.publicacion.memoria,nota:'El Motor anterior sigue activo. Adaptar requiere una autorización separada.'};
 for(const r of ['Memoria/.escritura.lock','Memoria/.adaptacion.lock','Memoria/Tablas/.escritura.lock','Motor/.sesion-activa.json'])if(fs.existsSync(join(destino,r)))return {estado:'aplazada',codigo:'TRABAJO_ACTIVO',nota:'Se conserva el Motor hasta que termine el trabajo activo.'};
 const m=q.publicacion.manifiesto,problemas=m.archivos.filter(f=>!fs.existsSync(sinEnlaces(join(destino,f.ruta)))||hash(join(destino,f.ruta))!==f.sha256);
 const meta=Buffer.from(JSON.stringify(m,null,2)+'\n');if(!fs.existsSync(join(destino,META))||hash(join(destino,META))!==sha(meta))problemas.push({ruta:META});
 if(!q.nueva&&!problemas.length){registrarVista(destino,q);return {estado:'sin-novedades',motor:q.actual};}
 let d;try{d=await descargar({consulta:q,permitirLocal});const r=actualizar({origen:d.origen,destino,modo:q.nueva?'actualizar':'reparar'});
 registrarVista(destino,q);return {estado:q.nueva?'actualizado':'reparado',...r};
 }catch(e){if(e.recuperacionPendiente||fs.existsSync(join(destino,'Motor/.actualizacion.json')))throw e;return {estado:'aplazada',codigo:e.codigo??e.code??'ACTUALIZACION_FALLIDA',motivo:e.message,versionInstaladaConservada:true};}
 finally{if(d?.origen)fs.rmSync(d.origen,{recursive:true,force:true});}
}
// Recuerda la última publicación verificada, aunque no hubiera nada que aplicar: así no se acepta después una anterior.
function registrarVista(destino,q){const e=fs.existsSync(join(destino,ESTADO))?leer(join(destino,ESTADO)):{};if(e.canal===q.url&&e.secuencia===q.publicacion.secuencia)return;atomico(join(destino,ESTADO),{secuencia:q.publicacion.secuencia,huella:sha(Buffer.from(q.sobre.contenido)),motor:q.publicacion.motor,sobre:q.sobre,canal:q.url});}
export async function prepararAdaptacionDesdeCanal({destino,permitirLocal=false}={}){const q=await consultar({destino,permitirLocal});if(q.estado!=='verificada')return q;const d=await descargar({consulta:q,permitirLocal});return {...d,motor:q.publicacion.motor,memoria:q.publicacion.memoria,nota:'Descargado y verificado; nada activado. Adaptar exige confirmación explícita.'};}
