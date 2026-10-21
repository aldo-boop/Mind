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

test('distribución: la lista explícita excluye datos, credenciales, archivos ajenos y código Del usuario',()=>{
 const r=fuente();escribir(join(r,'privado.txt'),'SECRETO');escribir(join(r,'Motor/privado.txt'),'SECRETO');escribir(join(r,'Motor/Funciones/Del usuario/p/test-pruebas.mjs'),"throw Error('No ejecutar');");
 const salida=temporal(),a=construirPublicacion({origen:r,salida}),entradas=leerZip(fs.readFileSync(a.paquete));assert.ok(![...entradas.keys()].some(p=>p.includes('privado')||p.includes('Del usuario')||p.startsWith('Memoria/')||p.endsWith('pruebas.mjs')));assert.ok(entradas.has(REGISTRO));assert.equal(a.firmada,false);
 const b=construirPublicacion({origen:r,salida});assert.equal(b.sha256,a.sha256);
 escribir(join(r,'Motor/ejecutar.mjs'),'cambio');assert.throws(()=>construirPublicacion({origen:r,salida}),x=>x.codigo==='VERSION_INMUTABLE');
});

test('distribución: ZIP comprueba CRC, duplicados, rutas y contenido extra antes de extraer',()=>{
 const a=crearZip(new Map([['Motor/a.txt',Buffer.from('Prueba ñ')]]));assert.equal(leerZip(a).get('Motor/a.txt').toString(),'Prueba ñ');
 const b=Buffer.from(a);b[45]^=1;assert.throws(()=>leerZip(b));
 for(const p of ['../fuera','Motor/../fuera','Motor\\fuera','C:/fuera','Motor/NUL.txt'])assert.throws(()=>crearZip(new Map([[p,Buffer.from('x')]])));
 assert.throws(()=>crearZip(new Map([['Motor/a',Buffer.from('a')],['motor/A',Buffer.from('b')]])));
 const dir=temporal(),extra=crearZip(new Map([['Memoria/perfil.jsonl',Buffer.from('ajeno')]]));assert.throws(()=>extraerZip(extra,dir,new Set(['Motor/a'])));assert.deepEqual(fs.readdirSync(dir),[]);
});

test('distribución: un manifiesto nunca puede declarar Memoria ni Del usuario como oficiales',()=>{
 const r=fuente();for(const path of ['Memoria/datos.txt','Motor/Funciones/Del usuario/p.txt','Motor/Capacidades/Del usuario/p.txt','motor/funciones/DEL USUARIO/p.txt']){const m=leer(join(r,'Motor/Distribucion/archivos.json'));m.archivos.push(path);atomico(join(r,'Motor/Distribucion/archivos.json'),m);assert.throws(()=>prepararManifiesto(r));m.archivos.pop();atomico(join(r,'Motor/Distribucion/archivos.json'),m);}
});

test('actualización: cambia solo lo oficial; Memoria, piezas propias y archivos desconocidos quedan idénticos',()=>{
 const a=fuente(),d=instalar(a);personal(d);const antes=protegidos(d),b=nuevaVersion(a),r=actualizar({origen:b,destino:d});assert.equal(r.aplicado,true);assert.equal(leer(join(d,'Motor/version.json')).motor,'2.0.0-dev.19');assert.deepEqual(protegidos(d),antes);assert.ok(r.eventosLeidos>=3);assert.equal(actualizar({origen:b,destino:d}).aplicado,false);
});

test('actualización: retirar un archivo oficial conserva la copia; uno no registrado nunca se retira',()=>{
 const a=fuente();escribir(join(a,'Motor/retirado.txt'),'oficial anterior');const lista=leer(join(a,'Motor/Distribucion/archivos.json'));lista.archivos.push('Motor/retirado.txt');atomico(join(a,'Motor/Distribucion/archivos.json'),lista);prepararManifiesto(a);const d=instalar(a);escribir(join(d,'Motor/otro.txt'),'ajeno');
 const b=nuevaVersion(a),l=leer(join(b,'Motor/Distribucion/archivos.json'));l.archivos=l.archivos.filter(p=>p!=='Motor/retirado.txt');atomico(join(b,'Motor/Distribucion/archivos.json'),l);prepararManifiesto(b);const r=actualizar({origen:b,destino:d});assert.ok(!fs.existsSync(join(d,'Motor/retirado.txt')));assert.equal(fs.readFileSync(join(r.respaldo,'Motor/retirado.txt'),'utf8'),'oficial anterior');assert.equal(fs.readFileSync(join(d,'Motor/otro.txt'),'utf8'),'ajeno');
});

