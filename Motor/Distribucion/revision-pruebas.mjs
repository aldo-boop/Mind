// Regresiones de la revisión independiente del Bloque 5 (B5-1 a B5-9). Minds ficticios en carpetas temporales.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {generateKeyPairSync} from 'node:crypto';
import {createServer} from 'node:http';
import {META,REGISTRO,CONFIANZA,hash,leer,atomico,inventario} from './contrato.mjs';
import {prepararManifiesto,construirPublicacion,comprobarSinDatosPersonales} from './construir.mjs';
import {actualizar} from '../actualizar.mjs';
import {inicio} from './canal.mjs';
import {adaptarYActualizar} from './adaptar-publicacion.mjs';
import {gestionar} from './gestionar.mjs';
import {abrirTablas} from '../Funciones/Base/Tablas/tablas.mjs';
import {fuente,instalar,personal} from './fixtures.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const temporal=n=>fs.mkdtempSync(join(tmpdir(),'mind-b5-revision-'+n+'-'));
const escribir=(p,s)=>{fs.mkdirSync(dirname(p),{recursive:true});fs.writeFileSync(p,s);};
const restos=prefijo=>fs.readdirSync(tmpdir()).filter(n=>n.startsWith(prefijo)).length;
function version(origen,v){const r=temporal('version');fs.cpSync(origen,r,{recursive:true});atomico(join(r,'Motor/version.json'),{motor:v,memoria:3});prepararManifiesto(r);return r;}

// Mind anterior: archivos oficiales con otro contenido, sin recibo ni manifiesto, Memoria esquema 1 y piezas propias.
function mindAnterior(a){
 const d=temporal('anterior');
 for(const f of leer(join(a,META)).archivos)escribir(join(d,f.ruta),Buffer.concat([fs.readFileSync(join(a,f.ruta)),Buffer.from(f.ruta.endsWith('.mjs')?'\n// versión anterior\n':'\nVersión anterior.\n')]));
 escribir(join(d,'Motor/Funciones/Base/Tablas/pruebas-anteriores.mjs'),'// prueba de una versión anterior');
 const m=join(d,'Memoria'),ev=f=>JSON.stringify({operacion:'poner',fila:{fecha:'2026-10-01T00:00:00.000Z',vigencia:'vigente',...f}})+'\n';
 escribir(join(m,'Tablas/proyectos.jsonl'),ev({id:'pA',tipo:'proyecto',nombre:'Proyecto ficticio ñ',estado:'activo'})+ev({id:'fA',tipo:'frente',nombre:'Frente ficticio',proyecto:'pA',estado:'activo',loQueSigue:'Seguir'}));
 escribir(join(m,'Tablas/colecciones.jsonl'),ev({id:'cA',nombre:'Colección A',direccion:'D:/A',conectadoA:['pA'],rama:'a-aaaaaa'}));
 escribir(join(m,'Tablas/colecciones/a-aaaaaa.jsonl'),ev({id:'e1',nombre:'uno.txt',direccion:'D:/A/uno.txt'}));
 escribir(join(m,'Colecciones/privado.txt'),'Documento privado');atomico(join(m,'version.json'),{memoria:1});
 escribir(join(d,'Motor/Funciones/Del usuario/propia/funcion.mjs'),"throw Error('No se ejecuta');");escribir(join(d,'notas.txt'),'Notas personales');
 return d;
}
const propios=d=>Object.fromEntries(Object.entries(inventario(d)).filter(([p])=>p.includes('/Del usuario/')||p==='notas.txt'||p==='Memoria/Colecciones/privado.txt'||p.endsWith('pruebas-anteriores.mjs')));

