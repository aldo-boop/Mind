import test from 'node:test';import assert from 'node:assert/strict';
import { mkdtempSync,readFileSync,readdirSync,writeFileSync,mkdirSync,existsSync } from 'node:fs';import { spawn,spawnSync } from 'node:child_process';import { tmpdir } from 'node:os';import { join } from 'node:path';
import { abrirTablas } from '../Tablas/tablas.mjs';import { abrirFrentes,nombreCarpeta } from './frentes.mjs';
const nueva=()=>{const t=abrirTablas(mkdtempSync(join(tmpdir(),'mind-v2-frentes-'))).inicializar();return {t,f:abrirFrentes(t,{escritorio:()=>t.raiz})};};const si={confirmadoPorPersona:true};
test('alta exige confirmación y proyecto; General se crea sin datos personales',()=>{const {t,f}=nueva();assert.throws(()=>f.altaProyecto('P'),/persona/);assert.throws(()=>f.altaFrente({nombre:'F',proyecto:'No existe'},si),/inexistente/);f.altaFrente({nombre:'General abierto'},si);assert.equal(t.leer('proyectos').length,2);});
test('Controlador actualiza turno, siguiente paso, pausas y cierres',()=>{const {t,f}=nueva();f.altaProyecto('Zeta','Proyecto ficticio',si);const z=f.altaFrente({nombre:'Trabajo',proyecto:'Zeta',turno:'Persona',loQueSigue:'Leer'},si);f.altaFrente({nombre:'General abierto'},si);let vista=()=>readFileSync(join(t.raiz,'Vistas','Inicio.md'),'utf8');assert.ok(vista().indexOf('General abierto')<vista().indexOf('Trabajo'));f.cambiar(z.id,{turno:'Revisor',loQueSigue:'Comprobar'});assert.match(vista(),/Trabajo.*Revisor.*Comprobar/);f.cambiar(z.id,{estado:'pausado'});assert.doesNotMatch(vista(),/Trabajo/);f.cambiar(z.id,{estado:'activo'});assert.match(vista(),/Trabajo/);f.cambiar(z.id,{estado:'terminado'});assert.doesNotMatch(vista(),/Trabajo/);assert.equal(t.leer('proyectos',{historia:true}).filter(x=>x.id===z.id).length,5);});
test('mover frente cambia su fila y cerrar proyecto lo retira del Controlador',()=>{const {t,f}=nueva();const p=f.altaProyecto('Destino','',si);const a=f.altaFrente({nombre:'Frente'},si);f.cambiar(a.id,{proyecto:'Destino'});assert.equal(t.leer('proyectos').find(x=>x.id===a.id).proyecto,p.id);f.cambiar(p.id,{estado:'terminado'});assert.doesNotMatch(readFileSync(join(t.raiz,'Vistas','Inicio.md'),'utf8'),/Destino/);assert.throws(()=>f.altaFrente({nombre:'Otro',proyecto:'Destino'},si),/terminado/);});

