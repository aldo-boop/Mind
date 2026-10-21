// Actualización local verificada; las descargas firmadas usan esta misma puerta.
import * as fs from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {hostname} from 'node:os';
import {spawnSync} from 'node:child_process';
import {META,REGISTRO,hash,leer,oficial,sinEnlaces,dentro,atomico,comprobarPaquete,validarManifiesto,versionMemoria,versionInstalada,error} from './Distribucion/contrato.mjs';
export function lecturaArranque(motor,memoria){
 const bienvenida=join(motor,'..','Bienvenida.md');if(!fs.existsSync(bienvenida))throw Error('Falta '+bienvenida);const tb=fs.readFileSync(bienvenida,'utf8');
 for(const n of ['AGENTS.md','CLAUDE.md','GEMINI.md'])if(!fs.existsSync(join(motor,'..',n))||!fs.readFileSync(join(motor,'..',n),'utf8').includes('Bienvenida.md'))throw Error(n+' debe existir y llevar a Bienvenida.md');
 if(!tb.includes('Memoria/Vistas/Inicio.md'))throw Error('Bienvenida.md no nombra Memoria/Vistas/Inicio.md');
 const inicio=join(memoria,'Vistas/Inicio.md'),rutas=[bienvenida,...(fs.existsSync(inicio)?[inicio]:[])],texto=rutas.map(p=>fs.readFileSync(p,'utf8').trim()).join('\n\n')+'\n',tokensMind=Math.ceil(tb.length/4),tokensEstimados=Math.ceil(texto.length/4);
 return {texto,rutas,caracteres:texto.length,tokensMind,tokensEstimados,cabe:tokensMind<=1000&&tokensEstimados<=2000,limiteMind:1000,limite:2000};
}
const LOCK='Motor/.actualizando.lock',JOURNAL='Motor/.actualizacion.json';
function propio(lock){return lock?.tipo==='mind-actualizacion'&&lock.host===hostname()&&typeof lock.token==='string';}
function vivo(pid){try{process.kill(pid,0);return true;}catch(e){return e.code!=='ESRCH';}}
function soltar(p,token){if(fs.existsSync(p)&&leer(p).token===token)fs.unlinkSync(p);}
function rutasRegistro(destino){
 const p=join(destino,REGISTRO);if(!fs.existsSync(p))return {archivos:[],hashes:{}};const r=leer(p);
 if(!Array.isArray(r.archivos)||r.archivos.length>6000)throw error('REGISTRO_INVALIDO','Registro de instalación inválido');
 const vistos=new Set();for(const x of r.archivos){oficial(x);if(vistos.has(x.toLowerCase()))throw error('REGISTRO_INVALIDO','Registro duplicado');vistos.add(x.toLowerCase());}
 return r;
}
function comprobarJournal(j){if(j?.formato!==1||!/^Motor\/\.respaldos\/[a-f0-9-]{36}$/.test(j.respaldo)||!Array.isArray(j.archivos))throw error('RECUPERACION_INVALIDA','Diario de actualización no válido');for(const f of j.archivos)oficial(f.ruta);return j;}
function restaurar(destino,j){
 comprobarJournal(j);const respaldo=sinEnlaces(join(destino,j.respaldo));
 // No empezar a restaurar si una sola copia original no es verificable.
 for(const f of j.archivos)if(f.existia&&(!fs.existsSync(join(respaldo,f.ruta))||hash(join(respaldo,f.ruta))!==f.shaAnterior))throw error('RESPALDO_INVALIDO','No se puede restaurar '+f.ruta);
 if(j.registroAnterior&&hash(join(respaldo,REGISTRO))!==j.hashRegistro)throw error('RESPALDO_INVALIDO','Registro previo no recuperable');
 for(const f of [...j.archivos].reverse()){const p=sinEnlaces(join(destino,f.ruta));if(f.existia)atomico(p,fs.readFileSync(join(respaldo,f.ruta)));else if(fs.existsSync(p)){if(!fs.lstatSync(p).isFile()||hash(p)!==f.shaNueva)throw error('COLISION_PERSONAL','Una entrada nueva cambió durante la recuperación: '+f.ruta);fs.unlinkSync(p);}}
 if(j.registroAnterior)atomico(join(destino,REGISTRO),fs.readFileSync(join(respaldo,REGISTRO)));else if(fs.existsSync(join(destino,REGISTRO)))fs.unlinkSync(join(destino,REGISTRO));
 if(j.memoria){const real=join(destino,'Memoria'),vieja=sinEnlaces(join(destino,j.respaldo,'Memoria-original'));if(fs.existsSync(vieja)){if(fs.existsSync(real)){const conservar=join(destino,j.respaldo,'Memoria-candidata-no-activada');if(fs.existsSync(conservar))throw error('RECUPERACION_INVALIDA','El candidato de recuperación ya existe');fs.renameSync(real,conservar);}fs.renameSync(vieja,real);}}
}
// Conserva los 3 respaldos de Motor más recientes. Los que guardan una Memoria original nunca se borran solos: se informan.
const RETENER=3;
export function podarRespaldos(destino,actual){
 const dir=join(destino,'Motor/.respaldos');if(!fs.existsSync(dir))return {conservados:0,retirados:0,memoriasOriginales:[]};
 const todos=fs.readdirSync(dir,{withFileTypes:true}).filter(e=>e.isDirectory()&&/^[a-f0-9-]{36}$/.test(e.name)).map(e=>({id:e.name,p:join(dir,e.name),t:fs.statSync(join(dir,e.name)).mtimeMs})).sort((a,b)=>b.t-a.t);
 const memorias=todos.filter(x=>fs.existsSync(join(x.p,'Memoria-original'))||fs.existsSync(join(x.p,'Memoria-candidata-no-activada')));
 const motor=todos.filter(x=>!memorias.includes(x)),retirar=motor.filter(x=>x.id!==actual).slice(RETENER-1);
 for(const x of retirar)fs.rmSync(sinEnlaces(x.p),{recursive:true,force:true});
 return {conservados:todos.length-retirar.length,retirados:retirar.length,memoriasOriginales:memorias.map(x=>x.p)};
}
export function recuperar(destino){
 destino=sinEnlaces(resolve(destino));const lp=join(destino,LOCK),jp=join(destino,JOURNAL);let lock;
 if(fs.existsSync(lp)){lock=leer(lp);if(!propio(lock)||vivo(lock.pid))throw error('ACTUALIZACION_OCUPADA','Hay una actualización activa o no se puede comprobar su dueño');}
 const sp=join(destino,'Motor/.sesion-activa.json');if(fs.existsSync(sp)){const sesion=leer(sp);if(sesion.tipo==='mind-sesion'&&sesion.host===hostname()&&Number.isSafeInteger(sesion.pid)&&typeof sesion.token==='string'&&!vivo(sesion.pid))soltar(sp,sesion.token);}
 if(!fs.existsSync(jp)){if(lock){for(const r of ['Memoria/.escritura.lock','Memoria/.adaptacion.lock'])soltar(join(destino,r),lock.token);fs.unlinkSync(lp);}return {recuperada:false};}
 const j=comprobarJournal(leer(jp));if(j.host!==hostname()||vivo(j.pid))throw error('ACTUALIZACION_OCUPADA','El proceso del diario sigue activo o no es de este equipo');
 if(j.fase!=='confirmada')restaurar(destino,j);fs.unlinkSync(jp);for(const r of ['Memoria/.escritura.lock','Memoria/.adaptacion.lock'])soltar(join(destino,r),j.token);if(lock)soltar(lp,lock.token);return {recuperada:true,restaurada:j.fase!=='confirmada',respaldo:join(destino,j.respaldo)};
}
function tomar(destino){
 recuperar(destino);for(const r of ['Memoria/.adaptacion.lock','Memoria/.escritura.lock','Memoria/Tablas/.escritura.lock'])if(fs.existsSync(join(destino,r)))throw error('MEMORIA_OCUPADA','Memoria ocupada o en adaptación');
 const token=randomUUID(),data={tipo:'mind-actualizacion',token,pid:process.pid,host:hostname()},lp=join(destino,LOCK);fs.mkdirSync(dirname(lp),{recursive:true});
 let fd;try{fd=fs.openSync(lp,'wx');}catch{throw error('ACTUALIZACION_OCUPADA','Ya hay una actualización en curso');}try{fs.writeFileSync(fd,JSON.stringify(data));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 try{if(fs.existsSync(join(destino,'Motor/.sesion-activa.json')))throw error('TRABAJO_ACTIVO','Hay una operación activa');if(fs.existsSync(join(destino,'Memoria'))){const p=join(destino,'Memoria/.escritura.lock'),f=fs.openSync(p,'wx');try{fs.writeFileSync(f,JSON.stringify(data));}finally{fs.closeSync(f);}}}catch(e){soltar(lp,token);if(e.codigo==='TRABAJO_ACTIVO')throw e;throw error('MEMORIA_OCUPADA','La Memoria empezó a escribir; se difiere la actualización');}
 return ()=>{soltar(join(destino,'Memoria/.escritura.lock'),token);soltar(lp,token);};
}
function lecturaCompatible(origen,destino){
 const module=pathToFileURL(join(origen,'Motor/Funciones/Base/Tablas/tablas.mjs')).href;
 const codigo=`import {abrirTablas,ESQUEMA,RAMIFICABLES} from ${JSON.stringify(module)};const t=abrirTablas(${JSON.stringify(join(destino,'Memoria'))});let n=0;for(const k of Object.keys(ESQUEMA)){n+=t.leer(k,{historia:true}).length;if(RAMIFICABLES.includes(k))for(const r of t.ramas(k))n+=t.leer(k,{rama:r,historia:true}).length;}console.log(n);`;
 const r=spawnSync(process.execPath,['--input-type=module','-e',codigo],{encoding:'utf8',windowsHide:true,timeout:30000});if(r.status!==0)throw error('MEMORIA_NO_LEGIBLE','El Motor candidato no puede leer la Memoria; no se activó: '+(r.stderr||r.error?.message||'').slice(-400));return Number(r.stdout.trim());
}
export function revisar({origen,destino}){const m=resolve(origen)===resolve(destino)?validarManifiesto(leer(join(origen,META))):comprobarPaquete(origen),filas=m.archivos.map(f=>({...f,estado:!fs.existsSync(sinEnlaces(join(destino,f.ruta)))?'ausente':hash(join(destino,f.ruta))===f.sha256?'integro':'alterado'}));return {motor:m.motor,total:filas.length,integros:filas.filter(x=>x.estado==='integro').length,problemas:filas.filter(x=>x.estado!=='integro').slice(0,50),problemasTotal:filas.filter(x=>x.estado!=='integro').length};}
export function actualizar({origen,destino,simular=false,comprobarArranque=true,modo='actualizar',adoptar=false,incidencia,_memoriaPreparada}={}){
 origen=sinEnlaces(resolve(origen));destino=sinEnlaces(resolve(destino));if(dentro(origen,destino)||dentro(destino,origen))throw error('ORIGEN_INVALIDO','El origen y el destino no pueden contenerse');
 if(fs.existsSync(join(origen,'Memoria')))throw error('ORIGEN_INVALIDO','El origen debe ser una carpeta del Motor, sin Memoria');
 const m=comprobarPaquete(origen);if(!fs.existsSync(destino))throw error('DESTINO_INVALIDO','No existe la carpeta del Mind');
 if(fs.readdirSync(destino).length&&!fs.existsSync(join(destino,'Motor'))&&!fs.existsSync(join(destino,'Memoria')))throw error('DESTINO_INVALIDO','El destino no parece un Mind');
 if(!simular)recuperar(destino);
 const v=versionMemoria(destino,m.memoria),actual=versionInstalada(destino);
 if(v!==m.memoria&&!_memoriaPreparada)throw error('ADAPTACION_REQUERIDA','La nueva versión necesita adaptar la Memoria; el Motor anterior sigue activo',{anterior:v,nueva:m.memoria});
 if(modo==='reparar'&&actual&&actual!==m.motor)throw error('VERSION_DISTINTA','Reparar exige la misma versión instalada');
 const reg=rutasRegistro(destino),conocidos=new Set(reg.archivos.map(r=>r.toLowerCase())),nuevos=[...m.archivos,{ruta:META,sha256:hash(join(origen,META)),bytes:fs.statSync(join(origen,META)).size}],set=new Set(nuevos.map(f=>f.ruta.toLowerCase())),plan={agregar:[],cambiar:[],retirar:[],iguales:0};
 for(const f of nuevos){const p=sinEnlaces(join(destino,f.ruta));if(!fs.existsSync(p))plan.agregar.push(f.ruta);else{if(!fs.lstatSync(p).isFile())throw error('COLISION_PERSONAL','El destino contiene otra entrada: '+f.ruta);if(hash(p)===f.sha256)plan.iguales++;else{if(!conocidos.has(f.ruta.toLowerCase())&&!adoptar)throw error('COLISION_PERSONAL','Archivo no registrado: '+f.ruta);plan.cambiar.push(f.ruta);}}}
 for(const r of reg.archivos)if(!set.has(r.toLowerCase())&&fs.existsSync(sinEnlaces(join(destino,r))))plan.retirar.push(r);
 const informe={origen,destino,motor:{anterior:actual,nueva:m.motor},...plan,modo};if(simular)return {...informe,simular:true,aplicado:false};
 if(!plan.agregar.length&&!plan.cambiar.length&&!plan.retirar.length&&!_memoriaPreparada)return {...informe,aplicado:false};
 const liberar=tomar(destino);let j,terminado=false;
 try{
  // Releer bajo el candado: un escritor pudo cambiar de versión entre el plan y su aplicación.
  if(versionMemoria(destino,m.memoria)!==v)throw error('MEMORIA_CAMBIO','La versión de Memoria cambió; repetir la petición');
  if(comprobarArranque){const e=lecturaArranque(join(origen,'Motor'),_memoriaPreparada??join(destino,'Memoria'));if(!e.cabe)throw error('ARRANQUE_GRANDE','El arranque supera el presupuesto; no se actualizó');informe.arranque={tokensMind:e.tokensMind,tokensEstimados:e.tokensEstimados,cabe:e.cabe};if(modo!=='reparar')informe.eventosLeidos=lecturaCompatible(origen,_memoriaPreparada?dirname(_memoriaPreparada):destino);}
  const id=randomUUID(),respaldo='Motor/.respaldos/'+id,bp=join(destino,respaldo);fs.mkdirSync(bp,{recursive:true});const afectados=[...plan.cambiar,...plan.retirar,...plan.agregar];
  j={formato:1,token:leer(join(destino,LOCK)).token,pid:process.pid,host:hostname(),respaldo,fase:'preparada',registroAnterior:fs.existsSync(join(destino,REGISTRO)),archivos:[]};
  for(const r of afectados){const p=sinEnlaces(join(destino,r)),existia=fs.existsSync(p),f={ruta:r,existia,shaNueva:nuevos.find(x=>x.ruta===r)?.sha256??null};if(plan.agregar.includes(r)&&existia)throw error('COLISION_PERSONAL','Una entrada nueva apareció durante la preparación: '+r);if(existia){incidencia?.('antes-respaldo',r);f.shaAnterior=hash(p);fs.mkdirSync(dirname(join(bp,r)),{recursive:true});fs.copyFileSync(p,join(bp,r));if(hash(join(bp,r))!==f.shaAnterior)throw error('RESPALDO_INVALIDO','Copia previa distinta');}j.archivos.push(f);}
  if(j.registroAnterior){fs.mkdirSync(dirname(join(bp,REGISTRO)),{recursive:true});fs.copyFileSync(join(destino,REGISTRO),join(bp,REGISTRO));j.hashRegistro=hash(join(bp,REGISTRO));}
  if(_memoriaPreparada)j.memoria=true;atomico(join(destino,JOURNAL),j);incidencia?.('preparada',j);
  for(const r of [...plan.agregar,...plan.cambiar]){atomico(sinEnlaces(join(destino,r)),fs.readFileSync(sinEnlaces(join(origen,r))));incidencia?.('archivo',r);}
  for(const r of plan.retirar){fs.unlinkSync(sinEnlaces(join(destino,r)));incidencia?.('retirado',r);}
  if(_memoriaPreparada){fs.renameSync(join(destino,'Memoria'),join(bp,'Memoria-original'));incidencia?.('memoria-apartada');fs.renameSync(_memoriaPreparada,join(destino,'Memoria'));incidencia?.('memoria-activada');}
  comprobarPaquete(destino,m);atomico(join(destino,REGISTRO),{formato:1,motor:m.motor,archivos:nuevos.map(f=>f.ruta),hashes:Object.fromEntries(nuevos.map(f=>[f.ruta,f.sha256]))});
  j.fase='confirmada';atomico(join(destino,JOURNAL),j);terminado=true;fs.unlinkSync(join(destino,JOURNAL));const retencion=podarRespaldos(destino,id);return {...informe,aplicado:true,respaldo:bp,retencion,memoriaConservada:!_memoriaPreparada,adaptada:Boolean(_memoriaPreparada),nota:modo==='reparar'?'Archivos oficiales restaurados; copias locales conservadas. La reparación del Motor no certifica datos personales dañados.':'Solo se sustituyeron archivos oficiales.'};
 }catch(e){if(j&&fs.existsSync(join(destino,JOURNAL))){try{restaurar(destino,j);fs.unlinkSync(join(destino,JOURNAL));e.restaurado=true;e.message+='; se restauró el Motor anterior';}catch(f){e.recuperacionPendiente=true;e.message+='; recuperación pendiente: '+f.message;}}throw e;}
 finally{if(terminado||!fs.existsSync(join(destino,JOURNAL)))liberar();}
}
if(process.argv[1]&&resolve(process.argv[1]).toLowerCase()===fileURLToPath(import.meta.url).toLowerCase()){
 try{const args=process.argv.slice(2),destino=args.find(a=>!a.startsWith('--'));if(!destino)throw Error('Uso: actualizar.mjs <Mind> [--simular] [--adoptar]');const origen=resolve(dirname(fileURLToPath(import.meta.url)),'..');console.log(JSON.stringify(actualizar({origen,destino,simular:args.includes('--simular'),adoptar:args.includes('--adoptar')}),null,2));}catch(e){console.error(JSON.stringify({codigo:e.codigo??'ERROR',error:e.message,detalle:e.detalle}));process.exitCode=2;}
}
