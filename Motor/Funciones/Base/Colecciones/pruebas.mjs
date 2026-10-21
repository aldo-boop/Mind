import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {abrirTablas} from '../Tablas/tablas.mjs';
import {abrirFrentes} from '../Frentes/frentes.mjs';
import {abrirColecciones,ejecutarColeccion,escritorioWindows} from './colecciones.mjs';
const si={confirmadoPorPersona:true};
const nueva=()=>{const base=fs.mkdtempSync(join(tmpdir(),'mind-b2-'));const escritorio=join(base,'OneDrive de Prueba','Escritorio ñ & datos');fs.mkdirSync(escritorio,{recursive:true});const t=abrirTablas(join(base,'Memoria')).inicializar();return {base,escritorio,t,f:abrirFrentes(t,{escritorio:()=>escritorio})};};
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');

test('proyecto nuevo obtiene colección predeterminada en Escritorio redirigido; renombrar no mueve y reintentar no duplica',()=>{
 const {escritorio,t,f}=nueva(),r=f.altaProyecto('Café & Diseño','Proyecto ficticio',{...si,idPedido:'predeterminado'});
 assert.equal(r.id,r.proyecto.id);assert.equal(r.coleccion.proyecto,r.proyecto.id);assert.equal(dirname(r.coleccion.direccion),escritorio);
 assert.equal(r.coleccion.ubicacion,'local');assert.ok(fs.statSync(r.coleccion.direccion).isDirectory());assert.ok(r.coleccion.rama);
 const dir=r.coleccion.direccion;f.cambiar(r.id,{nombre:'Nuevo nombre'});
 const otro=f.altaProyecto('Nuevo nombre','Proyecto ficticio',{...si,idPedido:'predeterminado'});
 assert.equal(otro.proyecto.id,r.id);assert.equal(otro.coleccion.id,r.coleccion.id);assert.equal(otro.coleccion.direccion,dir);
 assert.equal(fs.readdirSync(escritorio).length,1);assert.equal(t.leer('proyectos').length,1);assert.equal(t.leer('colecciones').length,1);
});

test('vincular carpeta existente conserva contenido y hashes; preparar raíz para proyecto previo es idempotente',()=>{
 const {base,t}=nueva(),dir=join(base,'Recursos existentes');fs.mkdirSync(dir);fs.writeFileSync(join(dir,'original.bin'),Buffer.from([0,1,255,42]));
 const antes=hash(join(dir,'original.bin')),p=t.alta('proyectos',{tipo:'proyecto',nombre:'Previo',estado:'activo'}),c=abrirColecciones(t);
 const r=c.preparar({proyecto:p.id,coleccion:{direccion:dir},...si,idPedido:'vincular'});
 const repetido=c.preparar({proyecto:p.id,coleccion:{direccion:dir},...si,idPedido:'vincular'});
 assert.equal(repetido.coleccion.id,r.coleccion.id);assert.equal(r.coleccion.proyecto,p.id);assert.equal(hash(join(dir,'original.bin')),antes);assert.deepEqual(fs.readdirSync(dir),['original.bin']);
 assert.equal(t.leer('colecciones').length,1);assert.throws(()=>c.preparar({proyecto:p.id}),/confirmadoPorPersona/);
 assert.throws(()=>c.preparar({proyecto:p.id,coleccion:{direccion:base},...si}),e=>e.necesitaDecision===true);
 assert.equal(t.leer('colecciones')[0].direccion,dir);
});

test('cuatro ubicaciones explícitas; sincronizada sin carpeta y elección ambigua piden decisión concreta sin efectos',()=>{
 const {escritorio,t,f}=nueva();
 const a=f.altaProyecto('Local','',{...si,coleccion:{base:escritorio}});
 const b=f.altaProyecto('Sincronizada','',{...si,coleccion:{ubicacion:'sincronizada',base:escritorio}});
 const c=f.altaProyecto('Enlace','',{...si,coleccion:{ubicacion:'enlace',direccion:'drive:carpeta-ficticia'}});
 const d=f.altaProyecto('Dentro','',{...si,coleccion:{ubicacion:'mind'}});
 assert.deepEqual([a,b,c,d].map(x=>x.coleccion.ubicacion),['local','sincronizada','enlace','mind']);
 assert.equal(c.coleccion.disponibilidad,'no-comprobada');assert.ok(fs.existsSync(join(t.raiz,d.coleccion.direccion)));
 for(const coleccion of [{ubicacion:'sincronizada'},{ubicacion:'nube'},{base:escritorio,direccion:escritorio},null,{ubicacion:'mind',direccion:'../fuera'}]) assert.throws(()=>f.altaProyecto('Inválido','',{...si,coleccion}),e=>e.codigo==='DECISION_UBICACION'&&e.necesitaDecision===true);
 assert.equal(t.leer('proyectos').length,4);assert.deepEqual(t.operacionesPendientes(),[]);
});

