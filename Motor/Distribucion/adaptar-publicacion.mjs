import * as fs from 'node:fs';
import {join,resolve,relative} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {comprobarPaquete,inventario,canonico,leer,error,sinEnlaces} from './contrato.mjs';
import {actualizar} from '../actualizar.mjs';
const omitir=r=>r.endsWith('.lock');
function eventos(p){return fs.readFileSync(p,'utf8').split('\n').filter(x=>x.trim()).map(x=>JSON.parse(x));}
export function comprobarConservacion(original,candidato){
 const antes=inventario(original,{omitir}),despues=inventario(candidato,{omitir});let total=0;
 for(const [r,h]of Object.entries(antes)){
  if(/^Tablas\/(?:perfil|proyectos|decisiones|colecciones|conceptos)(?:\/[^/]+)?\.jsonl$/.test(r)){
   const a=eventos(join(original,r)),b=eventos(join(candidato,r));if(a.length!==b.length)throw error('DATOS_NO_CONSERVADOS','Cambió el número de eventos: '+r);
   for(let i=0;i<a.length;i++){for(const [k,v]of Object.entries(a[i]))if(k!=='fila'&&JSON.stringify(b[i][k])!==JSON.stringify(v))throw error('DATOS_NO_CONSERVADOS','Cambió un atributo del evento: '+r+':'+k);for(const [k,v]of Object.entries(a[i].fila))if(JSON.stringify(b[i].fila[k])!==JSON.stringify(v))throw error('DATOS_NO_CONSERVADOS','Cambió información original: '+r+':'+k);total++;}
  }else if(r==='version.json'||r==='.vista-pendiente.json'||/^Tablas\/(?:perfil|proyectos|decisiones|colecciones|conceptos)(?:\/[^/]+)?\.csv$/.test(r)||(r.startsWith('Vistas/')||r.startsWith('Tablas/'))&&r.endsWith('.md')&&fs.readFileSync(join(original,r),'utf8').startsWith('<!-- mind:vista-derivada -->'))continue;
  else if(despues[r]!==h)throw error('DATOS_NO_CONSERVADOS','Archivo personal no conservado: '+r);
 }
 return {eventos:total,archivos:Object.keys(antes).length,conservacion:'Todas las columnas originales, eventos y archivos no derivados conservados'};
}
// `adoptar` (explícito) permite pasar un Mind anterior sin recibo: sus archivos oficiales previos se respaldan y se reemplazan.
// `simular` devuelve el plan (incluidos los archivos que se adoptarían) sin copiar ni escribir nada.
export async function adaptarYActualizar({origen,destino,confirmadoPorPersona=false,adoptar=false,simular=false,incidencia}={}){
 if(confirmadoPorPersona!==true)throw error('AUTORIZACION_REQUERIDA','Adaptar esta Memoria necesita autorización explícita, aunque la política de actualización sea automática');
 origen=sinEnlaces(resolve(origen));destino=sinEnlaces(resolve(destino));const m=comprobarPaquete(origen),memoria=sinEnlaces(join(destino,'Memoria'));
 if(!fs.existsSync(memoria))return actualizar({origen,destino,adoptar,simular});
 // Plan previo: una colisión o un destino inválido se detienen antes de copiar datos personales.
 const plan=actualizar({origen,destino,adoptar,simular:true,_memoriaPreparada:true});if(simular)return {...plan,adaptacionPendiente:true,nota:'Simulación: no se copió ni escribió nada.'};
 for(const r of ['.escritura.lock','.adaptacion.lock','Tablas/.escritura.lock'])if(fs.existsSync(join(memoria,r)))throw error('MEMORIA_OCUPADA','La Memoria tiene trabajo activo');
 const antes=inventario(memoria,{omitir}),taller=fs.mkdtempSync(join(tmpdir(),'mind-adaptacion-publicacion-')),candidato=join(taller,'Memoria');
 // La copia de trabajo contiene datos personales: se borra siempre al terminar, con éxito o sin él.
 try{fs.cpSync(memoria,candidato,{recursive:true,errorOnExist:true,force:false});
 if(canonico(inventario(candidato,{omitir}))!==canonico(antes))throw error('DATOS_CAMBIARON','La copia previa no coincide');
 // Solo transformadores oficiales del candidato comprobado; no se aceptan funciones ni mapeos enviados por JSON.
 const {adaptarEsqueleto}=await import(pathToFileURL(join(origen,'Motor/Funciones/Base/Adaptar/migrar.mjs')).href);
 const adaptacion=adaptarEsqueleto(join(origen,'Motor'),candidato),prueba=comprobarConservacion(memoria,candidato);
 if(leer(join(candidato,'version.json')).memoria!==m.memoria)throw error('ADAPTACION_INVALIDA','El candidato no tiene el esquema esperado');
 const r=actualizar({origen,destino,adoptar,_memoriaPreparada:candidato,incidencia:(paso,dato)=>{if(paso==='preparada'&&canonico(inventario(memoria,{omitir}))!==canonico(antes))throw error('DATOS_CAMBIARON','La Memoria cambió durante la preparación; no se activa');incidencia?.(paso,dato);}});
 return {...r,adaptacion,prueba,nota:'Esqueleto adaptado con autorización. La Memoria original queda en el respaldo; el contenido fue cotejado antes de activar.'};
 }finally{fs.rmSync(taller,{recursive:true,force:true});}
}