test('B5-1: un Mind anterior sin recibo y con esquema 1 pasa a la versión actual con adopción y adaptación autorizadas',async()=>{
 const a=fuente(),d=mindAnterior(a),antes=inventario(d),propiosAntes=propios(d),restosAntes=restos('mind-adaptacion-publicacion-');
 // Sin adopción explícita se detiene antes de copiar datos personales a TEMP.
 await assert.rejects(adaptarYActualizar({origen:a,destino:d,confirmadoPorPersona:true}),e=>e.codigo==='COLISION_PERSONAL');
 assert.deepEqual(inventario(d),antes);assert.equal(restos('mind-adaptacion-publicacion-'),restosAntes);
 // La simulación muestra qué se reemplazaría sin escribir nada.
 const plan=await gestionar(a,{operacion:'adaptar-local',destino:d,confirmadoPorPersona:true,adoptar:true,simular:true});
 assert.equal(plan.simular,true);assert.ok(plan.cambiar.includes('Bienvenida.md')&&plan.cambiar.includes('Motor/ejecutar.mjs'));assert.deepEqual(inventario(d),antes);
 const r=await gestionar(a,{operacion:'adaptar-local',destino:d,confirmadoPorPersona:true,adoptar:true});
 assert.equal(r.aplicado,true);assert.equal(r.adaptada,true);assert.equal(leer(join(d,'Memoria/version.json')).memoria,3);
 const t=abrirTablas(join(d,'Memoria'));assert.deepEqual(t.leer('proyectos').map(x=>x.id).sort(),['fA','pA']);assert.equal(t.leer('proyectos').find(x=>x.id==='pA').nombre,'Proyecto ficticio ñ');
 assert.deepEqual(t.leer('colecciones',{rama:'a-aaaaaa'}).map(x=>x.id),['e1']);
 assert.deepEqual(propios(d),propiosAntes);assert.equal(hash(join(d,'Motor/ejecutar.mjs')),hash(join(a,'Motor/ejecutar.mjs')));
 assert.ok(fs.readFileSync(join(r.respaldo,'Motor/ejecutar.mjs'),'utf8').includes('versión anterior'));
 assert.ok(fs.existsSync(join(r.respaldo,'Memoria-original/Tablas/proyectos.jsonl')));
 assert.equal(restos('mind-adaptacion-publicacion-'),restosAntes,'la copia de trabajo con datos personales no queda en TEMP');
 assert.equal(fs.existsSync(join(d,REGISTRO)),true);
});

test('B5-2: adaptar cuando el Motor ya está en la versión nueva (ZIP descomprimido encima) no falla',async()=>{
 const a=fuente(),d=instalar(a);personal(d);atomico(join(d,'Memoria/version.json'),{memoria:2});
 const r=await adaptarYActualizar({origen:a,destino:d,confirmadoPorPersona:true});
 assert.equal(r.aplicado,true);assert.equal(r.adaptada,true);assert.equal(leer(join(d,'Memoria/version.json')).memoria,3);
 assert.ok(abrirTablas(join(d,'Memoria')).leer('proyectos').length>=2);
});

test('B5-3: los respaldos de Motor se podan a tres; los que guardan una Memoria original se conservan',()=>{
 let a=fuente(),d=instalar(a);personal(d);
 const conMemoria=join(d,'Motor/.respaldos','00000000-0000-0000-0000-000000000000');escribir(join(conMemoria,'Memoria-original/version.json'),'{"memoria":2}');
 for(let i=19;i<25;i++){a=version(a,'2.0.0-dev.'+i);const r=actualizar({origen:a,destino:d});assert.equal(r.aplicado,true);}
 const dirs=fs.readdirSync(join(d,'Motor/.respaldos'));assert.equal(dirs.filter(x=>!x.startsWith('00000000')).length,3);assert.ok(fs.existsSync(conMemoria));
});