test('fallos de consulta del Escritorio y raíz ausente no inventan otro destino',()=>{
 const {base,t}=nueva(),f=abrirFrentes(t,{escritorio:()=>''});
 assert.throws(()=>f.altaProyecto('P','',si),e=>e.codigo==='DECISION_UBICACION');
 assert.throws(()=>f.altaProyecto('P','',{...si,coleccion:{base:join(base,'ausente')}}),e=>e.codigo==='DECISION_UBICACION');
 assert.deepEqual(t.leer('proyectos'),[]);assert.deepEqual(t.leer('colecciones'),[]);assert.deepEqual(t.operacionesPendientes(),[]);
});

test('permiso denegado al leer se informa sin éxito; al crear conserva pendiente y reintento recupera',()=>{
 const {escritorio,t}=nueva();let negarLectura=true,negarCreacion=false;
 const archivos={...fs,readdirSync(p,...args){if(negarLectura&&p===escritorio)throw Object.assign(new Error('Denegado'),{code:'EACCES'});return fs.readdirSync(p,...args);},mkdirSync(p,...args){if(negarCreacion&&dirname(p)===escritorio)throw Object.assign(new Error('Denegado'),{code:'EACCES'});return fs.mkdirSync(p,...args);}};
 const f=abrirFrentes(t,{escritorio:()=>escritorio,archivos});
 assert.throws(()=>f.altaProyecto('P','',{...si,idPedido:'permisos'}),e=>e.necesitaDecision===true);assert.equal(t.leer('proyectos').length,0);
 negarLectura=false;negarCreacion=true;
 assert.throws(()=>f.altaProyecto('P','',{...si,idPedido:'permisos'}),e=>e.recibo?.pendiente===true&&e.necesitaDecision===true);
 assert.equal(t.leer('proyectos').length,0);assert.equal(t.operacionesPendientes().length,1);
 negarCreacion=false;const r=f.altaProyecto('P','',{...si,idPedido:'permisos'});assert.ok(fs.existsSync(r.coleccion.direccion));assert.deepEqual(t.operacionesPendientes(),[]);
});

test('junction dentro de Memoria no permite crear la colección fuera de su ámbito',{skip:process.platform!=='win32'},()=>{
 const {base,t,f}=nueva(),fuera=join(base,'fuera');fs.mkdirSync(fuera);fs.symlinkSync(fuera,join(t.raiz,'Colecciones'),'junction');
 assert.throws(()=>f.altaProyecto('P','',{...si,coleccion:{ubicacion:'mind'}}),e=>e.necesitaDecision===true);
 assert.deepEqual(fs.readdirSync(fuera),[]);assert.deepEqual(t.leer('proyectos'),[]);
});

test('coleccion buscar reutiliza Buscar, limita y excluye otra colección',()=>{
 const {t,f}=nueva(),p=f.altaProyecto('P','',si),q=f.altaProyecto('Q','',si);
 for(let i=0;i<12;i++)t.alta('colecciones',{nombre:'Foto '+i,direccion:'foto'+i+'.jpg'},{rama:p.coleccion.rama});
 t.alta('colecciones',{nombre:'Foto ajena',direccion:'ajena.jpg'},{rama:q.coleccion.rama});
 const r=ejecutarColeccion(t,{operacion:'buscar',coleccion:p.coleccion.id,texto:'foto'});
 assert.equal(r.filas.length,10);assert.ok(r.filas.every(x=>x.fila.coleccion===p.coleccion.id));
 assert.equal(ejecutarColeccion(t,{operacion:'buscar',coleccion:p.coleccion.id,texto:'foto',limite:50}).filas.length,12);
 assert.throws(()=>ejecutarColeccion(t,{operacion:'buscar',coleccion:p.coleccion.id,rama:q.coleccion.rama}),/no pertenece/);
 assert.throws(()=>ejecutarColeccion(t,{operacion:'buscar',coleccion:p.coleccion.id,limite:51}),/1–50/);
});