test('subfrentes por ID o nombre; cambiar padre; rechaza ciclos y padres de otro proyecto',()=>{
 const {t,f}=nueva(),p=f.altaProyecto('P','',si),q=f.altaProyecto('Q','',si),a=f.altaFrente({nombre:'A',proyecto:p.id},si),b=f.altaFrente({nombre:'B',proyecto:p.id},si),h=f.altaFrente({nombre:'H',proyecto:p.id,perteneceA:'A'},si);
 assert.equal(h.perteneceA,a.id);assert.equal(f.cambiar(h.id,{perteneceA:'B'}).perteneceA,b.id);
 assert.throws(()=>f.cambiar(b.id,{perteneceA:h.id}),/Ciclo/);assert.throws(()=>f.cambiar(h.id,{perteneceA:h.id}),/Ciclo/);
 const otro=f.altaFrente({nombre:'Otro',proyecto:q.id},si);assert.throws(()=>f.cambiar(h.id,{perteneceA:otro.id}),/padre/);assert.throws(()=>f.altaFrente({nombre:'Mal',proyecto:p.id,perteneceA:'Inexistente'},si),/padre/);
 assert.throws(()=>f.cambiar(b.id,{proyecto:q.id}),/subfrentes/);f.cambiar(h.id,{perteneceA:''});assert.equal(t.leer('proyectos').find(x=>x.id===h.id).perteneceA,'');
});
test('rechaza padres terminados, retirados o ambiguos sin agregar eventos',()=>{
 const {t,f}=nueva(),p=f.altaProyecto('P','',si),a=f.altaFrente({nombre:'A',proyecto:p.id},si);f.altaFrente({nombre:'A',proyecto:p.id},si);
 const antes=()=>t.leer('proyectos',{historia:true}).length;let n=antes();assert.throws(()=>f.altaFrente({nombre:'H',proyecto:p.id,perteneceA:'A'},si),/ambiguo/);assert.equal(antes(),n);
 f.cambiar(a.id,{estado:'terminado'});n=antes();assert.throws(()=>f.altaFrente({nombre:'H',proyecto:p.id,perteneceA:a.id},si),/terminado/);assert.equal(antes(),n);
 f.cambiar(a.id,{estado:'activo'});t.retirar('proyectos',a.id);assert.throws(()=>f.altaFrente({nombre:'H',proyecto:p.id,perteneceA:a.id},si),/retirado/);
});
test('Tablas también protege la jerarquía al escribir sin pasar por Frentes',()=>{
 const {t,f}=nueva(),p=f.altaProyecto('P','',si);assert.throws(()=>t.alta('proyectos',{tipo:'frente',nombre:'H',proyecto:p.id,perteneceA:'No existe',estado:'activo'}),/padre/);
 const a=f.altaFrente({nombre:'A',proyecto:p.id},si),b=f.altaFrente({nombre:'B',proyecto:p.id,perteneceA:a.id},si);assert.throws(()=>t.actualizar('proyectos',a.id,{perteneceA:b.id}),/Ciclo/);assert.throws(()=>t.actualizar('proyectos',p.id,{perteneceA:a.id}),/Solo un frente/);
});

