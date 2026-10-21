import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {abrirTablas,VERSION} from '../Tablas/tablas.mjs';
import {abrirFrentes} from '../Frentes/frentes.mjs';
import {abrirColecciones} from '../Colecciones/colecciones.mjs';
import {adaptarEsqueleto,detectarVersion} from './migrar.mjs';
// Esquema 2 → 3 (Bloque 4): solo se agregan las columnas tamano y modificado. Ningún evento cambia; el siguiente
// inventario completa los datos sin contarlos como cambios. Memorias ficticias en carpetas temporales.
const si={confirmadoPorPersona:true};
const motorActual=base=>{const m=join(base,'motor');fs.mkdirSync(m);fs.writeFileSync(join(m,'version.json'),JSON.stringify({memoria:VERSION}));return m;};
function textos(dir) {
  const salida={};
  const recorrer=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=join(d,e.name);if(e.isDirectory())recorrer(p);else if(e.name.endsWith('.jsonl'))salida[p.slice(dir.length)]=fs.readFileSync(p,'utf8');}};
  recorrer(dir);return salida;
}

test('esquema 2 → 3 conserva cada evento, ID, rama y referencia; el inventario siguiente solo completa tamaño y fecha',()=>{
  assert.equal(VERSION,3);
  const base=fs.mkdtempSync(join(tmpdir(),'mind-b4-esquema3-')),escritorio=join(base,'Escritorio');fs.mkdirSync(escritorio);
  const memoria=join(base,'Memoria'),t=abrirTablas(memoria).inicializar(),f=abrirFrentes(t,{escritorio:()=>escritorio});
  const p=f.altaProyecto('Previo','',si),dir=p.coleccion.direccion;
  fs.mkdirSync(join(dir,'Docs'));fs.writeFileSync(join(dir,'Docs','a.txt'),'a');fs.writeFileSync(join(dir,'b.txt'),'bb');
  // Filas como las del esquema 2: registradas a mano, sin tamaño ni fecha.
  const docs=t.alta('colecciones',{clase:'subcoleccion',nombre:'Docs',direccion:'Docs'},{rama:p.coleccion.rama}),{rama}=t.abrirRama('colecciones',docs.id,{...si,rama:p.coleccion.rama});
  const a=t.alta('colecciones',{nombre:'a.txt',direccion:'Docs/a.txt',disponibilidad:'disponible'},{rama}),b=t.alta('colecciones',{nombre:'b.txt',direccion:'b.txt'},{rama:p.coleccion.rama});
  const fr=f.altaFrente({nombre:'Usa',proyecto:p.proyecto.id},si),ref={coleccion:p.coleccion.id,elemento:a.id};
  t.actualizar('proyectos',fr.id,{elementosUsados:[ref]});
  fs.writeFileSync(join(memoria,'version.json'),JSON.stringify({memoria:2},null,2)+'\n');
  assert.throws(()=>t.alta('conceptos',{concepto:'X',tema:'Y'}),/requiere adaptación/);
  const antes=textos(join(memoria,'Tablas'));
  const r=adaptarEsqueleto(motorActual(base),memoria);
  assert.deepEqual([r.estado,r.anterior,r.nueva],['adaptada',2,3]);assert.deepEqual(r.pendientes,[]);
  assert.deepEqual(textos(join(memoria,'Tablas')),antes,'ningún evento JSONL cambia');
  assert.equal(detectarVersion(motorActual(fs.mkdtempSync(join(tmpdir(),'mind-b4-motor-'))),memoria).requiereAdaptacion,false);
  assert.ok(fs.existsSync(r.respaldo));
  const t3=abrirTablas(memoria),c=abrirColecciones(t3);
  assert.equal(t3.elemento(ref).elemento.id,a.id);
  const inv=c.indexar({coleccion:p.coleccion.id,...si});
  assert.deepEqual([inv.completados,inv.modificados,inv.nuevos],[2,0,0]);
  assert.equal(t3.leer('colecciones',{rama}).find(x=>x.id===a.id).tamano,'1');assert.equal(t3.leer('colecciones',{rama:p.coleccion.rama}).find(x=>x.id===b.id).tamano,'2');
  assert.deepEqual(abrirFrentes(t3).uso({operacion:'consultar',frente:fr.id}).elementos.map(x=>x.elemento),[a.id]);
});

test('el esquema 1 se adapta directamente al 3 y una versión futura no se adapta hacia atrás',()=>{
  const base=fs.mkdtempSync(join(tmpdir(),'mind-b4-esquema1-')),memoria=join(base,'Memoria');
  fs.mkdirSync(join(memoria,'Tablas','colecciones'),{recursive:true});
  const ev=f=>JSON.stringify({operacion:'poner',fila:{fecha:'2026-10-01T00:00:00.000Z',vigencia:'vigente',...f}})+'\n';
  fs.writeFileSync(join(memoria,'Tablas','proyectos.jsonl'),ev({id:'pA',tipo:'proyecto',nombre:'A',estado:'activo'}));
  fs.writeFileSync(join(memoria,'Tablas','colecciones.jsonl'),ev({id:'cA',nombre:'Colección A',direccion:'D:/A',conectadoA:['pA'],rama:'a-aaaaaa'}));
  fs.writeFileSync(join(memoria,'Tablas','colecciones','a-aaaaaa.jsonl'),ev({id:'e1',nombre:'uno.txt',direccion:'D:/A/uno.txt'}));
  fs.writeFileSync(join(memoria,'version.json'),JSON.stringify({memoria:1}));
  const r=adaptarEsqueleto(motorActual(base),memoria);
  assert.deepEqual([r.estado,r.anterior,r.nueva,r.filasConservadas],['adaptada',1,3,3]);
  const t=abrirTablas(memoria),raiz=t.leer('colecciones')[0];
  assert.deepEqual([raiz.proyecto,raiz.clase,raiz.ubicacion],['pA','coleccion','local']);
  assert.deepEqual(t.leer('colecciones',{rama:'a-aaaaaa'}).map(x=>[x.clase,x.padre,x.tamano]),[['elemento','cA',undefined]]);
  const futura=fs.mkdtempSync(join(tmpdir(),'mind-b4-futura-')),m=join(futura,'Memoria');abrirTablas(m).inicializar().alta('conceptos',{concepto:'C',tema:'T'});
  fs.writeFileSync(join(m,'version.json'),JSON.stringify({memoria:VERSION+1}));
  assert.throws(()=>adaptarEsqueleto(motorActual(futura),m),/no soportada/);
});
