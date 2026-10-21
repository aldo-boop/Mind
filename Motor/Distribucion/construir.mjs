import * as fs from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {META,REGISTRO,oficial,sinEnlaces,hash,sha,leer,atomico,firmar,error,dentro} from './contrato.mjs';
import {crearZip} from './zip.mjs';
export function prepararManifiesto(origen){
 const lista=leer(join(origen,'Motor/Distribucion/archivos.json'));if(lista.formato!==1||!Array.isArray(lista.archivos))throw error('LISTA_INVALIDA','Falta el listado explícito de archivos oficiales');
 const vistos=new Set(),archivos=lista.archivos.map(r=>{oficial(r);if(vistos.has(r.toLowerCase())||r===META)throw error('LISTA_INVALIDA','Archivo duplicado o reservado');vistos.add(r.toLowerCase());const p=sinEnlaces(join(origen,r));if(!fs.lstatSync(p).isFile())throw error('LISTA_INVALIDA','No es archivo oficial: '+r);return {ruta:r,bytes:fs.statSync(p).size,sha256:hash(p)};}).sort((a,b)=>a.ruta.localeCompare(b.ruta,'en'));
 const v=leer(join(origen,'Motor/version.json')),m={formato:1,motor:v.motor,memoria:v.memoria,archivos};atomico(join(origen,META),m);return m;
}
// El paquete es para cualquier persona: ningún texto oficial puede llevar rutas de un perfil ni palabras privadas del taller.
// La lista privada vive fuera del taller y se recibe al construir; así la comprobación no copia esas palabras al Motor.
export function comprobarSinDatosPersonales(mapa,privadas=[]){
 const patrones=[/[a-z]:[\\/]+users[\\/]+[^\\/\s'"`]+/i,/\/(?:users|home)\/[^/\s'"`]+\//i,/[\w.+-]+@[\w-]+\.[\w.]+/,...privadas.filter(x=>typeof x==='string'&&x.trim()).map(x=>new RegExp('(?<![\\p{L}\\p{N}])'+x.trim().replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?![\\p{L}\\p{N}])','iu'))];
 for(const [ruta,b] of mapa){if(/\.(exe|dll|zip)$/i.test(ruta)||ruta.endsWith('/LICENSE'))continue;const t=b.toString('utf8');const p=patrones.find(x=>x.test(t));if(p)throw error('DATOS_PERSONALES','El paquete contiene información personal o del taller: '+ruta);}
}
export function construirPublicacion({origen,salida,clave,privada,secuencia=1,publicado='2026-10-19T00:00:00.000Z',vence,urlPaquete,privadas=[]}={}){
 origen=resolve(origen);salida=resolve(salida);if(fs.existsSync(join(origen,'Memoria')))throw error('ORIGEN_INVALIDO','No se empaqueta una instalación personal');
 const m=prepararManifiesto(origen),mapa=new Map(m.archivos.map(f=>[f.ruta,fs.readFileSync(join(origen,f.ruta))]));mapa.set(META,fs.readFileSync(join(origen,META)));
 comprobarSinDatosPersonales(mapa,privadas);
 // Un descriptor firmado vence a los 180 días salvo otra fecha explícita.
 vence??=new Date(Date.parse(publicado)+180*864e5).toISOString();if(!(Date.parse(vence)>Date.parse(publicado)))throw error('PUBLICACION_INVALIDA','El vencimiento debe ser posterior a la publicación');
 const archivos=[...m.archivos.map(f=>f.ruta),META],hashes={...Object.fromEntries(m.archivos.map(f=>[f.ruta,f.sha256])),[META]:hash(join(origen,META))};
 mapa.set(REGISTRO,Buffer.from(JSON.stringify({formato:1,motor:m.motor,archivos,hashes},null,2)+'\n'));
 const zip=crearZip(mapa),nombre='Mind-'+m.motor+'-Windows.zip';fs.mkdirSync(salida,{recursive:true});const p=join(salida,nombre);
 if(fs.existsSync(p)&&hash(p)!==sha(zip))throw error('VERSION_INMUTABLE','Ya existe otra publicación con este nombre; incrementar la versión');atomico(p,zip);
 const publicacion={formato:1,motor:m.motor,memoria:m.memoria,secuencia,publicado,vence,paquete:{url:urlPaquete??nombre,sha256:sha(zip),bytes:zip.length},manifiesto:m};
 if(privada){if(!clave||!Number.isSafeInteger(secuencia)||secuencia<1)throw error('PUBLICACION_INVALIDA','Falta identidad o secuencia');atomico(join(salida,'canal.json'),firmar(publicacion,clave,privada));}
 atomico(join(salida,nombre+'.contenido.json'),{motor:m.motor,memoria:m.memoria,bytes:zip.length,sha256:sha(zip),archivos:[...mapa].map(([ruta,b])=>({ruta,bytes:b.length,sha256:sha(b)})),firmada:Boolean(privada)});
 return {paquete:p,motor:m.motor,bytes:zip.length,sha256:sha(zip),firmada:Boolean(privada),publicacion};
}
if(process.argv[1]&&resolve(process.argv[1]).toLowerCase()===fileURLToPath(import.meta.url).toLowerCase()){
 try{const archivo=process.argv[2];if(!archivo)throw Error('Uso: construir.mjs <pedido.json>');const op=leer(archivo);if(op.privada)throw Error('La clave privada se recibe por archivo separado, nunca dentro del pedido');const privada=op.archivoClave?fs.readFileSync(sinEnlaces(op.archivoClave),'utf8'):undefined;if(op.archivoClave&&dentro(resolve(op.origen),resolve(op.archivoClave)))throw Error('La clave privada no vive dentro del taller distribuible');if(op.archivoPrivadas&&dentro(resolve(op.origen),resolve(op.archivoPrivadas)))throw Error('La lista privada no vive dentro del taller distribuible');const privadas=op.archivoPrivadas?fs.readFileSync(sinEnlaces(resolve(op.archivoPrivadas)),'utf8').replace(/^﻿/,'').split(/\r?\n/).map(x=>x.trim()).filter(x=>x&&!x.startsWith('#')):[];const prueba=join(resolve(op.origen),'Motor/probar.mjs');if(!fs.existsSync(prueba))throw Error('Publicar exige el taller con su suite oficial');const validacion=spawnSync(process.execPath,[prueba],{encoding:'utf8',windowsHide:true,maxBuffer:20*1024*1024});if(validacion.status!==0)throw Error('Pruebas del Motor fallidas; no se empaquetó: '+(validacion.stdout+validacion.stderr).slice(-2500));fs.mkdirSync(resolve(op.salida),{recursive:true});atomico(join(resolve(op.salida),'validacion.txt'),validacion.stdout+validacion.stderr);const r=construirPublicacion({...op,privada,privadas});console.log(JSON.stringify({...r,publicacion:undefined},null,2));}catch(e){console.error(JSON.stringify({codigo:e.codigo??'ERROR',error:e.message}));process.exitCode=2;}
}