test('B5-3 y B5-9: el canal borra la descarga, recuerda la secuencia vista y rechaza un descriptor vencido',async()=>{
 const archivos=new Map(),srv=createServer((q,s)=>{const b=archivos.get(q.url);if(!b){s.writeHead(404);return s.end();}s.writeHead(200,{'Content-Length':b.length});s.end(b);});
 await new Promise(r=>srv.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+srv.address().port;
 try{
  const k=generateKeyPairSync('ed25519'),publica=k.publicKey.export({type:'spki',format:'pem'}),privada=k.privateKey.export({type:'pkcs8',format:'pem'});
  const a=fuente();atomico(join(a,CONFIANZA),{formato:1,canal:url+'/canal.json',claves:{prueba:publica}});prepararManifiesto(a);const d=instalar(a);personal(d);
  const publicar=(origen,opciones)=>{const salida=temporal('salida'),r=construirPublicacion({origen,salida,clave:'prueba',privada,...opciones});archivos.set('/canal.json',fs.readFileSync(join(salida,'canal.json')));archivos.set('/'+'Mind-'+r.motor+'-Windows.zip',fs.readFileSync(r.paquete));return r;};
  const b=version(a,'2.0.0-dev.30');publicar(b,{secuencia:2,publicado:new Date().toISOString()});
  const antes=restos('mind-publicacion-'),r=await inicio({destino:d,permitirLocal:true});
  assert.equal(r.estado,'actualizado');assert.equal(restos('mind-publicacion-'),antes,'el paquete descargado no queda en TEMP');
  assert.equal(leer(join(d,'Motor/.canal-estado.json')).secuencia,2);
  // Sin novedades también se registra la secuencia vista.
  publicar(b,{secuencia:3,publicado:new Date().toISOString()});assert.equal((await inicio({destino:d,permitirLocal:true})).estado,'sin-novedades');assert.equal(leer(join(d,'Motor/.canal-estado.json')).secuencia,3);
  // Un descriptor vencido no se aplica.
  const c=version(b,'2.0.0-dev.31');publicar(c,{secuencia:4,publicado:'2025-01-01T00:00:00.000Z',vence:'2025-06-01T00:00:00.000Z'});
  const v=await inicio({destino:d,permitirLocal:true});assert.equal(v.estado,'aplazada');assert.equal(v.codigo,'PUBLICACION_VENCIDA');assert.equal(leer(join(d,'Motor/version.json')).motor,'2.0.0-dev.30');
 }finally{srv.close();}
});

test('B5-5 y B5-6: un pedido largo pasa por la entrada estándar y una acción no consulta el canal',async()=>{
 const a=fuente(),d=instalar(a);abrirTablas(join(d,'Memoria')).inicializar();
 atomico(join(d,CONFIANZA),{formato:1,canal:'https://127.0.0.1:9/canal.json',claves:{}});
 const original=globalThis.fetch;let consultas=0;globalThis.fetch=(...x)=>{consultas++;return original(...x);};
 try{
  const largo='x'.repeat(60000),r=await gestionar(d,{operacion:'ejecutar',accion:'alta',datos:{tabla:'conceptos',fila:{concepto:'Texto largo',tema:'Prueba',sintesis:largo}}});
  assert.equal(r.resultado.sintesis.length,60000);assert.equal(consultas,0);assert.equal(fs.existsSync(join(d,'Motor/.canal-estado.json')),false);
  const b=await gestionar(d,{operacion:'ejecutar',accion:'buscar',datos:{tabla:'conceptos',texto:'texto largo'}});assert.equal(b.resultado.filas[0].fila.sintesis.length,60000);
 }finally{globalThis.fetch=original;}
 const s=spawnSync(process.execPath,[join(d,'Motor/ejecutar.mjs'),'buscar',join(d,'Memoria'),'-'],{input:'\uFEFF{"tabla":"conceptos","texto":"largo"}',encoding:'utf8'});assert.equal(s.status,0,s.stderr);
});

test('B5-7: una versión que solo cambia mayúsculas de una ruta se aplica en Windows',()=>{
 const a=fuente(),d=instalar(a),b=temporal('mayusculas');fs.cpSync(a,b,{recursive:true});
 const vieja='Motor/Funciones/Base/Buscar/Buscar.md',nueva='Motor/Funciones/Base/Buscar/BUSCAR.md';fs.renameSync(join(b,vieja),join(b,vieja+'.x'));fs.renameSync(join(b,vieja+'.x'),join(b,nueva));
 const lista=leer(join(b,'Motor/Distribucion/archivos.json'));lista.archivos=lista.archivos.map(x=>x===vieja?nueva:x);atomico(join(b,'Motor/Distribucion/archivos.json'),lista);
 atomico(join(b,'Motor/version.json'),{motor:'2.0.0-dev.40',memoria:3});prepararManifiesto(b);
 const r=actualizar({origen:b,destino:d});assert.equal(r.aplicado,true);assert.ok(fs.existsSync(join(d,nueva)));assert.ok(leer(join(d,REGISTRO)).archivos.includes(nueva));
});

test('B5-8: el paquete rechaza rutas de perfiles, correos y palabras privadas; el contenido oficial actual está limpio',()=>{
 const mapa=new Map(leer(join(root,'Motor/Distribucion/archivos.json')).archivos.map(r=>[r,fs.readFileSync(join(root,r))]));
 comprobarSinDatosPersonales(mapa);
 for(const malo of ['ver C:\\Users\\alguien\\Desktop','ruta /home/alguien/','escribir a alguien@ejemplo.com'])assert.throws(()=>comprobarSinDatosPersonales(new Map([['Motor/x.md',Buffer.from(malo)]])),e=>e.codigo==='DATOS_PERSONALES');
 assert.throws(()=>comprobarSinDatosPersonales(new Map([['Motor/x.md',Buffer.from('Ejemplo de Empresa Privada')]]),['empresa privada']),e=>e.codigo==='DATOS_PERSONALES');
 assert.doesNotThrow(()=>comprobarSinDatosPersonales(new Map([['Motor/x.md',Buffer.from('Respaldo verificado')]]),['spald']),'una palabra privada no coincide dentro de otra');
});

test('B5-4: una copia temporal de Node incompleta se rehace y las copias de otras versiones se retiran',{skip:process.platform!=='win32'},()=>{
 const t=temporal('runtime'),correr=()=>spawnSync(join(process.env.SystemRoot,'System32/cmd.exe'),['/d','/c',join(root,'Mind.cmd')],{env:{...process.env,TMP:t,TEMP:t},input:'',encoding:'utf8',windowsHide:true,timeout:60000});
 let r=correr();assert.equal(r.status,0,r.stderr);const copia=fs.readdirSync(t).find(n=>/^mind-node-[a-f0-9]{16}\.exe$/.test(n));assert.ok(copia);
 fs.truncateSync(join(t,copia),1000);fs.writeFileSync(join(t,'mind-node-'+'0'.repeat(16)+'.exe'),'otra versión');
 r=correr();assert.equal(r.status,0,r.stderr);assert.ok(fs.statSync(join(t,copia)).size>1000);assert.equal(fs.existsSync(join(t,'mind-node-'+'0'.repeat(16)+'.exe')),false);
});

test('L1: Mind.cmd funciona con una carpeta temporal de ruta larga y explica cuando ya no cabe',{skip:process.platform!=='win32'},()=>{
 const base=temporal('ruta-larga'),correr=dir=>spawnSync(join(process.env.SystemRoot,'System32/cmd.exe'),['/d','/c',join(root,'Mind.cmd')],{env:{...process.env,TMP:dir,TEMP:dir},input:'',encoding:'utf8',windowsHide:true,timeout:60000});
 // Una ruta de unos 180 caracteres: con el nombre anterior de la copia (unos 115 más) superaba el límite de Windows.
 let larga=base;while(larga.length<180)larga=join(larga,'carpeta temporal');fs.mkdirSync(larga,{recursive:true});
 const r=correr(larga);assert.equal(r.status,0,r.stderr);assert.ok(fs.readdirSync(larga).some(n=>/^mind-node-[a-f0-9]{16}\.exe$/.test(n)));
 let excesiva=larga;while(excesiva.length<235)excesiva=join(excesiva,'mas');fs.mkdirSync(excesiva,{recursive:true});
 const e=correr(excesiva);assert.equal(e.status,2);assert.match(e.stderr,/ruta demasiado larga/);
});
