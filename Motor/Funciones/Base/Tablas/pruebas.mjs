import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, readdirSync, symlinkSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { abrirTablas, ESQUEMA, VERSION, puertaExtension } from './tablas.mjs';
import { spawn, spawnSync } from 'node:child_process';
import { hostname } from 'node:os';
import { buscar } from '../Buscar/buscar.mjs';
const nueva=()=>abrirTablas(mkdtempSync(join(tmpdir(),'mind-v2-tablas-'))).inicializar();
test('Memoria nace en cero y crea cada tabla, CSV con BOM y vista bajo demanda sin duplicar Markdowns en Tablas/',()=>{
 const t=nueva();assert.equal(Object.keys(ESQUEMA).length,5);assert.deepEqual(readdirSync(t.raiz),[]);
 for(const n of Object.keys(ESQUEMA))assert.deepEqual(t.leer(n),[]);
 const p=t.alta('proyectos',{tipo:'proyecto',nombre:'Base',estado:'activo'});
 assert.equal(readFileSync(join(t.raiz,'Tablas','proyectos.csv'),'utf8')[0],'\ufeff');
 assert.match(readFileSync(join(t.raiz,'Vistas','Inicio.md'),'utf8'),/Proyecto.*Frente.*Turno.*Lo que sigue/);
 assert.equal(existsSync(join(t.raiz,'Tablas','perfil.jsonl')),false);
 assert.doesNotMatch(readFileSync(join(t.raiz,'Vistas','Inicio.md'),'utf8'),/## Perfil/);
 assert.deepEqual(readdirSync(join(t.raiz,'Tablas')).filter(f=>f.endsWith('.md')),[]);
 assert.ok(p.id);
});
test('corregir y retirar conserva cada evento y rechaza ID duplicado',()=>{const t=nueva(),f=t.alta('conceptos',{id:'C1',concepto:'Luz',tema:'Física',sintesis:'Antes'});t.actualizar('conceptos',f.id,{sintesis:'Después'});t.retirar('conceptos',f.id);assert.equal(t.leer('conceptos',{historia:true}).length,3);assert.equal(t.leer('conceptos')[0].vigencia,'reemplazada');assert.throws(()=>t.alta('conceptos',{...f}),/duplicado/);});
test('CSV conserva comas, tildes, comillas y saltos RFC 4180',()=>{const t=nueva();t.alta('conceptos',{concepto:'Diseño, "acción"\nsegunda',tema:'Técnica'});const s=readFileSync(join(t.raiz,'Tablas','conceptos.csv'),'utf8');assert.ok(s.includes('"Diseño, ""acción""\nsegunda"'));assert.ok(s.endsWith('\r\n'));});
test('rechaza columnas, tablas, vigencia y tipos inválidos',()=>{const t=nueva();assert.throws(()=>t.alta('../escape',{}),/desconocida/);assert.throws(()=>t.alta('conceptos',{concepto:'X',tema:'T',privado:1}),/Columna/);assert.throws(()=>t.alta('perfil',{tipo:'entrada',faceta:'X',afirmacion:'X',origen:'confirmado'}),/origen/);assert.throws(()=>t.alta('conceptos',{concepto:'X',tema:'T',vigencia:'borrada'}),/Vigencia/);});
test('un candado impide una segunda escritura y no se retira',()=>{const t=nueva();mkdirSync(join(t.raiz,'Tablas'),{recursive:true});writeFileSync(join(t.raiz,'Tablas','.escritura.lock'),'otro');assert.throws(()=>t.alta('conceptos',{concepto:'X',tema:'T'}),/ocupada/);assert.equal(readFileSync(join(t.raiz,'Tablas','.escritura.lock'),'utf8'),'otro');});
test('una cola JSONL truncada falla sin perder ni agregar datos',()=>{const t=nueva(),dir=join(t.raiz,'Tablas'),p=join(dir,'conceptos.jsonl');mkdirSync(dir,{recursive:true});appendFileSync(p,'{"operacion":');const antes=readFileSync(p,'utf8');assert.throws(()=>t.alta('conceptos',{concepto:'X',tema:'T'}),/dañado/);assert.equal(readFileSync(p,'utf8'),antes);});
test('un registro completo sin salto final admite el siguiente sin pegarlos',()=>{const t=nueva();t.alta('conceptos',{concepto:'A',tema:'T'});const p=join(t.raiz,'Tablas','conceptos.jsonl');writeFileSync(p,readFileSync(p,'utf8').trimEnd());t.alta('conceptos',{concepto:'B',tema:'T'});assert.equal(t.leer('conceptos').length,2);});
test('reglas propuestas o retiradas no se convierten en instrucciones',()=>{const t=nueva();const a=t.alta('decisiones',{tipo:'regla-usuario',proyecto:'General',decision:'Habla breve',estado:'propuesta'});const p=join(t.raiz,'Vistas','Inicio.md'),vista=()=>existsSync(p)?readFileSync(p,'utf8'):'';assert.doesNotMatch(vista(),/Habla breve/);t.actualizar('decisiones',a.id,{estado:'confirmada',limite:'Si cambia el alcance'});assert.match(vista(),/Habla breve.*Si cambia el alcance/);t.retirar('decisiones',a.id);assert.doesNotMatch(vista(),/Habla breve/);});
test('extensiones solo reciben permisos declarados y espacio propio',()=>{const t=nueva();let valida=true;const p={nombre:'ejemplo',autorizado:true,permisos:{leer:['conceptos'],escribir:['propia']},comprobar(){if(!valida)throw Error('cambió');}},api=puertaExtension(t,p);assert.throws(()=>api.alta('perfil',{}),/Permiso/);api.guardarPropia({columnaPropia:'Dato'});assert.match(readFileSync(join(t.raiz,'Tablas','Extensiones','ejemplo.jsonl'),'utf8'),/columnaPropia/);assert.deepEqual(t.leer('perfil'),[]);valida=false;assert.throws(()=>api.leer('conceptos'),/cambió/);assert.throws(()=>puertaExtension(t,{...p,nombre:'../escape'}),/autorizada/);});
test('regenerar restaura una vista propia editada sin tocar el historial y conserva archivos ajenos sin marca con aviso',()=>{
 const t=nueva();t.alta('proyectos',{tipo:'proyecto',nombre:'P',estado:'activo'});
 const p=join(t.raiz,'Tablas','proyectos.jsonl'),antes=readFileSync(p,'utf8');
 writeFileSync(join(t.raiz,'Vistas','Inicio.md'),'<!-- mind:vista-derivada -->\nalterado');
 const r1=t.regenerar();assert.equal(r1.avisos.length,0);
 assert.match(readFileSync(join(t.raiz,'Vistas','Inicio.md'),'utf8'),/## Controlador/);assert.equal(readFileSync(p,'utf8'),antes);
 const ajeno=join(t.raiz,'Vistas','Conceptos.md');writeFileSync(ajeno,'Documento original del usuario, sin marca');
 const r2=t.regenerar();assert.equal(existsSync(ajeno),true);assert.equal(readFileSync(ajeno,'utf8'),'Documento original del usuario, sin marca');
 assert.ok(r2.avisos.some(a=>a.includes('Vistas/Conceptos.md')));
 const c=t.alta('conceptos',{concepto:'Con colisión',tema:'Prueba'});
 assert.equal(readFileSync(ajeno,'utf8'),'Documento original del usuario, sin marca');
 assert.ok(c.recibo.avisos.some(a=>a.includes('Vistas/Conceptos.md')));
});
test('dos procesos escriben sin perder filas ni superponer proyecciones',async()=>{
 const t=nueva(),modulo=new URL('./tablas.mjs',import.meta.url).href;
 const ejecutar=nombre=>new Promise((bien,mal)=>{
   const codigo=`import {abrirTablas} from ${JSON.stringify(modulo)}; const t=abrirTablas(${JSON.stringify(t.raiz)});for(let i=0;i<6;i++){let hecho=false;for(let n=0;n<200;n++){try{t.alta('conceptos',{id:${JSON.stringify(nombre)}+i,concepto:'Prueba '+i,tema:'Concurrente'});hecho=true;break;}catch(e){if(!e.message.includes('Memoria ocupada'))throw e;await new Promise(r=>setTimeout(r,10));}}if(!hecho)throw Error('Reintentos agotados');}`;
   const p=spawn(process.execPath,['--input-type=module','-e',codigo],{windowsHide:true});let errores='';p.stderr.on('data',d=>errores+=d);p.on('error',mal);p.on('exit',c=>c===0?bien():mal(Error(errores)));
 });
 await Promise.all([ejecutar('A'),ejecutar('B')]);assert.equal(t.leer('conceptos').length,12);assert.equal(t.leer('conceptos',{historia:true}).length,12);assert.equal(readFileSync(join(t.raiz,'Tablas','conceptos.csv'),'utf8').trim().split('\r\n').length,13);
});

// Turno 19: árboles derivados, datos intactos y arranque por niveles.
function leerVistas19(t,carpeta='') {
 const dir=join(t.raiz,'Vistas',carpeta),salida=new Map();
 if(!existsSync(dir))return salida;
 for(const e of readdirSync(dir,{withFileTypes:true})) {
  if(e.isDirectory()) for(const [p,s] of leerVistas19(t,join(carpeta,e.name)))salida.set(p,s);
  else if(e.name.endsWith('.md'))salida.set(join(carpeta,e.name).replaceAll('\\','/'),readFileSync(join(dir,e.name),'utf8'));
 }
 return salida;
}
function arbol19(t) {
 const vistas=leerVistas19(t),entrantes=new Map([...vistas.keys()].map(p=>[p,new Set()]));
 for(const [origen,texto] of vistas)for(const [,destino] of texto.matchAll(/\[\[Memoria\/Vistas\/([^|\]]+)\|[^\]]*\]\]/g)) {
  const p=destino+'.md';assert.ok(vistas.has(p),'Enlace roto: '+p);entrantes.get(p).add(origen);
 }
 // Inicio.md es el índice de arranque: puede enlazar proyectos y frentes; el árbol de detalle se cuenta sin él.
 const detalle=p=>p.startsWith('Perfil/')||p.startsWith('Proyectos/');
 for(const [p,padres] of entrantes)if(detalle(p))assert.ok([...padres].filter(o=>o!=='Inicio.md'&&o!=='Índice.md').length<=1,'Un solo padre: '+p);
 const alcanzadas=new Set(),visitar=(p,camino=new Set())=>{assert.ok(!camino.has(p),'Sin ciclos');alcanzadas.add(p);const otro=new Set([...camino,p]);for(const [,dest] of vistas.get(p).matchAll(/\[\[Memoria\/Vistas\/([^|\]]+)\|[^\]]*\]\]/g))visitar(dest+'.md',otro);};
 if(vistas.has('Inicio.md'))visitar('Inicio.md');
 for(const p of vistas.keys())if(detalle(p))assert.ok(alcanzadas.has(p),'Alcanzable desde Inicio: '+p);
 return vistas;
}
test('proyecta proyecto, frente y subfrente, decisiones confirmadas y retira ramas terminadas',()=>{
 const t=nueva(),p=t.alta('proyectos',{id:'p19',tipo:'proyecto',nombre:'Taller',descripcion:'Proyecto de prueba',estado:'activo'});
 const f=t.alta('proyectos',{tipo:'frente',nombre:'Campaña',proyecto:p.id,estado:'activo'}),h=t.alta('proyectos',{tipo:'frente',nombre:'Guion',proyecto:p.id,perteneceA:f.nombre,estado:'pausado',turno:'Persona',loQueSigue:'Revisar'});
 assert.equal(h.perteneceA,f.id);t.alta('decisiones',{proyecto:p.id,decision:'Decisión visible',estado:'confirmada'});t.alta('decisiones',{proyecto:p.id,decision:'Propuesta oculta',estado:'propuesta'});
 const vistas=arbol19(t),detalle=[...vistas].filter(([p])=>p.startsWith('Proyectos/')).map(([,s])=>s).join('\n');assert.match(detalle,/Decisión visible/);assert.doesNotMatch(detalle,/Propuesta oculta/);assert.match(detalle,/Estado: pausado/);
 assert.equal([...vistas.keys()].filter(p=>p.startsWith('Proyectos/')).length,3);
 t.actualizar('proyectos',h.id,{estado:'terminado'});assert.equal([...arbol19(t).keys()].filter(p=>p.startsWith('Proyectos/')).length,2);
 t.actualizar('proyectos',f.id,{estado:'terminado'});assert.equal([...arbol19(t).keys()].filter(p=>p.startsWith('Proyectos/')).length,1);
 t.retirar('proyectos',p.id);assert.equal([...arbol19(t).keys()].filter(p=>p.startsWith('Proyectos/')).length,0);assert.equal(t.leer('proyectos',{historia:true}).length,6);
});
test('facetas, subfacetas, entradas y retiro sin nodos ni enlaces huérfanos',()=>{
 const t=nueva(),f=t.alta('perfil',{tipo:'faceta',faceta:'Arte',afirmacion:'Crear'}),h=t.alta('perfil',{tipo:'faceta',faceta:'Música',perteneceA:f.id});
 const e=t.alta('perfil',{tipo:'entrada',faceta:h.faceta,afirmacion:'Toco piano',origen:'dijo',fuente:'Conversación de prueba'});
 assert.match([...arbol19(t)].filter(([p])=>p.startsWith('Perfil/')).map(([,s])=>s).join('\n'),/Toco piano/);t.retirar('perfil',e.id);assert.doesNotMatch([...arbol19(t)].filter(([p])=>p.startsWith('Perfil/')).map(([,s])=>s).join('\n'),/Toco piano/);
 t.retirar('perfil',f.id);assert.equal([...arbol19(t).keys()].filter(p=>p.startsWith('Perfil/')).length,0);assert.equal(t.leer('perfil').length,3);
});
test('proyección determinista y nombres hostiles o repetidos no crean enlaces ni rutas arbitrarias',()=>{
 const t=nueva(),p=t.alta('proyectos',{tipo:'proyecto',nombre:'CON/../[[Ajeno|enlace]]',estado:'activo'});
 for(let i=0;i<2;i++)t.alta('proyectos',{tipo:'frente',nombre:'Igual',proyecto:p.id,estado:'activo'});
 const antes=[...arbol19(t)];t.regenerar();assert.deepEqual([...arbol19(t)],antes);assert.equal(antes.filter(([p])=>p.startsWith('Proyectos/')).length,3);assert.doesNotMatch(antes.map(([,s])=>s).join('\n'),/\[\[Ajeno/);
});
test('cerrar o retirar padre quita descendientes solo de las vistas; reabrir reconstruye',()=>{
 const t=nueva(),p=t.alta('proyectos',{tipo:'proyecto',nombre:'P',estado:'activo'}),f=t.alta('proyectos',{tipo:'frente',nombre:'F',proyecto:p.id,estado:'activo'}),h=t.alta('proyectos',{tipo:'frente',nombre:'H',proyecto:p.id,perteneceA:f.id,estado:'activo'});
 t.actualizar('proyectos',f.id,{estado:'terminado'});assert.equal([...arbol19(t).keys()].filter(p=>p.startsWith('Proyectos/')).length,1);assert.equal(t.leer('proyectos').find(x=>x.id===h.id).estado,'activo');
 t.actualizar('proyectos',f.id,{estado:'activo'});assert.equal([...arbol19(t).keys()].filter(p=>p.startsWith('Proyectos/')).length,3);t.retirar('proyectos',p.id);assert.equal([...arbol19(t).keys()].filter(p=>p.startsWith('Proyectos/')).length,0);
});
test('fábrica nace sin vistas y facetas cíclicas no generan ramas huérfanas',()=>{
 const t=nueva();assert.equal(leerVistas19(t).size,0);t.alta('perfil',{id:'fa',tipo:'faceta',faceta:'A',perteneceA:'B'});t.alta('perfil',{id:'fb',tipo:'faceta',faceta:'B',perteneceA:'A'});assert.equal(arbol19(t).size,1);
});
test('limpieza de derivados conserva archivos ajenos y rechaza enlaces de directorio',()=>{
 const t=nueva(),dir=join(t.raiz,'Vistas','Proyectos');mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'original.md'),'Documento del usuario');t.regenerar();assert.equal(readFileSync(join(dir,'original.md'),'utf8'),'Documento del usuario');
 const exterior=mkdtempSync(join(tmpdir(),'mind-v2-fuera-'));writeFileSync(join(exterior,'original.md'),'No tocar');
 const p=join(t.raiz,'Vistas','Perfil');symlinkSync(exterior,p,process.platform==='win32'?'junction':'dir');assert.throws(()=>t.regenerar(),/enlaces/);assert.equal(readFileSync(join(exterior,'original.md'),'utf8'),'No tocar');
});