test('actualización: simular no escribe; una ruta nueva ocupada por un archivo ajeno pide decisión',()=>{
 const a=fuente(),d=instalar(a),b=nuevaVersion(a),antes=inventario(d);assert.equal(actualizar({origen:b,destino:d,simular:true}).aplicado,false);assert.deepEqual(inventario(d),antes);
 escribir(join(b,'Motor/nueva.txt'),'oficial');const l=leer(join(b,'Motor/Distribucion/archivos.json'));l.archivos.push('Motor/nueva.txt');atomico(join(b,'Motor/Distribucion/archivos.json'),l);prepararManifiesto(b);escribir(join(d,'Motor/nueva.txt'),'personal');assert.throws(()=>actualizar({origen:b,destino:d}),x=>x.codigo==='COLISION_PERSONAL');assert.equal(fs.readFileSync(join(d,'Motor/nueva.txt'),'utf8'),'personal');
});

test('actualización: datos incompatibles o dañados no dejan instalado un Motor que no pueda leerlos',()=>{
 const a=fuente(),d=instalar(a);personal(d);const b=nuevaVersion(a);atomico(join(d,'Memoria/version.json'),{memoria:2});const antes=inventario(d);assert.throws(()=>actualizar({origen:b,destino:d}),x=>x.codigo==='ADAPTACION_REQUERIDA');assert.deepEqual(inventario(d),antes);
 atomico(join(d,'Memoria/version.json'),{memoria:3});escribir(join(d,'Memoria/Tablas/perfil.jsonl'),'truncado');assert.throws(()=>actualizar({origen:b,destino:d}),x=>x.codigo==='MEMORIA_NO_LEGIBLE');assert.equal(leer(join(d,'Motor/version.json')).motor,'2.0.0-dev.18');assert.equal(fs.readFileSync(join(d,'Memoria/Tablas/perfil.jsonl'),'utf8'),'truncado');
});

test('actualización: trabajo activo, integridad incorrecta o un junction detienen la aplicación',()=>{
 const a=fuente(),d=instalar(a);personal(d);const b=nuevaVersion(a),antes=protegidos(d);escribir(join(d,'Memoria/.escritura.lock'),'otro proceso');assert.throws(()=>actualizar({origen:b,destino:d}),x=>x.codigo==='MEMORIA_OCUPADA');fs.unlinkSync(join(d,'Memoria/.escritura.lock'));assert.deepEqual(protegidos(d),antes);
 escribir(join(b,'Motor/ejecutar.mjs'),'alterado');assert.throws(()=>actualizar({origen:b,destino:d}),x=>x.codigo==='INTEGRIDAD_INVALIDA');
 if(process.platform==='win32'){const afuera=temporal(),s=temporal();fs.symlinkSync(afuera,join(s,'vinculo'),'junction');assert.throws(()=>actualizar({origen:a,destino:join(s,'vinculo')}),x=>x.codigo==='ENLACE_NO_ADMITIDO');}
});

test('actualización: un fallo tras sustituir un archivo restaura el Motor; se conserva toda la Memoria',()=>{
 const a=fuente(),d=instalar(a);personal(d);const antes=protegidos(d),b=nuevaVersion(a),h=hash(join(d,'Motor/version.json'));assert.throws(()=>actualizar({origen:b,destino:d,incidencia:paso=>{if(paso==='archivo')throw Error('fallo simulado de escritura');}}),e=>e.restaurado===true);assert.equal(hash(join(d,'Motor/version.json')),h);assert.deepEqual(protegidos(d),antes);assert.ok(!fs.existsSync(join(d,'Motor/.actualizando.lock')));
});

test('actualización: una caída real deja un diario recuperable desde una copia sana',()=>{
 const a=fuente(),d=instalar(a);personal(d);const b=nuevaVersion(a),antes=protegidos(d),mod=pathToFileURL(join(root,'Motor/actualizar.mjs')).href;
 const codigo=`import {actualizar} from ${JSON.stringify(mod)};actualizar({origen:${JSON.stringify(b)},destino:${JSON.stringify(d)},incidencia:p=>{if(p==='archivo')process.exit(72);}});`;
 const r=spawnSync(process.execPath,['--input-type=module','-e',codigo],{encoding:'utf8',windowsHide:true});assert.equal(r.status,72,r.stderr);assert.ok(fs.existsSync(join(d,'Motor/.actualizacion.json')));const q=recuperar(d);assert.equal(q.restaurada,true);assert.equal(leer(join(d,'Motor/version.json')).motor,'2.0.0-dev.18');assert.deepEqual(protegidos(d),antes);
});

