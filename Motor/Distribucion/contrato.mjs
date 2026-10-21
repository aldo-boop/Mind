import * as fs from 'node:fs';
import {join,resolve,dirname,relative,isAbsolute} from 'node:path';
import {createHash,verify,sign,randomUUID} from 'node:crypto';
export const META='Motor/Distribucion/manifiesto.json';
export const CONFIANZA='Motor/Distribucion/confianza.json';
export const REGISTRO='Motor/.instalado.json';
export const sha=b=>createHash('sha256').update(b).digest('hex');
export const hash=p=>sha(fs.readFileSync(p));
export const error=(codigo,mensaje,detalle)=>Object.assign(Error(mensaje),{codigo,...(detalle?{detalle}:{}),necesitaDecision:['ADAPTACION_REQUERIDA','COLISION_PERSONAL','DECISION_REQUERIDA'].includes(codigo)});
export function rutaSegura(r) {
 if(typeof r!=='string'||r.length>240||r.includes('\\')||/[\x00-\x1f:]/.test(r)||r.startsWith('/')||r.split('/').some(p=>!p||p==='.'||p==='..'||/[. ]$/.test(p)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)))throw error('RUTA_INVALIDA','Ruta no admitida: '+r);
 return r;
}
export function oficial(r) {
 rutaSegura(r);const k=r.toLowerCase();
 if(['agents.md','claude.md','gemini.md','bienvenida.md','mind.cmd','recuperar.cmd'].includes(k))return r;
 if(!k.startsWith('motor/')||k.split('/').some(p=>p.startsWith('.'))||/\/(?:del usuario)(?:\/|$)/.test(k)||/^(motor\/(?:configuracion|credenciales)\/)/.test(k))throw error('RUTA_PROTEGIDA','La actualización no puede tocar: '+r);
 return r;
}
export function sinEnlaces(p) {
 for(let q=resolve(p);;){if(fs.lstatSync(q,{throwIfNoEntry:false})?.isSymbolicLink())throw error('ENLACE_NO_ADMITIDO','No se permiten enlaces ni junctions: '+p);const parent=dirname(q);if(parent===q)break;q=parent;}return p;
}
export const dentro=(a,b)=>{const r=relative(resolve(a),resolve(b));return r===''||(!r.startsWith('..')&&!isAbsolute(r));};
export const leer=p=>JSON.parse(fs.readFileSync(sinEnlaces(p),'utf8').replace(/^\uFEFF/,''));
export function atomico(p,dato) {
 sinEnlaces(p);fs.mkdirSync(dirname(p),{recursive:true});const tmp=p+'.'+randomUUID()+'.tmp';
 const fd=fs.openSync(tmp,'wx');try{fs.writeFileSync(fd,typeof dato==='string'||Buffer.isBuffer(dato)?dato:JSON.stringify(dato,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 for(let i=0;;i++){try{fs.renameSync(tmp,p);break;}catch(e){if(!['EPERM','EACCES','EBUSY'].includes(e.code)||i===25)throw e;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,80);}}
}
export function validarManifiesto(m) {
 if(m?.formato!==1||typeof m.motor!=='string'||!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(m.motor)||!Number.isInteger(m.memoria)||m.memoria<1||!Array.isArray(m.archivos)||!m.archivos.length||m.archivos.length>5000)throw error('MANIFIESTO_INVALIDO','Manifiesto de Motor inválido');
 const vistos=new Set();let total=0;
 for(const f of m.archivos){oficial(f.ruta);if(f.ruta===META||vistos.has(f.ruta.toLowerCase())||!/^([a-f0-9]{64})$/.test(f.sha256)||!Number.isSafeInteger(f.bytes)||f.bytes<0)throw error('MANIFIESTO_INVALIDO','Entrada duplicada o inválida: '+f.ruta);vistos.add(f.ruta.toLowerCase());total+=f.bytes;}
 if(total>700*1024*1024)throw error('PAQUETE_GRANDE','El Motor excede el tamaño admitido');return m;
}
export function comprobarPaquete(raiz,m=leer(join(raiz,META))) {
 validarManifiesto(m);
 for(const f of m.archivos){const p=sinEnlaces(join(raiz,f.ruta)),s=fs.lstatSync(p,{throwIfNoEntry:false});if(!s?.isFile()||s.size!==f.bytes||hash(p)!==f.sha256)throw error('INTEGRIDAD_INVALIDA','Archivo oficial distinto o ausente: '+f.ruta);}
 const v=leer(join(raiz,'Motor/version.json'));if(v.motor!==m.motor||v.memoria!==m.memoria)throw error('MANIFIESTO_INVALIDO','La versión no corresponde al manifiesto');return m;
}
export function verificarSobre(sobre,claves) {
 if(typeof sobre?.contenido!=='string'||typeof sobre?.firma!=='string'||typeof sobre?.clave!=='string'||sobre.contenido.length>4*1024*1024)throw error('FIRMA_INVALIDA','Publicación sin firma válida');
 const publica=claves?.[sobre.clave];if(!publica)throw error('FIRMA_INVALIDA','La identidad de publicación no es de confianza');
 let ok=false;try{ok=verify(null,Buffer.from(sobre.contenido),publica,Buffer.from(sobre.firma,'base64'));}catch{}
 if(!ok)throw error('FIRMA_INVALIDA','La firma de la publicación no coincide');
 return JSON.parse(sobre.contenido);
}
export function firmar(contenido,clave,privada) {const texto=JSON.stringify(contenido);return {contenido:texto,clave,firma:sign(null,Buffer.from(texto),privada).toString('base64')};}
export function versionMemoria(destino,nueva) {
 const p=join(destino,'Memoria/version.json');if(fs.existsSync(p)){const v=leer(p).memoria;if(!Number.isInteger(v))throw error('MEMORIA_INVALIDA','Versión de Memoria inválida');return v;}
 const d=join(destino,'Memoria/Tablas');if(fs.existsSync(d)&&fs.readdirSync(d).some(n=>n.endsWith('.jsonl')))return null;return nueva;
}
export function inventario(raiz,{omitir=()=>false}={}) {
 const out={};if(!fs.existsSync(raiz))return out;
 function recorrer(d,r=''){sinEnlaces(d);for(const e of fs.readdirSync(d,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const rel=r?r+'/'+e.name:e.name,p=join(d,e.name);if(omitir(rel))continue;if(e.isSymbolicLink())throw error('ENLACE_NO_ADMITIDO','Enlace dentro del ámbito: '+rel);if(e.isDirectory())recorrer(p,rel);else if(e.isFile())out[rel]=hash(p);else throw error('ARCHIVO_ESPECIAL','Archivo especial: '+rel);}}recorrer(raiz);return out;
}
export const canonico=x=>JSON.stringify(Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))));

// Un recibo anterior permite diagnosticar y reparar version.json si ese archivo oficial se dañó.
export function versionInstalada(destino) {
 try { const v=leer(join(destino,'Motor/version.json')).motor;if(typeof v==='string'&&/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(v))return v; } catch {}
 try { const v=leer(join(destino,REGISTRO)).motor;if(typeof v==='string'&&/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(v))return v; } catch {}
 return null;
}
