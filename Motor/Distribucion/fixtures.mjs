import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {generateKeyPairSync} from 'node:crypto';
import {createServer} from 'node:http';
import {META,REGISTRO,CONFIANZA,hash,leer,atomico,inventario,canonico,sha,firmar,verificarSobre} from './contrato.mjs';
import {crearZip,leerZip,extraerZip} from './zip.mjs';
import {prepararManifiesto,construirPublicacion} from './construir.mjs';
import {actualizar,revisar,recuperar} from '../actualizar.mjs';
import {inicio,consultar,compararVersion} from './canal.mjs';
import {adaptarYActualizar,comprobarConservacion} from './adaptar-publicacion.mjs';
import {arquitecturaNativa} from './gestionar.mjs';
import {abrirTablas} from '../Funciones/Base/Tablas/tablas.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const temporal=()=>fs.mkdtempSync(join(tmpdir(),'mind-b5-prueba-'));
const escribir=(p,s)=>{fs.mkdirSync(dirname(p),{recursive:true});fs.writeFileSync(p,s);};
export function fuente(version='2.0.0-dev.18',memoria=3){const r=temporal(),lista=leer(join(root,'Motor/Distribucion/archivos.json')).archivos.filter(p=>!p.startsWith('Motor/Runtime/'));for(const p of lista)escribir(join(r,p),fs.readFileSync(join(root,p)));atomico(join(r,'Motor/Distribucion/archivos.json'),{formato:1,archivos:lista});atomico(join(r,CONFIANZA),{canal:null,formato:1,claves:{},estado:'sin-publicar'});atomico(join(r,'Motor/version.json'),{motor:version,memoria});prepararManifiesto(r);return r;}
export function instalar(origen){const d=temporal();actualizar({origen,destino:d});return d;}
export function personal(d,nombre='Persona'){const t=abrirTablas(join(d,'Memoria')).inicializar(),p=t.alta('proyectos',{tipo:'proyecto',nombre,descripcion:'Contenido privado ñ',estado:'activo'});const f=t.alta('proyectos',{tipo:'frente',nombre:'Frente '+nombre,proyecto:p.id,estado:'activo',loQueSigue:'Continuar'});t.alta('conceptos',{concepto:'Idea '+nombre,tema:'Prueba'});escribir(join(d,'Memoria/Colecciones/privado.txt'),'Documento de '+nombre);escribir(join(d,'Motor/Funciones/Del usuario/propia/funcion.mjs'),"throw Error('No se ejecuta');");escribir(join(d,'Motor/Capacidades/Del usuario/propia/SKILL.md'),'Habilidad privada');escribir(join(d,'Motor/mi-archivo.txt'),'Mi contenido');escribir(join(d,'notas.txt'),'Notas personales');return {t,p,f};}
export function protegidos(d){const all=inventario(d);return Object.fromEntries(Object.entries(all).filter(([p])=>p.startsWith('Memoria/')||p.includes('/Del usuario/')||p==='Motor/mi-archivo.txt'||p==='notas.txt'));}
function nuevaVersion(origen,v='2.0.0-dev.19'){const r=temporal();fs.cpSync(origen,r,{recursive:true});atomico(join(r,'Motor/version.json'),{motor:v,memoria:3});prepararManifiesto(r);return r;}