test('reparación: restaura código oficial alterado o ausente y conserva la alteración respaldada',()=>{
 const a=fuente(),d=instalar(a);personal(d);const antes=protegidos(d);escribir(join(d,'Motor/ejecutar.mjs'),'edición accidental');escribir(join(d,'Motor/actualizar.mjs'),'actualizador roto');fs.unlinkSync(join(d,'Motor/Funciones/Base/Tablas/tablas.mjs'));
 const q=revisar({origen:a,destino:d});assert.equal(q.problemasTotal,3);const r=actualizar({origen:a,destino:d,modo:'reparar'});assert.equal(hash(join(d,'Motor/ejecutar.mjs')),hash(join(a,'Motor/ejecutar.mjs')));assert.equal(fs.readFileSync(join(r.respaldo,'Motor/ejecutar.mjs'),'utf8'),'edición accidental');assert.deepEqual(protegidos(d),antes);
});

test('adaptación: solo con autorización; copia verificada preserva eventos y archivos antes de activar',async()=>{
 const a=fuente(),d=instalar(a);personal(d);atomico(join(d,'Memoria/version.json'),{memoria:2});const original=fs.readFileSync(join(d,'Memoria/Tablas/proyectos.jsonl'),'utf8'),b=nuevaVersion(a),antes=protegidos(d);
 await assert.rejects(adaptarYActualizar({origen:b,destino:d}),e=>e.codigo==='AUTORIZACION_REQUERIDA');assert.deepEqual(protegidos(d),antes);
 const r=await adaptarYActualizar({origen:b,destino:d,confirmadoPorPersona:true});assert.equal(r.adaptada,true);assert.ok(r.prueba.eventos>=3);assert.equal(leer(join(d,'Memoria/version.json')).memoria,3);assert.equal(fs.readFileSync(join(d,'Memoria/Tablas/proyectos.jsonl'),'utf8'),original);assert.equal(leer(join(d,'Motor/version.json')).motor,'2.0.0-dev.19');assert.equal(fs.readFileSync(join(d,'Memoria/Colecciones/privado.txt'),'utf8'),'Documento de Persona');assert.ok(fs.existsSync(join(r.respaldo,'Memoria-original/Tablas/proyectos.jsonl')));
});

test('adaptación: un dato perdido, estructura futura o fallo al activar conserva originales y Motor anterior',async()=>{
 const a=fuente(),d=instalar(a);personal(d);const copia=temporal();fs.cpSync(join(d,'Memoria'),copia,{recursive:true});const ev=fs.readFileSync(join(copia,'Tablas/proyectos.jsonl'),'utf8').trim().split('\n');fs.writeFileSync(join(copia,'Tablas/proyectos.jsonl'),ev.slice(1).join('\n')+'\n');assert.throws(()=>comprobarConservacion(join(d,'Memoria'),copia),x=>x.codigo==='DATOS_NO_CONSERVADOS');
 atomico(join(d,'Memoria/version.json'),{memoria:4});const antes=protegidos(d),b=nuevaVersion(a);await assert.rejects(adaptarYActualizar({origen:b,destino:d,confirmadoPorPersona:true}));assert.deepEqual(protegidos(d),antes);assert.equal(leer(join(d,'Motor/version.json')).motor,'2.0.0-dev.18');
 atomico(join(d,'Memoria/version.json'),{memoria:2});const foto=protegidos(d);await assert.rejects(adaptarYActualizar({origen:b,destino:d,confirmadoPorPersona:true,incidencia:p=>{if(p==='memoria-apartada')throw Error('corte al activar');}}));assert.deepEqual(protegidos(d),foto);assert.equal(leer(join(d,'Motor/version.json')).motor,'2.0.0-dev.18');
});

async function servidor(){const archivos=new Map();const server=createServer((req,res)=>{const b=archivos.get(req.url);if(!b){res.statusCode=404;res.end();return;}res.setHeader('content-length',b.length);res.end(b);});await new Promise(r=>server.listen(0,'127.0.0.1',r));return {archivos,url:'http://127.0.0.1:'+server.address().port,close:()=>new Promise(r=>server.close(r))};}
function claves(){const k=generateKeyPairSync('ed25519');return {publica:k.publicKey.export({type:'spki',format:'pem'}),privada:k.privateKey.export({type:'pkcs8',format:'pem'})};}
function publicarPrueba(origen,srv,k,{secuencia=1}={}){const r=construirPublicacion({origen,salida:temporal(),clave:'prueba',privada:k.privada,secuencia});srv.archivos.set('/canal.json',Buffer.from(JSON.stringify(firmar(r.publicacion,'prueba',k.privada))));srv.archivos.set('/'+r.publicacion.paquete.url,fs.readFileSync(r.paquete));return r;}