test('Decisiones, Colecciones y Conceptos generan su vista única en Vistas/ solo al tener datos y sin duplicar en Tablas/',()=>{
 const t=nueva();
 for(const titulo of ['Decisiones','Colecciones','Conceptos'])assert.equal(existsSync(join(t.raiz,'Vistas',titulo+'.md')),false);
 t.alta('decisiones',{proyecto:'General',decision:'Acuerdo',estado:'propuesta'});
 t.alta('colecciones',{nombre:'C',direccion:'Colecciones/C'});
 t.alta('conceptos',{concepto:'K',tema:'T'});
 for(const [tabla,titulo] of [['decisiones','Decisiones'],['colecciones','Colecciones'],['conceptos','Conceptos']]){
  const s=readFileSync(join(t.raiz,'Vistas',titulo+'.md'),'utf8');assert.match(s,/1 registros · 1 vigentes/);
  const cabecera=s.split('\n').find(l=>l.startsWith('| '));assert.equal(cabecera.split(' | ').length,ESQUEMA[tabla].length);assert.match(cabecera,/ID.*Fecha/);
 }
 assert.deepEqual(readdirSync(join(t.raiz,'Tablas')).filter(f=>f.endsWith('.md')),[]);
});
test('las vistas de consulta se actualizan, muestran retiros y conservan historia sin duplicar filas',()=>{
 const t=nueva(),p=join(t.raiz,'Vistas','Conceptos.md');
 const f=t.alta('conceptos',{id:'visible-1',concepto:'Primero',sintesis:'Una explicación',tema:'Prueba'});assert.match(readFileSync(p,'utf8'),/Primero.*Una explicación/);
 t.actualizar('conceptos',f.id,{concepto:'Corregido'});let s=readFileSync(p,'utf8');assert.match(s,/Corregido/);assert.doesNotMatch(s,/Primero/);assert.match(s,/1 registros/);
 t.retirar('conceptos',f.id);s=readFileSync(p,'utf8');assert.match(s,/Corregido.*reemplazada/);assert.match(s,/0 vigentes/);assert.equal(t.leer('conceptos',{historia:true}).length,3);
 const datos=readFileSync(join(t.raiz,'Tablas','conceptos.jsonl'),'utf8');writeFileSync(p,'<!-- mind:vista-derivada -->\nCambios manuales');t.regenerar();assert.match(readFileSync(p,'utf8'),/Corregido/);assert.equal(readFileSync(join(t.raiz,'Tablas','conceptos.jsonl'),'utf8'),datos);
});
test('celdas de vistas no interpretan HTML ni enlaces aportados por los datos',()=>{
 const t=nueva();t.alta('conceptos',{concepto:'<script>[[Nodo]]</script>',sintesis:'A | B\nC & D',tema:'Prueba'});
 const s=readFileSync(join(t.raiz,'Vistas','Conceptos.md'),'utf8');assert.ok(s.includes('&lt;script&gt;&#91;&#91;Nodo&#93;&#93;&lt;/script&gt;'));assert.ok(s.includes('A \\| B C &amp; D'));assert.doesNotMatch(s,/<script>|\[\[Nodo/);
});

test('cada uno de los cinco dominios proyecta su vista en Vistas/ sin duplicar archivos en Tablas/',()=>{
 const t=nueva();t.alta('perfil',{tipo:'faceta',faceta:'Faceta visible',afirmacion:'A'});const p=t.alta('proyectos',{tipo:'proyecto',nombre:'Proyecto visible',estado:'activo'});
 t.alta('decisiones',{proyecto:p.id,decision:'Decisión visible en tabla',estado:'propuesta'});t.alta('colecciones',{nombre:'Colección visible',direccion:'Colecciones/Prueba'});t.alta('conceptos',{concepto:'Concepto visible',tema:'Prueba'});
 for(const [archivo,texto] of [['Inicio.md','Faceta visible'],['Inicio.md','Proyecto visible'],['Decisiones.md','Decisión visible en tabla'],['Colecciones.md','Colección visible'],['Conceptos.md','Concepto visible']])assert.ok(readFileSync(join(t.raiz,'Vistas',archivo),'utf8').includes(texto));
 assert.deepEqual(readdirSync(join(t.raiz,'Tablas')).filter(f=>f.endsWith('.md')),[]);
});

test('Turno 30: fallo en otra tabla entrega recibo con ID guardado, proyecta vistas sanas y reintentar no duplica',()=>{
 const t=nueva();mkdirSync(join(t.raiz,'Tablas'),{recursive:true});writeFileSync(join(t.raiz,'Tablas','perfil.jsonl'),'{"operacion":');
 const capturados=[];
 for(let i=0;i<2;i++){try{t.alta('conceptos',{concepto:'Mismo pedido',tema:'T'});}catch(e){capturados.push(e);}}
 assert.equal(capturados.length,2);
 assert.equal(capturados[0].guardado,true);assert.equal(capturados[0].vistaPendiente,true);assert.ok(capturados[0].id);
 assert.equal(capturados[1].id,capturados[0].id);assert.equal(capturados[1].recibo.reintentoIdempotente,true);
 assert.equal(t.leer('conceptos').length,1);assert.equal(t.leer('conceptos',{historia:true}).length,1);
 assert.equal(existsSync(join(t.raiz,'Vistas','Conceptos.md')),true);
 writeFileSync(join(t.raiz,'Tablas','perfil.jsonl'),'');
 const recuperado=t.alta('conceptos',{concepto:'Mismo pedido',tema:'T'});
 assert.equal(recuperado.id,capturados[0].id);assert.equal(recuperado.recibo.vistaPendiente,false);assert.equal(t.leer('conceptos').length,1);
 const conPedido1=t.alta('conceptos',{concepto:'Con pedido estable',tema:'T'},{idPedido:'req-42'});
 const conPedido2=t.alta('conceptos',{concepto:'Con pedido estable',tema:'T'},{idPedido:'req-42'});
 assert.equal(conPedido1.id,conPedido2.id);assert.equal(t.leer('conceptos').length,2);
});

test('Turno 30: actualizar rechaza cambiar el tipo de un registro existente o asignar proyecto padre a un proyecto',()=>{
 const t=nueva(),p=t.alta('proyectos',{tipo:'proyecto',nombre:'P',estado:'activo'}),q=t.alta('proyectos',{tipo:'proyecto',nombre:'Q',estado:'activo'}),h=t.alta('proyectos',{tipo:'frente',nombre:'Hijo',proyecto:p.id,estado:'activo'});
 assert.throws(()=>t.actualizar('proyectos',p.id,{tipo:'frente',proyecto:q.id}),/cambiar el tipo/);
 assert.throws(()=>t.actualizar('proyectos',h.id,{tipo:'proyecto'}),/cambiar el tipo/);
 assert.throws(()=>t.actualizar('proyectos',p.id,{proyecto:q.id}),/pertenecer a otro proyecto/);
 const faceta=t.alta('perfil',{tipo:'faceta',faceta:'Arte'});
 assert.throws(()=>t.actualizar('perfil',faceta.id,{tipo:'entrada',afirmacion:'A',origen:'dijo'}),/cambiar el tipo/);
 assert.match(readFileSync(join(t.raiz,'Vistas','Inicio.md'),'utf8'),/Hijo/);
});

test('Turno 30: guardarPropia de extensión respeta candados de adaptación, escritura y versión de Memoria',()=>{
 const t=nueva(),permiso={nombre:'ext',autorizado:true,permisos:{leer:['conceptos'],escribir:['propia']},comprobar(){}},api=puertaExtension(t,permiso);
 writeFileSync(join(t.raiz,'.adaptacion.lock'),'adaptando');
 assert.throws(()=>api.guardarPropia({dato:'x'}),/adaptación/);
 writeFileSync(join(t.raiz,'.escritura.lock'),'ocupado');
 rmLock(join(t.raiz,'.adaptacion.lock'));
 assert.throws(()=>api.guardarPropia({dato:'x'}),/ocupada/);
 rmLock(join(t.raiz,'.escritura.lock'));
 mkdirSync(join(t.raiz,'Tablas'),{recursive:true});writeFileSync(join(t.raiz,'Tablas','.escritura.lock'),'ocupado-tabla');
 assert.throws(()=>api.guardarPropia({dato:'x'}),/ocupada/);
 rmLock(join(t.raiz,'Tablas','.escritura.lock'));
 writeFileSync(join(t.raiz,'version.json'),JSON.stringify({memoria:99}));
 assert.throws(()=>api.guardarPropia({dato:'x'}),/incompatible/);
 writeFileSync(join(t.raiz,'version.json'),JSON.stringify({memoria:VERSION}));
 const fila=api.guardarPropia({dato:'ok'});assert.equal(fila.dato,'ok');
});
function rmLock(p){if(existsSync(p))unlinkSync(p);}


test('reintentos intercalados conservan cada recibo pendiente hasta confirmar su entrega',()=>{
 const t=nueva();mkdirSync(join(t.raiz,'Tablas'),{recursive:true});writeFileSync(join(t.raiz,'Tablas','perfil.jsonl'),'{');
 const ids=[];for(const concepto of ['A','B','A'])try{t.alta('conceptos',{concepto,tema:'T'});}catch(e){assert.equal(e.guardado,true);ids.push(e.id);}
 assert.equal(ids[0],ids[2]);assert.equal(t.leer('conceptos').length,2);
 writeFileSync(join(t.raiz,'Tablas','perfil.jsonl'),'');
 assert.equal(t.alta('conceptos',{concepto:'A',tema:'T'}).id,ids[0]);
 assert.equal(t.alta('conceptos',{concepto:'B',tema:'T'}).id,ids[1]);
 assert.equal(t.leer('conceptos',{historia:true}).length,2);
 assert.notEqual(t.alta('conceptos',{concepto:'A',tema:'T'}).id,ids[0]);
});

test('índices por niveles: abrir una rama exige confirmación; cada rama es su propio archivo con CSV y vista',()=>{
 const t=nueva(),aurora=t.alta('colecciones',{nombre:'Taller Aurora',direccion:'D:/Taller Aurora'});
 assert.throws(()=>t.alta('colecciones',{nombre:'Foto',direccion:'D:/x.jpg'},{rama:'sin-padre'}),/Rama sin fila padre/);
 assert.throws(()=>t.abrirRama('colecciones',aurora.id),/confirmadoPorPersona/);
 assert.throws(()=>t.abrirRama('perfil','x',{confirmadoPorPersona:true}),/no admite ramas/);
 const {rama}=t.abrirRama('colecciones',aurora.id,{confirmadoPorPersona:true});assert.match(rama,/^taller-aurora-[0-9a-f]{6}$/);
 assert.equal(t.abrirRama('colecciones',aurora.id,{confirmadoPorPersona:true}).existente,true);
 const foto=t.alta('colecciones',{nombre:'Bolso de muestra frente.jpg',direccion:'D:/Aurora/Muestras/frente.jpg',patron:'foto de producto'},{rama});
 assert.equal(t.leer('colecciones').length,1);assert.equal(t.leer('colecciones',{rama}).length,1);
 assert.ok(existsSync(join(t.raiz,'Tablas','colecciones',rama+'.jsonl'))&&existsSync(join(t.raiz,'Tablas','colecciones',rama+'.csv')));
 assert.match(readFileSync(join(t.raiz,'Vistas','Colecciones',rama+'.md'),'utf8'),/Bolso de muestra/);
 assert.doesNotMatch(readFileSync(join(t.raiz,'Vistas','Colecciones.md'),'utf8'),/Bolso de muestra/);
 const sub=t.abrirRama('colecciones',foto.id,{rama,nombre:'Fotos',confirmadoPorPersona:true});
 t.alta('colecciones',{nombre:'Otra.jpg',direccion:'D:/Aurora/o.jpg'},{rama:sub.rama});assert.equal(t.leer('colecciones',{rama:sub.rama}).length,1);
 t.retirar('colecciones',foto.id,{rama});assert.equal(t.leer('colecciones',{rama})[0].vigencia,'reemplazada');
 assert.deepEqual(t.ramas('colecciones'),[rama,sub.rama].sort());
 assert.throws(()=>t.leer('colecciones',{rama:'../escape'}),/Rama inválida/);
 const antes=readFileSync(join(t.raiz,'Tablas','colecciones',rama+'.jsonl'),'utf8');t.regenerar();assert.equal(readFileSync(join(t.raiz,'Tablas','colecciones',rama+'.jsonl'),'utf8'),antes);assert.ok(existsSync(join(t.raiz,'Vistas','Colecciones',sub.rama+'.md')));
});
test('con autonomía confirmada el Motor abre ramas sin preguntar, y una tabla de más de 100 filas avisa',()=>{
 const t=nueva(),c=t.alta('conceptos',{concepto:'Física',tema:'Ciencia'});
 const d=t.alta('decisiones',{tipo:'autonomia',proyecto:'General',condicion:'ramas',decision:'automática',estado:'propuesta'});
 assert.throws(()=>t.abrirRama('conceptos',c.id),/confirmadoPorPersona/);
 t.actualizar('decisiones',d.id,{estado:'confirmada'});
 const {rama}=t.abrirRama('conceptos',c.id);
 let ultimo;for(let i=0;i<101;i++)ultimo=t.alta('conceptos',{concepto:i===7?'Inducción electromagnética':'Concepto '+i,tema:'Física'},{rama});
 assert.ok(ultimo.recibo.avisos.some(a=>/más de 100/.test(a)),'aviso de tamaño');
 assert.equal(buscar(t,{tabla:'conceptos',rama,texto:'inducción'})[0].fila.concepto,'Inducción electromagnética');
 assert.equal(buscar(t,{tabla:'conceptos',texto:'inducción'}).length,0);
});
test('la ficha del frente trae su proyecto y los índices conectados; el Controlador nombra el frente sin ruta',()=>{
 const t=nueva(),p=t.alta('proyectos',{tipo:'proyecto',nombre:'Taller Aurora',descripcion:'Talleres',estado:'activo'});
 const f=t.alta('proyectos',{tipo:'frente',nombre:'Contenido de muestra',proyecto:p.id,estado:'activo',loQueSigue:'Grabar'});
 t.alta('decisiones',{proyecto:p.id,decision:'Fondo blanco',estado:'confirmada'});
 t.alta('colecciones',{nombre:'Recursos de producto',direccion:'D:/Aurora/Recursos',conectadoA:[f.id]});
 t.alta('conceptos',{concepto:'Bolso de muestra',tema:'Productos',conectadoA:[p.id]});
 const fichas=[...leerVistas19(t)].filter(([k])=>k==='Proyectos/Taller Aurora - Contenido de muestra.md').map(([,v])=>v);assert.equal(fichas.length,1);
 assert.match(fichas[0],/Del proyecto[\s\S]*Talleres[\s\S]*Fondo blanco/);
 assert.match(fichas[0],/Para trabajar[\s\S]*\[Recursos de producto\]\(file:\/\/\/D:\/Aurora\/Recursos\)[\s\S]*Bolso de muestra/);
 assert.ok(fichas[0].includes('ID: '+f.id));
 const inicio=readFileSync(join(t.raiz,'Vistas','Inicio.md'),'utf8');
 assert.match(inicio,/\| Taller Aurora \| Contenido de muestra \|\s*\| Grabar \|/);
 assert.ok(!inicio.includes('[[Memoria/Vistas/Proyectos/'),'Inicio no lleva rutas de fichas');
 assert.ok(inicio.includes('[[Memoria/Vistas/Índice|Índice]]'),'Inicio lleva al Índice');
 assert.match(readFileSync(join(t.raiz,'Vistas','Índice.md'),'utf8'),/\[\[Memoria\/Vistas\/Proyectos\/Taller Aurora - Contenido de muestra\|Contenido de muestra\]\]/);
 arbol19(t);
});

// Bloque 1 · esquema 2: propiedad, clase y ubicación de Colecciones; referencias de los frentes; operaciones recuperables.
test('esquema 2: la colección raíz pertenece a un proyecto; sus hijos viven en su rama y heredan padre y colección',()=>{
 const t=nueva(),p=t.alta('proyectos',{tipo:'proyecto',nombre:'P',estado:'activo'});
 const c=t.alta('colecciones',{nombre:'Raíz',direccion:'D:/P',proyecto:p.id});
 assert.equal(c.clase,'coleccion');assert.equal(c.ubicacion,'local');
 assert.throws(()=>t.alta('colecciones',{nombre:'Otra',direccion:'D:/Q',proyecto:p.id}),/ya tiene su colección raíz/);
 assert.throws(()=>t.alta('colecciones',{nombre:'X',direccion:'D:/X',proyecto:'no-existe'}),/inexistente/);
 assert.throws(()=>t.alta('colecciones',{clase:'elemento',nombre:'E',direccion:'e.jpg'}),/rama de su colección/);
 const {rama}=t.abrirRama('colecciones',c.id,{confirmadoPorPersona:true});
 const sub=t.alta('colecciones',{clase:'subcoleccion',nombre:'Fotos',direccion:'Fotos'},{rama});
 assert.equal(sub.padre,c.id);assert.equal(sub.coleccion,c.id);assert.equal(sub.ubicacion,'relativa');assert.equal(sub.proyecto,undefined);
 const r2=t.abrirRama('colecciones',sub.id,{rama,confirmadoPorPersona:true}).rama;
 const foto=t.alta('colecciones',{nombre:'a.jpg',direccion:'Fotos/a.jpg'},{rama:r2});
 assert.equal(foto.clase,'elemento');assert.equal(foto.padre,sub.id);assert.equal(foto.coleccion,c.id);
 assert.throws(()=>t.alta('colecciones',{nombre:'b',direccion:'b',proyecto:p.id},{rama}),/propiedad/);
 assert.throws(()=>t.alta('colecciones',{nombre:'b',direccion:'b',padre:'otro'},{rama}),/padre/);
 assert.throws(()=>t.alta('colecciones',{clase:'coleccion',nombre:'b',direccion:'D:/b'},{rama}),/tabla principal/);
 assert.throws(()=>t.actualizar('colecciones',c.id,{clase:'elemento'}),/clase/);
 t.retirar('colecciones',c.id);assert.equal(t.alta('colecciones',{nombre:'Nueva',direccion:'D:/N',proyecto:p.id}).proyecto,p.id);
});
test('esquema 2: ubicaciones válidas y un enlace nunca se suma a una ruta local',()=>{
 const t=nueva(),n=t.alta('colecciones',{nombre:'Nube',direccion:'https://drive.example/carpeta'});assert.equal(n.ubicacion,'enlace');
 const {rama}=t.abrirRama('colecciones',n.id,{confirmadoPorPersona:true});
 assert.throws(()=>t.alta('colecciones',{nombre:'a.pdf',direccion:'a.pdf'},{rama}),/enlace no se combina/);
 assert.equal(t.alta('colecciones',{nombre:'a.pdf',direccion:'https://drive.example/a'},{rama}).ubicacion,'enlace');
 assert.equal(t.alta('colecciones',{nombre:'Dentro',direccion:'Colecciones/Dentro'}).ubicacion,'mind');
 assert.equal(t.alta('colecciones',{nombre:'Sinc',direccion:'C:\\Users\\Ana\\OneDrive\\Sinc',ubicacion:'sincronizada'}).ubicacion,'sincronizada');
 assert.equal(t.alta('colecciones',{nombre:'Red',direccion:'\\\\servidor\\compartida'}).ubicacion,'local');
 assert.throws(()=>t.alta('colecciones',{nombre:'Mal',direccion:'../fuera',ubicacion:'mind'}),/incompatible/);
 assert.throws(()=>t.alta('colecciones',{nombre:'Mal',direccion:'Relativa',ubicacion:'local'}),/incompatible/);
 assert.throws(()=>t.alta('colecciones',{nombre:'Mal',direccion:'C:/x',ubicacion:'enlace'}),/incompatible/);
 assert.throws(()=>t.alta('colecciones',{nombre:'Mal',direccion:'C:/x',ubicacion:'relativa'}),/Ubicación inválida/);
 assert.throws(()=>t.alta('colecciones',{nombre:'Mal',direccion:'C:/x',disponibilidad:'tal vez'}),/Disponibilidad/);
});
test('esquema 2: un frente registra elementos usados por referencia, validados al registrarse',()=>{
 const t=nueva(),p=t.alta('proyectos',{tipo:'proyecto',nombre:'P',estado:'activo'}),f=t.alta('proyectos',{tipo:'frente',nombre:'F',proyecto:p.id,estado:'activo'});
 const c=t.alta('colecciones',{nombre:'C',direccion:'D:/C',proyecto:p.id}),{rama}=t.abrirRama('colecciones',c.id,{confirmadoPorPersona:true});
 const e=t.alta('colecciones',{nombre:'logo.png',direccion:'logo.png'},{rama}),ref={coleccion:c.id,elemento:e.id};
 assert.throws(()=>t.actualizar('proyectos',f.id,{elementosUsados:[c.id+'/no-existe']}),/inexistente/);
 assert.throws(()=>t.actualizar('proyectos',f.id,{elementosUsados:'texto'}),/referencias/);
 assert.throws(()=>t.actualizar('proyectos',p.id,{elementosUsados:[ref]}),/Solo un frente/);
 assert.throws(()=>t.actualizar('proyectos',f.id,{elementosUsados:[ref,ref]}),/repetida/);
 t.actualizar('proyectos',f.id,{elementosUsados:[ref]});assert.deepEqual(t.leer('proyectos').find(x=>x.id===f.id).elementosUsados,[ref]);
 assert.equal(t.elemento(ref).elemento.nombre,'logo.png');
 t.retirar('colecciones',e.id,{rama});assert.throws(()=>t.elemento(ref),/retirado/);
 t.actualizar('proyectos',f.id,{loQueSigue:'Seguir'});
 assert.ok(readFileSync(join(t.raiz,'Tablas','proyectos.csv'),'utf8').includes(e.id));
});
test('operación compuesta: una sola proyección, diario hasta completar y reanudación sin duplicar',()=>{
 const t=nueva();let vueltas=0;
 const correr=()=>t.operacion({idPedido:'op-1',tipo:'prueba'},ctx=>{
  const a=ctx.alta('conceptos',{concepto:'A',tema:'T'},{clave:'a'});ctx.marcar('mitad',true);
  if(vueltas++===0) throw new Error('corte simulado');
  return [a.id,ctx.alta('conceptos',{concepto:'B',tema:'T'},{clave:'b'}).id];
 });
 assert.throws(correr,e=>e.recibo.guardado===true&&e.recibo.pendiente===true&&/corte/.test(e.message));
 assert.equal(t.operacionesPendientes()[0].estado,'interrumpida');
 assert.match(readFileSync(join(t.raiz,'Vistas','Conceptos.md'),'utf8'),/\| A \|/);
 const {resultado,recibo}=correr();
 assert.equal(t.leer('conceptos',{historia:true}).length,2);assert.deepEqual(t.operacionesPendientes(),[]);assert.equal(recibo.guardado,true);
 assert.deepEqual(correr().resultado,resultado);assert.equal(t.leer('conceptos',{historia:true}).length,2);
 assert.throws(()=>t.operacion({idPedido:'op 2',tipo:'x'},()=>{}),/idPedido/);
 assert.throws(()=>t.operacion({idPedido:'op-3',tipo:'x'},ctx=>ctx.alta('conceptos',{concepto:'C',tema:'T'})),/clave/);
 assert.deepEqual(t.operacionesPendientes(),[]);
});
test('candado de un proceso que murió: se informa, la persona lo libera y la operación se reanuda',()=>{
 const t=nueva(),modulo=new URL('./tablas.mjs',import.meta.url).href;
 const codigo=`import {abrirTablas} from ${JSON.stringify(modulo)};const t=abrirTablas(${JSON.stringify(t.raiz)});t.operacion({idPedido:'caida',tipo:'prueba'},ctx=>{ctx.alta('conceptos',{concepto:'Antes de caer',tema:'T'},{clave:'a'});process.exit(9);});`;
 assert.equal(spawnSync(process.execPath,['--input-type=module','-e',codigo],{windowsHide:true}).status,9);
 assert.throws(()=>t.alta('conceptos',{concepto:'X',tema:'T'}),/ya no existe/);
 assert.throws(()=>t.liberarCandado(),/confirmadoPorPersona/);
 const l=t.liberarCandado({confirmadoPorPersona:true});assert.equal(l.liberado,true);assert.deepEqual(l.operacionesPendientes,['caida']);
 t.operacion({idPedido:'caida',tipo:'prueba'},ctx=>{ctx.alta('conceptos',{concepto:'Antes de caer',tema:'T'},{clave:'a'});ctx.alta('conceptos',{concepto:'Después',tema:'T'},{clave:'b'});});
 assert.equal(t.leer('conceptos',{historia:true}).length,2);assert.deepEqual(t.operacionesPendientes(),[]);
 assert.match(readFileSync(join(t.raiz,'Vistas','Conceptos.md'),'utf8'),/Antes de caer/);
 writeFileSync(join(t.raiz,'.escritura.lock'),JSON.stringify({pid:process.pid,host:hostname(),inicio:'x'}));
 assert.throws(()=>t.liberarCandado({confirmadoPorPersona:true}),/vivo/);unlinkSync(join(t.raiz,'.escritura.lock'));
});

test('dev.26: nombres legibles, colisiones entre proyecto y frente, resumen plegable y conservación de evidencia',()=>{
 const t=nueva(),p=t.alta('proyectos',{tipo:'proyecto',nombre:'Aurora',estado:'activo'});
 const f=t.alta('proyectos',{tipo:'frente',nombre:'Contenido',proyecto:p.id,estado:'activo'});
 const q=t.alta('proyectos',{tipo:'proyecto',nombre:'Aurora - Contenido',estado:'activo'});
 const fac=t.alta('perfil',{tipo:'faceta',faceta:'Aprendizaje',afirmacion:'Aprendo practicando.'});
 t.alta('perfil',{tipo:'entrada',faceta:fac.id,afirmacion:'Puede ayudar la práctica',origen:'interpreta',fuente:'Caso ficticio',evidencia:'Un caso',limites:'Sin confirmar'});
 const before=readFileSync(join(t.raiz,'Tablas','perfil.jsonl'),'utf8');
 const views=arbol19(t),profile=views.get('Perfil/Aprendizaje.md');
 assert.match(profile,/# Aprendizaje[\s\S]*Aprendo practicando\.[\s\S]*<details>[\s\S]*Observación sin confirmar[\s\S]*Caso ficticio[\s\S]*Sin confirmar[\s\S]*<\/details>/);
 const collisions=[...views.keys()].filter(k=>k.startsWith('Proyectos/Aurora - Contenido ('));
 assert.equal(collisions.length,2);assert.notEqual(collisions[0],collisions[1]);
 assert.ok(views.has('Perfil.md'));assert.ok(views.has('Proyectos.md'));
 t.regenerar();assert.equal(readFileSync(join(t.raiz,'Tablas','perfil.jsonl'),'utf8'),before);
});
test('dev.26: Biblioteca agrupa enlaces externos y retiro del último proyecto no deja enlaces rotos',()=>{
 const t=nueva(),p=t.alta('proyectos',{tipo:'proyecto',nombre:'Aurora',estado:'activo'});
 t.alta('colecciones',{nombre:'Recursos',direccion:'G:/Biblioteca/Aurora',ubicacion:'sincronizada',proyecto:p.id});
 let views=arbol19(t);assert.match(views.get('Biblioteca.md'),/## Aurora[\s\S]*file:\/\/\/G:\/Biblioteca\/Aurora/);
 t.retirar('proyectos',p.id);views=arbol19(t);assert.equal(views.has('Proyectos.md'),false);assert.doesNotMatch(views.get('Inicio.md')||'',/Vistas\/Proyectos\|/);
});