// Bloque 1 · proyecto + colección como una sola operación recuperable.
const urlTablas=new URL('../Tablas/tablas.mjs',import.meta.url).href, urlFrentes=new URL('./frentes.mjs',import.meta.url).href;
test('proyecto con colección: una sola carpeta, fila y rama; reintentar no duplica; la ficha la muestra',()=>{
 const {t,f}=nueva(),base=mkdtempSync(join(tmpdir(),'mind-v2-escritorio ñandú '));
 const r=f.altaProyecto('Café Montaña','Marca de café',{...si,idPedido:'abrir-cafe',coleccion:{base}});
 const carpeta=nombreCarpeta('Café Montaña','abrir-cafe');
 assert.equal(r.coleccion.clase,'coleccion');assert.equal(r.coleccion.proyecto,r.proyecto.id);assert.ok(r.coleccion.rama);assert.equal(r.recibo.guardado,true);
 assert.deepEqual(readdirSync(base),[carpeta]);assert.equal(r.ubicacion.direccion,join(base,carpeta));
 const otra=f.altaProyecto('Café Montaña','Marca de café',{...si,idPedido:'abrir-cafe',coleccion:{base}});
 assert.equal(otra.repetido,true);assert.equal(t.leer('proyectos').length,1);assert.equal(t.leer('colecciones').length,1);assert.equal(readdirSync(base).length,1);
 assert.throws(()=>f.altaProyecto('Café Montaña','',{...si,coleccion:{base}}),/duplicado/);
 assert.equal(readdirSync(base).length,1);assert.deepEqual(t.operacionesPendientes(),[]);
 f.altaFrente({nombre:'Etiquetas',proyecto:'Café Montaña'},si);
 const ficha=readdirSync(join(t.raiz,'Vistas','Proyectos')).find(n=>n.startsWith('frente - '));
 assert.match(readFileSync(join(t.raiz,'Vistas','Proyectos',ficha),'utf8'),/Colección del proyecto: Café Montaña — .* · local · rama: /);
});
test('carpeta existente se vincula sin tocar su contenido; también enlace y carpeta dentro de Mind',()=>{
 const {t,f}=nueva(),dir=mkdtempSync(join(tmpdir(),'mind-v2-existente-'));writeFileSync(join(dir,'original.txt'),'no tocar');
 const r=f.altaProyecto('Existente','',{...si,coleccion:{direccion:dir}});
 assert.equal(r.ubicacion.modo,'vincular');assert.deepEqual(readdirSync(dir),['original.txt']);assert.equal(readFileSync(join(dir,'original.txt'),'utf8'),'no tocar');
 const e=f.altaProyecto('En la nube','',{...si,coleccion:{ubicacion:'enlace',direccion:'https://drive.example/carpeta'}});
 assert.equal(e.coleccion.disponibilidad,'no-comprobada');assert.equal(e.coleccion.ubicacion,'enlace');
 const m=f.altaProyecto('Interno','',{...si,coleccion:{ubicacion:'mind'}});
 assert.match(m.coleccion.direccion,/^Colecciones\/Interno \([0-9a-f]{6}\)$/);assert.ok(existsSync(join(t.raiz,m.coleccion.direccion)));
 assert.equal(t.leer('colecciones').length,3);
});
test('raíz ausente, destino ocupado o enlace inválido no declaran éxito ni dejan filas ni diario',()=>{
 const {t,f}=nueva(),base=mkdtempSync(join(tmpdir(),'mind-v2-base-'));
 assert.throws(()=>f.altaProyecto('A','',{...si,coleccion:{base:join(base,'no-existe')}}),/no existe/);
 assert.throws(()=>f.altaProyecto('A','',{...si,coleccion:{direccion:join(base,'tampoco')}}),/no existe/);
 assert.throws(()=>f.altaProyecto('A','',{...si,coleccion:{ubicacion:'enlace',direccion:'C:/no-es-enlace'}}),/enlace/);
 const ajena=join(base,nombreCarpeta('A','fijo'));mkdirSync(ajena);writeFileSync(join(ajena,'ajeno.txt'),'x');
 assert.throws(()=>f.altaProyecto('A','',{...si,idPedido:'fijo',coleccion:{base}}),/ocupado/);
 assert.equal(readFileSync(join(ajena,'ajeno.txt'),'utf8'),'x');
 assert.deepEqual(t.leer('proyectos'),[]);assert.deepEqual(t.leer('colecciones'),[]);assert.deepEqual(t.operacionesPendientes(),[]);
});
test('operación cortada tras crear la carpeta: queda pendiente y reintentar completa sin duplicar',()=>{
 const {t,f}=nueva(),base=mkdtempSync(join(tmpdir(),'mind-v2-corte-'));
 // Un registro dañado se detecta antes de crear nada: no queda operación a medias.
 mkdirSync(join(t.raiz,'Tablas'),{recursive:true});const p=join(t.raiz,'Tablas','colecciones.jsonl');writeFileSync(p,'{"operacion":');
 assert.throws(()=>f.altaProyecto('Corte','',{...si,coleccion:{base}}),/dañado/);assert.deepEqual(readdirSync(base),[]);assert.deepEqual(t.operacionesPendientes(),[]);writeFileSync(p,'');
 // Corte después de crear la carpeta y el proyecto: la fila de la colección falla.
 assert.throws(()=>f.altaProyecto('Corte','',{...si,coleccion:{base,descripcion:5}}),e=>e.recibo?.pendiente===true&&e.recibo.guardado===true);
 const [op]=t.operacionesPendientes();assert.equal(op.estado,'interrumpida');assert.equal(op.datos.nombre,'Corte');
 assert.equal(t.leer('proyectos').length,1);assert.equal(readdirSync(base).length,1);assert.deepEqual(t.leer('colecciones'),[]);
 const r=f.altaProyecto('Corte','',{...si,coleccion:{base}});
 assert.equal(r.proyecto.id,t.leer('proyectos')[0].id);assert.equal(t.leer('proyectos').length,1);assert.equal(t.leer('colecciones').length,1);assert.equal(readdirSync(base).length,1);assert.deepEqual(t.operacionesPendientes(),[]);
});
test('caída del proceso tras crear la carpeta: candado huérfano, la persona lo libera y se reanuda con la misma carpeta',()=>{
 const {t,f}=nueva(),base=mkdtempSync(join(tmpdir(),'mind-v2-caida-'));
 const codigo=`import {abrirTablas} from ${JSON.stringify(urlTablas)};import {nombreCarpeta} from ${JSON.stringify(urlFrentes)};import {mkdirSync} from 'node:fs';import {join} from 'node:path';
 const t=abrirTablas(${JSON.stringify(t.raiz)}),base=${JSON.stringify(base)},id='proyecto-caida';
 t.operacion({idPedido:id,tipo:'proyecto',datos:{nombre:'Caída',descripcion:'',coleccion:{base}}},ctx=>{const d=join(base,nombreCarpeta('Caída',id));ctx.marcar('ubicacion',{estado:'creando',modo:'crear',ubicacion:'local',direccion:d});mkdirSync(d);process.exit(9);});`;
 assert.equal(spawnSync(process.execPath,['--input-type=module','-e',codigo],{windowsHide:true}).status,9);
 assert.throws(()=>f.altaProyecto('Caída','',{...si,coleccion:{base}}),/ya no existe/);
 t.liberarCandado({confirmadoPorPersona:true});
 const r=f.altaProyecto('Caída','',{...si,coleccion:{base}});
 assert.deepEqual(readdirSync(base),[nombreCarpeta('Caída','proyecto-caida')]);assert.equal(r.ubicacion.direccion,join(base,nombreCarpeta('Caída','proyecto-caida')));
 assert.equal(t.leer('proyectos').length,1);assert.equal(t.leer('colecciones').length,1);assert.deepEqual(t.operacionesPendientes(),[]);
});
test('dos sesiones abren el mismo proyecto a la vez: un proyecto, una colección y una carpeta',async()=>{
 const {t}=nueva(),base=mkdtempSync(join(tmpdir(),'mind-v2-dos-'));
 const correr=()=>new Promise((bien,mal)=>{
  const codigo=`import {abrirTablas} from ${JSON.stringify(urlTablas)};import {abrirFrentes} from ${JSON.stringify(urlFrentes)};const f=abrirFrentes(abrirTablas(${JSON.stringify(t.raiz)}));
  for(let n=0;n<400;n++){try{f.altaProyecto('Compartido','',{confirmadoPorPersona:true,coleccion:{base:${JSON.stringify(base)}}});console.log('creado');break;}catch(e){if(/duplicado/.test(e.message)){console.log('duplicado');break;}if(!/Memoria ocupada/.test(e.message))throw e;await new Promise(r=>setTimeout(r,10));}}`;
  const p=spawn(process.execPath,['--input-type=module','-e',codigo],{windowsHide:true});let salida='',errores='';
  p.stdout.on('data',d=>salida+=d);p.stderr.on('data',d=>errores+=d);p.on('error',mal);p.on('exit',c=>c===0?bien(salida.trim()):mal(Error(errores)));
 });
 assert.deepEqual((await Promise.all([correr(),correr()])).sort(),['creado','duplicado']);
 assert.equal(t.leer('proyectos').length,1);assert.equal(t.leer('colecciones').length,1);assert.equal(readdirSync(base).length,1);assert.deepEqual(t.operacionesPendientes(),[]);
});