test('canal: dos Minds actualizan y reparan desde una publicación firmada sin cambiar sus datos propios',async()=>{
 const srv=await servidor(),k=claves();try{const a=fuente();atomico(join(a,CONFIANZA),{formato:1,canal:srv.url+'/canal.json',claves:{prueba:k.publica}});prepararManifiesto(a);const d1=instalar(a),d2=instalar(a);personal(d1,'Uno');personal(d2,'Dos');const h1=protegidos(d1),h2=protegidos(d2),b=nuevaVersion(a);publicarPrueba(b,srv,k);
 assert.equal((await inicio({destino:d1,permitirLocal:true})).estado,'actualizado');assert.equal((await inicio({destino:d2,permitirLocal:true})).estado,'actualizado');assert.deepEqual(protegidos(d1),h1);assert.deepEqual(protegidos(d2),h2);
 escribir(join(d1,'Motor/ejecutar.mjs'),'alterado');assert.equal((await inicio({destino:d1,permitirLocal:true})).estado,'reparado');assert.equal(hash(join(d1,'Motor/ejecutar.mjs')),hash(join(b,'Motor/ejecutar.mjs')));assert.deepEqual(protegidos(d1),h1);
 }finally{await srv.close();}
});

test('canal: firma ajena, paquete corrupto y publicación anterior nunca sustituyen el Motor',async()=>{
 const srv=await servidor(),k=claves();try{const a=fuente();atomico(join(a,CONFIANZA),{formato:1,canal:srv.url+'/canal.json',claves:{prueba:k.publica}});prepararManifiesto(a);const d=instalar(a);personal(d);const foto=protegidos(d),b=nuevaVersion(a),pub=publicarPrueba(b,srv,k);
 const firma=JSON.parse(srv.archivos.get('/canal.json'));firma.firma=Buffer.alloc(64).toString('base64');srv.archivos.set('/canal.json',Buffer.from(JSON.stringify(firma)));assert.equal((await inicio({destino:d,permitirLocal:true})).codigo,'FIRMA_INVALIDA');assert.equal(leer(join(d,'Motor/version.json')).motor,'2.0.0-dev.18');
 publicarPrueba(b,srv,k);srv.archivos.set('/'+pub.publicacion.paquete.url,Buffer.from('ZIP dañado'));assert.equal((await inicio({destino:d,permitirLocal:true})).estado,'aplazada');assert.deepEqual(protegidos(d),foto);
 publicarPrueba(b,srv,k);assert.equal((await inicio({destino:d,permitirLocal:true})).estado,'actualizado');publicarPrueba(a,srv,k);assert.equal((await inicio({destino:d,permitirLocal:true})).codigo,'PUBLICACION_ANTIGUA');assert.equal(leer(join(d,'Motor/version.json')).motor,'2.0.0-dev.19');
 }finally{await srv.close();}
});

test('canal: inicio sin publicación, sin red, con trabajo o con esquema distinto conserva la instalación',async()=>{
 const a=fuente(),d=instalar(a);assert.equal((await inicio({destino:d})).estado,'sin-canal');const srv=await servidor(),k=claves();try{
 atomico(join(a,CONFIANZA),{formato:1,canal:srv.url+'/canal.json',claves:{prueba:k.publica}});prepararManifiesto(a);const cliente=instalar(a);personal(cliente);const b=nuevaVersion(a);publicarPrueba(b,srv,k);escribir(join(cliente,'Memoria/.escritura.lock'),'trabajo');assert.equal((await inicio({destino:cliente,permitirLocal:true})).codigo,'TRABAJO_ACTIVO');fs.unlinkSync(join(cliente,'Memoria/.escritura.lock'));
 atomico(join(cliente,'Memoria/version.json'),{memoria:2});assert.equal((await inicio({destino:cliente,permitirLocal:true})).codigo,'ADAPTACION_REQUERIDA');assert.equal(leer(join(cliente,'Motor/version.json')).motor,'2.0.0-dev.18');srv.archivos.clear();assert.equal((await inicio({destino:cliente,permitirLocal:true})).estado,'aplazada');
 }finally{await srv.close();}
});

