// Entrada independiente de las funciones de Memoria: permite reparar el núcleo antes de cargarlo.
import * as fs from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {hostname} from 'node:os';
import {randomUUID} from 'node:crypto';
import {leer,error,oficial,comprobarPaquete,CONFIANZA} from './contrato.mjs';
import {inicio,prepararAdaptacionDesdeCanal} from './canal.mjs';
import {actualizar,revisar,recuperar} from '../actualizar.mjs';
import {adaptarYActualizar} from './adaptar-publicacion.mjs';
export function arquitecturaNativa(valor){const a=String(valor).toLowerCase();if(['amd64','x64'].includes(a))return 'x64';if(['arm64','aarch64'].includes(a))return 'arm64';throw error('ARQUITECTURA_NO_ADMITIDA','Mind admite Windows x64 y ARM64');}
export async function gestionar(raiz,pedido){
 const op=pedido??{operacion:'inicio'};if(!op||typeof op!=='object'||Array.isArray(op))throw error('PEDIDO_INVALIDO','El pedido debe ser un objeto JSON');
 if(op.operacion==='inicio')return inicio({destino:raiz});
 if(op.operacion==='recuperar')return recuperar(op.destino?resolve(op.destino):raiz);
 if(op.operacion==='revisar')return revisar({origen:raiz,destino:op.destino?resolve(op.destino):raiz});
 if(['actualizar-local','reparar-local'].includes(op.operacion)){if(!op.destino)throw error('PEDIDO_INVALIDO','Falta el destino de actualización');return actualizar({origen:raiz,destino:resolve(op.destino),modo:op.operacion==='reparar-local'?'reparar':'actualizar',simular:op.simular===true,adoptar:op.adoptar===true});}
 if(op.operacion==='adaptar-actualizacion'){
  if(op.confirmadoPorPersona!==true)throw error('AUTORIZACION_REQUERIDA','Adaptar necesita confirmación explícita para esta Memoria');
  const d=await prepararAdaptacionDesdeCanal({destino:raiz});if(!d.origen)return d;
  // La descarga verificada vive en TEMP solo mientras dura la operación.
  try{return await adaptarYActualizar({origen:d.origen,destino:raiz,confirmadoPorPersona:true,adoptar:op.adoptar===true,simular:op.simular===true});}finally{fs.rmSync(d.origen,{recursive:true,force:true});}
 }
 if(op.operacion==='adaptar-local'){if(!op.destino)throw error('PEDIDO_INVALIDO','Falta el destino');return adaptarYActualizar({origen:raiz,destino:resolve(op.destino),confirmadoPorPersona:op.confirmadoPorPersona===true,adoptar:op.adoptar===true,simular:op.simular===true});}
 if(op.operacion==='ejecutar'){
  if(typeof op.accion!=='string'||!['inicializar','buscar','alta','actualizar','retirar','rama','recordar','seguridad','frente','proyecto','cambiar','uso','operaciones','liberar','coleccion'].includes(op.accion))throw error('PEDIDO_INVALIDO','Acción no admitida');
  // El canal se consulta solo en la operación inicio, al empezar a usar Mind; cada acción comprueba recuperación y candados locales.
  recuperar(raiz);
  if(fs.existsSync(join(raiz,'Motor/.actualizando.lock')))throw error('ACTUALIZACION_OCUPADA','Actualización en curso; repetir al terminar');
  const sesion=join(raiz,'Motor/.sesion-activa.json'),token=randomUUID();let fd;try{fd=fs.openSync(sesion,'wx');}catch{throw error('TRABAJO_ACTIVO','Otra operación está activa; repetir al terminar');}try{fs.writeFileSync(fd,JSON.stringify({tipo:'mind-sesion',token,pid:process.pid,host:hostname()}));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  try{if(fs.existsSync(join(raiz,'Motor/.actualizando.lock')))throw error('ACTUALIZACION_OCUPADA','Comenzó una actualización; repetir al terminar');
  // Los datos viajan por la entrada estándar: la línea de comandos de Windows se corta en 32.767 caracteres.
  const r=spawnSync(process.execPath,[join(raiz,'Motor/ejecutar.mjs'),op.accion,join(raiz,'Memoria'),'-'],{cwd:raiz,encoding:'utf8',windowsHide:true,input:JSON.stringify(op.datos??{}),maxBuffer:64*1024*1024});
  if(r.error)throw error('FUNCION_FALLIDA','No se pudo ejecutar la función: '+r.error.message);
  let datos;try{datos=JSON.parse(r.stdout);}catch{}
  if(r.status!==0)throw error('FUNCION_FALLIDA',(r.stderr??'').trim()||'La función no terminó',datos);return {resultado:datos};
  }finally{if(fs.existsSync(sesion)&&leer(sesion).token===token)fs.unlinkSync(sesion);}
 }
 throw error('PEDIDO_INVALIDO','Operación no admitida');
}
if(process.argv[1]&&resolve(process.argv[1]).toLowerCase()===fileURLToPath(import.meta.url).toLowerCase()){
 try{const raiz=resolve(process.argv[2]),archivo=process.argv[3],entrada=archivo?null:(process.stdin.isTTY?'':fs.readFileSync(0,'utf8').replace(/^\uFEFF/,'')),op=archivo?leer(resolve(archivo)):entrada?.trim()?JSON.parse(entrada):undefined;console.log(JSON.stringify(await gestionar(raiz,op),null,2));}catch(e){console.error(JSON.stringify({codigo:e.codigo??'ERROR',error:e.message,detalle:e.detalle,recuperacionPendiente:e.recuperacionPendiente}));process.exitCode=2;}
}
