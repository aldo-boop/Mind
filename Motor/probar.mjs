import * as fs from 'node:fs';import {join,dirname} from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';import {tmpdir} from 'node:os';
const root=dirname(fileURLToPath(import.meta.url));
const buscar=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?buscar(join(d,e.name)):e.name.endsWith('pruebas.mjs')?[join(d,e.name)]:[]);
const archivos=[...buscar(join(root,'Funciones/Base')),join(root,'actualizar-pruebas.mjs'),join(root,'ejecutar-pruebas.mjs'),join(root,'Distribucion/pruebas.mjs'),join(root,'Distribucion/windows-pruebas.mjs'),join(root,'Distribucion/revision-pruebas.mjs')];
// Cada ejecución usa su propia carpeta temporal y la borra al terminar: los Minds ficticios no se acumulan en TEMP.
const temporal=fs.mkdtempSync(join(tmpdir(),'mind-pruebas-')),env={...process.env,TMP:temporal,TEMP:temporal,TMPDIR:temporal};
try{const r=spawnSync(process.execPath,['--test',...archivos],{encoding:'utf8',windowsHide:true,maxBuffer:20*1024*1024,env});process.stdout.write(r.stdout??'');process.stderr.write(r.stderr??'');process.exitCode=r.status??1;}
finally{try{fs.rmSync(temporal,{recursive:true,force:true,maxRetries:5,retryDelay:200});}catch(e){process.stderr.write('No se pudo borrar '+temporal+': '+e.message+'\n');}}