test('Windows: arquitectura nativa admite x64 y ARM64 y no confunde arquitectura de proceso',()=>{assert.equal(arquitecturaNativa('AMD64'),'x64');assert.equal(arquitecturaNativa('Arm64'),'arm64');assert.throws(()=>arquitecturaNativa('x86'));const cmd=fs.readFileSync(join(root,'Mind.cmd'),'utf8');assert.match(cmd,/OSArchitecture/);assert.match(cmd,/SHA256/);assert.ok(!cmd.includes('%1'));assert.ok(!cmd.includes('ExecutionPolicy'));assert.ok(!cmd.includes('node '));});


test('revisión y reparación: diagnostica la propia copia y recupera versión y manifiesto oficiales',async()=>{
 const a=fuente(),d=instalar(a);personal(d);const foto=protegidos(d);escribir(join(d,'Motor/ejecutar.mjs'),'edición');assert.equal(revisar({origen:d,destino:d}).problemasTotal,1);
 const srv=await servidor(),k=claves();try{atomico(join(a,CONFIANZA),{formato:1,canal:srv.url+'/canal.json',claves:{prueba:k.publica}});prepararManifiesto(a);actualizar({origen:a,destino:d});publicarPrueba(a,srv,k);escribir(join(d,'Motor/version.json'),'roto');escribir(join(d,META),'roto');assert.equal((await inicio({destino:d,permitirLocal:true})).estado,'reparado');assert.equal(leer(join(d,'Motor/version.json')).motor,'2.0.0-dev.18');assert.deepEqual(protegidos(d),foto);
 }finally{await srv.close();}
});

test('actualización: falta de espacio al respaldar falla antes de sustituir y permite reintentar',()=>{
 const a=fuente(),d=instalar(a);personal(d);const foto=protegidos(d),h=hash(join(d,'Motor/version.json')),b=nuevaVersion(a);
 assert.throws(()=>actualizar({origen:b,destino:d,incidencia:p=>{if(p==='antes-respaldo')throw Object.assign(Error('Disco sin espacio'),{code:'ENOSPC'});}}),e=>e.code==='ENOSPC');assert.equal(hash(join(d,'Motor/version.json')),h);assert.deepEqual(protegidos(d),foto);assert.ok(!fs.existsSync(join(d,'Motor/.actualizando.lock')));assert.equal(actualizar({origen:b,destino:d}).aplicado,true);
});

test('actualización: una sesión viva bloquea cambios y una sesión interrumpida se recupera',()=>{
 const a=fuente(),d=instalar(a),b=nuevaVersion(a);personal(d);const foto=protegidos(d),sp=join(d,'Motor/.sesion-activa.json');atomico(sp,{tipo:'mind-sesion',pid:process.pid,host:process.env.COMPUTERNAME,token:'vivo'});
 // hostname() es la misma identidad usada por el código, sin depender de mayúsculas del entorno.
 const mod=pathToFileURL(join(root,'Motor/actualizar.mjs')).href;
 assert.throws(()=>actualizar({origen:b,destino:d}),e=>e.codigo==='TRABAJO_ACTIVO');assert.deepEqual(protegidos(d),foto);fs.unlinkSync(sp);
 const codigo=`import * as fs from 'node:fs';import {hostname} from 'node:os';fs.writeFileSync(${JSON.stringify(sp)},JSON.stringify({tipo:'mind-sesion',pid:process.pid,host:hostname(),token:'caida'}));`;
 assert.equal(spawnSync(process.execPath,['--input-type=module','-e',codigo],{windowsHide:true}).status,0);recuperar(d);assert.ok(!fs.existsSync(sp));assert.equal(actualizar({origen:b,destino:d}).aplicado,true);
});


test('adaptación: un CSV ajeno o metadato original de un evento no puede perderse en la comprobación',()=>{
 const a=fuente(),d=instalar(a);personal(d);escribir(join(d,'Memoria/Tablas/mi-reporte.csv'),'Dato personal');const copia=temporal();fs.cpSync(join(d,'Memoria'),copia,{recursive:true});escribir(join(copia,'Tablas/mi-reporte.csv'),'cambio');assert.throws(()=>comprobarConservacion(join(d,'Memoria'),copia),e=>e.codigo==='DATOS_NO_CONSERVADOS');escribir(join(copia,'Tablas/mi-reporte.csv'),'Dato personal');
 const tabla=join(d,'Memoria/Tablas/proyectos.jsonl'),eventos=fs.readFileSync(tabla,'utf8').trim().split('\n').map(JSON.parse);eventos[0].origen='Historia adicional';fs.writeFileSync(tabla,eventos.map(JSON.stringify).join('\n')+'\n');assert.throws(()=>comprobarConservacion(join(d,'Memoria'),copia),e=>e.codigo==='DATOS_NO_CONSERVADOS');
});
