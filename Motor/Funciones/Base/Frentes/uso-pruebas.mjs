import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {join,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {abrirTablas,USOS} from '../Tablas/tablas.mjs';
import {abrirFrentes} from './frentes.mjs';
import {abrirColecciones} from '../Colecciones/colecciones.mjs';
// Bloque 4 · Elementos utilizados por los frentes: acción uso, ficha y reubicación. Datos ficticios en carpetas temporales.
const si={confirmadoPorPersona:true};
function nueva() {
  const base=fs.mkdtempSync(join(tmpdir(),'mind-b4-uso-')),escritorio=join(base,'Escritorio');fs.mkdirSync(escritorio);
  const t=abrirTablas(join(base,'Memoria')).inicializar();
  return {base,escritorio,t,f:abrirFrentes(t,{escritorio:()=>escritorio}),c:abrirColecciones(t)};
}
const escribir=(dir,rel,texto)=>{const p=join(dir,...rel.split('/'));fs.mkdirSync(dirname(p),{recursive:true});fs.writeFileSync(p,texto);return p;};
function filas(t,raiz) {
  const salida=[],cola=[raiz.rama];
  while(cola.length){const r=cola.shift();for(const x of t.leer('colecciones',{rama:r})){if(x.vigencia==='vigente')salida.push(x);if(x.rama&&x.vigencia==='vigente')cola.push(x.rama);}}
  return salida;
}
// Proyecto con colección indexada y un frente; devuelve referencias por dirección.
function preparar(entorno,nombre,archivos) {
  const p=entorno.f.altaProyecto(nombre,'',si);
  for(const [rel,texto] of Object.entries(archivos)) escribir(p.coleccion.direccion,rel,texto);
  entorno.c.indexar({coleccion:p.coleccion.id,...si});
  const ref=rel=>({coleccion:p.coleccion.id,elemento:filas(entorno.t,p.coleccion).find(x=>x.direccion===rel).id});
  return {p,ref};
}
const ficha=(t,nombre)=>{const d=join(t.raiz,'Vistas','Proyectos');const n=fs.readdirSync(d).find(x=>x.startsWith('frente - '+nombre+'--'));return fs.readFileSync(join(d,n),'utf8');};
const contar=dir=>{let n=0;for(const e of fs.readdirSync(dir,{withFileTypes:true}))n+=e.isDirectory()?contar(join(dir,e.name)):1;return n;};

test('dos frentes usan el mismo archivo sin copiarlo; retirar el uso de uno conserva el archivo, su índice y el otro uso',()=>{
  const e=nueva(),{p,ref}=preparar(e,'Web',{'logo.svg':'<svg/>','textos.docx':'textos'}),dir=p.coleccion.direccion,archivosAntes=contar(dir);
  const a=e.f.altaFrente({nombre:'Portada',proyecto:p.proyecto.id},si),b=e.f.altaFrente({nombre:'Tienda',proyecto:p.proyecto.id},si);
  const r=e.f.uso({operacion:'registrar',frente:a.id,elementos:[ref('logo.svg'),ref('textos.docx')]});
  assert.equal(r.registrados,2);assert.match(r.nota,/no se copió/);
  assert.equal(e.f.uso({operacion:'registrar',frente:a.id,elementos:[ref('logo.svg')]}).repetido,true);
  e.f.uso({operacion:'registrar',frente:'Tienda',elementos:[ref('logo.svg')]});
  assert.equal(contar(dir),archivosAntes);assert.equal(filas(e.t,p.coleccion).filter(x=>x.nombre==='logo.svg').length,1);
  const consulta=e.f.uso({operacion:'consultar',frente:a.id});
  assert.equal(consulta.total,2);assert.equal(consulta.elementos[0].localizador,join(dir,'logo.svg'));assert.equal(consulta.elementos[0].disponibilidad,'disponible');assert.equal(consulta.elementos[0].propia,true);
  assert.equal(consulta.comprobacion,'datos-registrados');
  const retiro=e.f.uso({operacion:'retirar',frente:a.id,elementos:[ref('logo.svg')]});
  assert.deepEqual([retiro.retirados,retiro.total],[1,1]);
  assert.ok(fs.existsSync(join(dir,'logo.svg')));assert.ok(filas(e.t,p.coleccion).some(x=>x.nombre==='logo.svg'));
  assert.deepEqual(e.f.uso({operacion:'consultar',frente:b.id}).elementos.map(x=>x.elemento),[ref('logo.svg').elemento]);
  assert.equal(e.f.uso({operacion:'retirar',frente:a.id,elementos:[ref('logo.svg')]}).sinCambios,true);
});

test('usar un elemento de otra colección pide confirmación y no cambia su dueño',()=>{
  const e=nueva(),uno=preparar(e,'Uno',{'propio.txt':'a'}),otro=preparar(e,'Otro',{'ajeno.txt':'b'});
  const fr=e.f.altaFrente({nombre:'Mezcla',proyecto:uno.p.proyecto.id},si);
  assert.throws(()=>e.f.uso({operacion:'registrar',frente:fr.id,elementos:[uno.ref('propio.txt'),otro.ref('ajeno.txt')]}),x=>x.codigo==='CONFIRMAR_REUTILIZACION'&&x.necesitaDecision===true&&x.detalle.ajenos[0].elemento===otro.ref('ajeno.txt').elemento);
  assert.deepEqual(e.t.leer('proyectos').find(x=>x.id===fr.id).elementosUsados??[],[]);
  const r=e.f.uso({operacion:'registrar',frente:fr.id,elementos:[uno.ref('propio.txt'),otro.ref('ajeno.txt')],...si});
  assert.deepEqual([r.registrados,r.reutilizados],[2,1]);
  assert.equal(e.t.leer('colecciones').find(x=>x.id===otro.p.coleccion.id).proyecto,otro.p.proyecto.id);
  const ajeno=e.f.uso({operacion:'consultar',frente:fr.id}).elementos.find(x=>x.elemento===otro.ref('ajeno.txt').elemento);
  assert.equal(ajeno.propia,false);assert.equal(ajeno.coleccionNombre,'Otro');
  assert.match(ficha(e.t,'Mezcla'),/ajeno\.txt — .* · disponible · de Otro/);
});

test('referencias inválidas no se escriben; consultar pagina con 10 por defecto y 50 como máximo',()=>{
  const e=nueva(),archivos=Object.fromEntries(Array.from({length:23},(_,i)=>['f'+String(i).padStart(2,'0')+'.txt',String(i)])),{p,ref}=preparar(e,'Muchos',archivos);
  const fr=e.f.altaFrente({nombre:'Lote',proyecto:p.proyecto.id},si);
  assert.throws(()=>e.f.uso({operacion:'registrar',frente:fr.id,elementos:[ref('f00.txt'),{coleccion:p.coleccion.id,elemento:'no-existe'}]}),/inexistente/);
  assert.throws(()=>e.f.uso({operacion:'registrar',frente:fr.id,elementos:['texto']}),/Referencia inválida/);
  assert.throws(()=>e.f.uso({operacion:'registrar',frente:'Ninguno',elementos:[ref('f00.txt')]}),/Frente inexistente/);
  assert.throws(()=>e.f.uso({operacion:'mover',frente:fr.id}),/registrar, retirar o consultar/);
  assert.deepEqual(e.t.leer('proyectos').find(x=>x.id===fr.id).elementosUsados??[],[]);
  e.f.uso({operacion:'registrar',frente:fr.id,elementos:Object.keys(archivos).map(ref)});
  const pag=e.f.uso({operacion:'consultar',frente:fr.id});assert.deepEqual([pag.total,pag.elementos.length,pag.siguiente],[23,10,10]);
  const ultima=e.f.uso({operacion:'consultar',frente:fr.id,desde:20});assert.deepEqual([ultima.elementos.length,ultima.siguiente],[3,null]);
  assert.equal(e.f.uso({operacion:'consultar',frente:fr.id,limite:50}).elementos.length,23);
  assert.throws(()=>e.f.uso({operacion:'consultar',frente:fr.id,limite:51}),/1–50/);
  const comprobado=e.f.uso({operacion:'consultar',frente:fr.id,limite:1,comprobar:true});
  assert.equal(comprobado.comprobacion,'metadatos-locales');assert.equal(comprobado.elementos[0].observada.disponibilidad,'disponible');
});

test('la ficha muestra hasta ocho elementos usados, avisa cuántos más hay y se regenera al cambiar el índice o la raíz',()=>{
  const e=nueva(),archivos=Object.fromEntries(Array.from({length:10},(_,i)=>['Docs/doc '+i+'.txt',String(i)])),{p,ref}=preparar(e,'Ficha',archivos),dir=p.coleccion.direccion;
  const fr=e.f.altaFrente({nombre:'Revisión',proyecto:p.proyecto.id},si);
  e.f.uso({operacion:'registrar',frente:fr.id,elementos:Object.keys(archivos).map(ref)});
  let texto=ficha(e.t,'Revisión');
  assert.match(texto,/## Elementos usados/);
  assert.equal((texto.match(/^- doc \d\.txt — /gm)??[]).length,8);
  assert.match(texto,/…y 2 más: consúltalos con la acción uso/);
  assert.ok(texto.includes(join(dir,'Docs','doc 0.txt')+' · disponible'));
  // Un archivo borrado fuera de Mind: el inventario lo marca ausente y la ficha lo refleja, aunque solo cambió su rama.
  fs.rmSync(join(dir,'Docs','doc 0.txt'));e.c.indexar({coleccion:p.coleccion.id,...si});
  assert.ok(ficha(e.t,'Revisión').includes(join(dir,'Docs','doc 0.txt')+' · ausente'));
  // Reubicar: la ficha muestra la ruta nueva, con los mismos usos.
  const disco=join(e.base,'Disco');fs.mkdirSync(disco);
  const r=e.c.reubicar({coleccion:p.coleccion.id,destino:{base:disco},...si});
  texto=ficha(e.t,'Revisión');
  assert.ok(texto.includes(join(r.coleccion.direccion,'Docs','doc 1.txt')));assert.ok(!texto.includes(join(dir,'Docs','doc 1.txt')));
  assert.equal(e.f.uso({operacion:'consultar',frente:fr.id}).total,10);
  assert.ok(fs.existsSync(join(dir,'Docs','doc 1.txt')));
  // Una referencia cuyo elemento se retiró queda visible como no disponible; no se oculta.
  const raizActual=e.t.leer('colecciones').find(x=>x.id===p.coleccion.id),docs=filas(e.t,raizActual).find(x=>x.direccion==='Docs');
  e.t.retirar('colecciones',ref('Docs/doc 1.txt').elemento,{rama:docs.rama});
  assert.equal(e.f.uso({operacion:'consultar',frente:fr.id,desde:1,limite:1}).elementos[0].estado,'retirado');
  assert.match(ficha(e.t,'Revisión'),/doc 1.txt|referencia no disponible/);
  assert.equal((ficha(e.t,'Revisión').match(/referencia no disponible/g)??[]).length,1);
});

test('reabrir un frente da su contexto y recursos sin una búsqueda general',()=>{
  const e=nueva(),{p,ref}=preparar(e,'Retomar',{'brief.md':'# Encargo','Fotos/portada.jpg':'jpg'});
  const fr=e.f.altaFrente({nombre:'Campaña',proyecto:p.proyecto.id,loQueSigue:'Montar la portada'},si);
  e.f.uso({operacion:'registrar',frente:fr.id,elementos:[ref('brief.md'),ref('Fotos/portada.jpg')]});
  const texto=ficha(e.t,'Campaña');
  assert.match(texto,/Lo que sigue: Montar la portada/);assert.match(texto,/brief\.md — .*brief\.md · disponible/);assert.match(texto,/portada\.jpg — .*portada\.jpg · disponible/);
  for(const r of e.f.uso({operacion:'consultar',frente:fr.id,comprobar:true}).elementos)assert.ok(fs.existsSync(r.localizador));
  assert.equal(e.t.leer('proyectos').filter(x=>x.tipo==='frente').length,1); // Usar recursos no abrió otro frente.
});

test(`un frente registra hasta ${USOS.tope} elementos; desde ${USOS.aviso} recibe aviso para referenciar una subcolección`,()=>{
  const e=nueva(),archivos=Object.fromEntries(Array.from({length:USOS.tope+1},(_,i)=>['Lote/a'+i+'.txt',''])),{p,ref}=preparar(e,'Tope',archivos);
  const fr=e.f.altaFrente({nombre:'Grande',proyecto:p.proyecto.id},si),todos=Object.keys(archivos).map(ref);
  assert.equal(e.f.uso({operacion:'registrar',frente:fr.id,elementos:todos.slice(0,USOS.aviso)}).aviso,undefined);
  assert.match(e.f.uso({operacion:'registrar',frente:fr.id,elementos:todos.slice(USOS.aviso,USOS.tope)}).aviso,/subcolección/);
  assert.throws(()=>e.f.uso({operacion:'registrar',frente:fr.id,elementos:[todos[USOS.tope]]}),x=>x.codigo==='DEMASIADOS_USOS'&&x.necesitaDecision===true);
  assert.equal(e.t.leer('proyectos').find(x=>x.id===fr.id).elementosUsados.length,USOS.tope);
  const sub=filas(e.t,p.coleccion).find(x=>x.direccion==='Lote');
  e.f.uso({operacion:'retirar',frente:fr.id,elementos:[todos[0]]});
  assert.equal(e.f.uso({operacion:'registrar',frente:fr.id,elementos:[{coleccion:p.coleccion.id,elemento:sub.id}]}).registrados,1);
});

test('CLI uso: registrar, consultar y retirar; una reutilización sin confirmar sale con código 2 y detalle',()=>{
  const e=nueva(),uno=preparar(e,'CLI uno',{'a.txt':'a'}),otro=preparar(e,'CLI otro',{'b.txt':'b'}),exec=fileURLToPath(new URL('../../../ejecutar.mjs',import.meta.url));
  const fr=e.f.altaFrente({nombre:'Consola',proyecto:uno.p.proyecto.id},si);
  const cli=op=>{const r=spawnSync(process.execPath,[exec,'uso',e.t.raiz,JSON.stringify({frente:fr.id,...op})],{encoding:'utf8',windowsHide:true});return {status:r.status,json:r.stdout?JSON.parse(r.stdout):null,stderr:r.stderr};};
  const r=cli({operacion:'registrar',elementos:[uno.ref('a.txt')]});assert.equal(r.status,0,r.stderr);assert.equal(r.json.registrados,1);
  const mal=cli({operacion:'registrar',elementos:[otro.ref('b.txt')]});assert.equal(mal.status,2);assert.equal(mal.json.codigo,'CONFIRMAR_REUTILIZACION');assert.equal(mal.json.detalle.ajenos.length,1);
  const q=cli({operacion:'consultar'});assert.equal(q.status,0);assert.equal(q.json.elementos[0].nombre,'a.txt');
  assert.equal(cli({operacion:'retirar',elementos:[uno.ref('a.txt')]}).json.retirados,1);
  assert.ok(fs.existsSync(join(uno.p.coleccion.direccion,'a.txt')));assert.equal(basename(uno.p.coleccion.direccion).startsWith('CLI uno'),true);
});