// Antes del Bloque 3 estas operaciones estaban reservadas; ahora actúan solo sobre una colección real (resultados en indice-pruebas.mjs).
test('las operaciones del índice exigen una colección real: sin ella no simulan resultados ni escriben',()=>{
 const {t}=nueva();
 for(const operacion of ['indexar','resolver','registrarEnlace','reubicar'])assert.throws(()=>ejecutarColeccion(t,{operacion,coleccion:'inexistente',nombre:'x',direccion:'https://example.invalid/x',destino:{base:t.raiz},...si}),e=>e.codigo!=='BLOQUE_PENDIENTE'&&/inexistente o ambigua/.test(e.message));
 assert.throws(()=>ejecutarColeccion(t,{operacion:'empaquetar'}),/desconocida/);
 assert.deepEqual(t.leer('colecciones'),[]);assert.deepEqual(t.operacionesPendientes(),[]);
});

test('CLI preparar/buscar devuelve IDs y ubicación; error de ubicación es estructurado',()=>{
 const {base,t}=nueva(),p=t.alta('proyectos',{tipo:'proyecto',nombre:'CLI',estado:'activo'}),ejecutor=new URL('../../../ejecutar.mjs',import.meta.url);
 const exec=fileURLToPath(ejecutor);
 const cli=op=>{const r=spawnSync(process.execPath,[exec,'coleccion',t.raiz,JSON.stringify(op)],{encoding:'utf8',windowsHide:true});return {r,json:r.stdout?JSON.parse(r.stdout):null};};
 const {r,json}=cli({operacion:'preparar',proyecto:p.id,coleccion:{base},...si,idPedido:'cli'});assert.equal(r.status,0,r.stderr);assert.equal(json.proyecto.id,p.id);assert.ok(json.coleccion.id);assert.ok(fs.existsSync(json.ubicacion.direccion));
 assert.equal(cli({operacion:'buscar',coleccion:json.coleccion.id}).json.filas.length,0);
 const q=t.alta('proyectos',{tipo:'proyecto',nombre:'Otro',estado:'activo'}),mal=cli({operacion:'preparar',proyecto:q.id,coleccion:{ubicacion:'sincronizada'},...si});
 assert.equal(mal.r.status,2);assert.equal(mal.json.codigo,'DECISION_UBICACION');assert.equal(mal.json.necesitaDecision,true);
});

test('Windows consulta su Escritorio conocido real, sin crear recursos allí',{skip:process.platform!=='win32'},()=>{
 const ruta=escritorioWindows();assert.ok(fs.statSync(ruta).isDirectory());assert.ok(ruta.length>3);
});

test('reanudar conserva la raíz planificada aunque el Escritorio cambie entre intentos',()=>{
 const {base,t,f,escritorio}=nueva();
 assert.throws(()=>f.altaProyecto('P','',{...si,idPedido:'redireccion',coleccion:{descripcion:5}}),e=>e.recibo?.pendiente===true);
 const nuevo=join(base,'Escritorio nuevo');fs.mkdirSync(nuevo);
 const r=abrirFrentes(t,{escritorio:()=>nuevo}).altaProyecto('P','',{...si,idPedido:'redireccion'});
 assert.equal(dirname(r.coleccion.direccion),escritorio);assert.equal(fs.readdirSync(nuevo).length,0);assert.equal(fs.readdirSync(escritorio).length,1);
 assert.equal(t.leer('proyectos').length,1);assert.deepEqual(t.operacionesPendientes(),[]);
});

test('dos sesiones con ubicación predeterminada crean una sola raíz',async()=>{
 const {t,escritorio}=nueva(),modulo=new URL('../Frentes/frentes.mjs',import.meta.url).href,modTablas=new URL('../Tablas/tablas.mjs',import.meta.url).href;
 const ejecutar=()=>new Promise((bien,mal)=>{
  const codigo=`import {abrirFrentes} from ${JSON.stringify(modulo)};import {abrirTablas} from ${JSON.stringify(modTablas)};const f=abrirFrentes(abrirTablas(${JSON.stringify(t.raiz)}),{escritorio:()=>${JSON.stringify(escritorio)}});for(let i=0;i<400;i++){try{f.altaProyecto('Concurrente','',{confirmadoPorPersona:true});console.log('creado');break;}catch(e){if(/duplicado/.test(e.message)){console.log('duplicado');break;}if(!/Memoria ocupada/.test(e.message))throw e;await new Promise(r=>setTimeout(r,10));}}`;
  const p=spawn(process.execPath,['--input-type=module','-e',codigo],{windowsHide:true});let s='',e='';p.stdout.on('data',b=>s+=b);p.stderr.on('data',b=>e+=b);p.on('error',mal);p.on('exit',c=>c===0?bien(s.trim()):mal(Error(e)));
 });
 assert.deepEqual((await Promise.all([ejecutar(),ejecutar()])).sort(),['creado','duplicado']);assert.equal(t.leer('proyectos').length,1);assert.equal(t.leer('colecciones').length,1);assert.equal(fs.readdirSync(escritorio).length,1);
});
