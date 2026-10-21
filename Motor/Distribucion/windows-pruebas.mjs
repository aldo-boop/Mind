import test from 'node:test';import assert from 'node:assert/strict';import * as fs from 'node:fs';import {join,dirname} from 'node:path';import {fileURLToPath} from 'node:url';import {tmpdir} from 'node:os';import {spawnSync} from 'node:child_process';
import {prepararManifiesto} from './construir.mjs';import {META,REGISTRO,leer,hash} from './contrato.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
test('Windows real: paquete movido, PowerShell 5.1, JSON UTF-8 y ausencia de Node en PATH', {skip:process.platform!=='win32'},()=>{
 const m=prepararManifiesto(root),base=fs.mkdtempSync(join(tmpdir(),'mind-portatil-')),destino=join(base,'Carpeta Mind ñ & espacios');fs.mkdirSync(destino);
 for(const r of [...m.archivos.map(x=>x.ruta),META]){const p=join(destino,r);fs.mkdirSync(dirname(p),{recursive:true});fs.copyFileSync(join(root,r),p);}
 fs.writeFileSync(join(destino,REGISTRO),JSON.stringify({formato:1,motor:m.motor,archivos:[...m.archivos.map(x=>x.ruta),META],hashes:{...Object.fromEntries(m.archivos.map(x=>[x.ruta,x.sha256])),[META]:hash(join(root,META))}}));
 const global=join(base,'Node distinto');fs.mkdirSync(global);fs.writeFileSync(join(global,'node.cmd'),'@echo off\r\necho NO_DEBE_EJECUTARSE\r\nexit /b 55\r\n');const pathOriginal=process.env.PATH;
 const pedido=join(base,'pedido ñ & símbolo.json'),ps=join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
 const llamar=(dir,op,path=global)=>{fs.writeFileSync(pedido,'\uFEFF'+JSON.stringify(op));const r=spawnSync(ps,['-NoLogo','-NoProfile','-NonInteractive','-Command','& $env:MIND_LANZADOR; exit $LASTEXITCODE'],{env:{...process.env,PATH:path,MIND_LANZADOR:join(dir,'Mind.cmd'),MIND_PEDIDO:pedido},encoding:'utf8',windowsHide:true,timeout:30000});assert.equal(r.status,0,r.stderr||r.error?.message);return JSON.parse(r.stdout.replace(/^\uFEFF/,''));};
 const alta=llamar(destino,{operacion:'ejecutar',accion:'alta',datos:{tabla:'conceptos',fila:{concepto:'Armonía 🌙',tema:'Música'}}});assert.equal(alta.resultado.concepto,'Armonía 🌙');assert.equal(process.env.PATH,pathOriginal);
 const nuevo=join(base,'Movido a otra carpeta ó & datos');fs.renameSync(destino,nuevo);
 const buscar=llamar(nuevo,{operacion:'ejecutar',accion:'buscar',datos:{tabla:'conceptos',texto:'armonía'}},pathOriginal);assert.equal(buscar.resultado.filas[0].fila.concepto,'Armonía 🌙');assert.equal(process.env.PATH,pathOriginal);
 const bin=fs.readFileSync(join(nuevo,'Motor/Runtime/win32-arm64/node.exe')),offset=bin.readUInt32LE(0x3c);assert.equal(bin.readUInt16LE(offset+4),0xaa64); // Inspección ARM64, no ejecución.
});
