import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {abrirTablas} from './tablas.mjs';
// Lote de Colecciones (Bloque 3): las mismas reglas que una escritura individual, un bloque por archivo y recuperación por operación.
const si={confirmadoPorPersona:true};
function nueva() {
  const t=abrirTablas(join(mkdtempSync(join(tmpdir(),'mind-lote-')),'Memoria')).inicializar();
  const p=t.alta('proyectos',{tipo:'proyecto',nombre:'P',estado:'activo'});
  const c=t.alta('colecciones',{clase:'coleccion',nombre:'Raíz',proyecto:p.id,direccion:'Colecciones/Raiz'});
  const {rama}=t.abrirRama('colecciones',c.id,si);
  return {t,c,rama};
}
const lineas=(t,rama)=>{const p=join(t.raiz,'Tablas','colecciones',rama+'.jsonl');return existsSync(p)?readFileSync(p,'utf8').split('\n').filter(Boolean).length:0;};

test('lote: solo dentro de una operación y solo para Colecciones',()=>{
  const {t,rama}=nueva(),api=t.operacion({idPedido:'fuera',tipo:'prueba'},ctx=>ctx);
  assert.throws(()=>api.resultado.lote('colecciones',[{nuevo:true,clave:'a',rama,datos:{nombre:'a',direccion:'a.txt'}}]),/dentro de una operación/);
  assert.throws(()=>t.operacion({idPedido:'otra',tipo:'prueba'},ctx=>ctx.lote('conceptos',[])),/solo Colecciones/);
});

test('lote: escribe muchas filas en un bloque por rama y el reintento con la misma clave no duplica',()=>{
  const {t,c,rama}=nueva(),cambios=Array.from({length:500},(_,i)=>({nuevo:true,clave:'f'+i,rama,datos:{nombre:'f'+i,direccion:'f'+i+'.txt'}}));
  const r=t.operacion({idPedido:'lote-1',tipo:'prueba'},ctx=>ctx.lote('colecciones',cambios));
  assert.equal(r.resultado.escritos,500);assert.equal(r.recibo.escritos.length,500);assert.equal(lineas(t,rama),500);
  const filas=t.leer('colecciones',{rama});assert.ok(filas.every(f=>f.padre===c.id&&f.coleccion===c.id&&f.clase==='elemento'&&f.ubicacion==='relativa'));
  const otra=t.operacion({idPedido:'lote-1',tipo:'prueba'},ctx=>ctx.lote('colecciones',cambios));
  assert.deepEqual([otra.resultado.escritos,otra.resultado.sinCambios],[0,500]);assert.equal(lineas(t,rama),500);
  assert.throws(()=>t.operacion({idPedido:'lote-1',tipo:'prueba'},ctx=>ctx.lote('colecciones',[{...cambios[0],datos:{nombre:'otro',direccion:'otro.txt'}}])),/ID duplicado/);
  assert.ok(existsSync(join(t.raiz,'Vistas','Colecciones',rama+'.md')));
});

test('lote: una validación fallida no escribe nada ni deja lecturas falsas en la sesión',()=>{
  const {t,rama}=nueva(),antes=readFileSync(join(t.raiz,'Tablas','colecciones.jsonl'),'utf8');
  const cambios=[{nuevo:true,clave:'bien',rama,datos:{nombre:'bien',direccion:'bien.txt'}},{nuevo:true,clave:'mal',rama,datos:{nombre:'mal',direccion:'../fuera.txt'}}];
  assert.throws(()=>t.operacion({idPedido:'invalido',tipo:'prueba'},ctx=>{try{ctx.lote('colecciones',cambios);}catch(e){assert.equal(ctx.leer('colecciones',{rama}).length,0);throw e;}}),e=>/incompatible/.test(e.message)&&e.recibo.guardado===false);
  assert.equal(lineas(t,rama),0);assert.equal(readFileSync(join(t.raiz,'Tablas','colecciones.jsonl'),'utf8'),antes);assert.deepEqual(t.operacionesPendientes(),[]);
  assert.throws(()=>t.operacion({idPedido:'propiedad',tipo:'prueba'},ctx=>ctx.lote('colecciones',[{nuevo:true,clave:'x',rama,datos:{nombre:'x',direccion:'x.txt',proyecto:'otro'}}])),/no la copia/);
});

test('lote: abrir ramas exige confirmación o autonomía; padres y ciclos siguen las reglas de Tablas',()=>{
  const {t,rama}=nueva();
  const carpeta=[{nuevo:true,clave:'sub',rama,datos:{clase:'subcoleccion',nombre:'Sub',direccion:'Sub',rama:'sub-rama'}},{nuevo:true,clave:'hijo',rama:'sub-rama',datos:{nombre:'h',direccion:'Sub/h.txt'}}];
  assert.throws(()=>t.operacion({idPedido:'ramas',tipo:'prueba'},ctx=>ctx.lote('colecciones',carpeta)),e=>e.codigo==='CONFIRMAR_RAMAS'&&e.necesitaDecision===true);
  assert.equal(lineas(t,rama),0);
  const r=t.operacion({idPedido:'ramas',tipo:'prueba'},ctx=>ctx.lote('colecciones',carpeta,si));
  assert.equal(r.resultado.escritos,2);const sub=t.leer('colecciones',{rama})[0];
  assert.equal(t.leer('colecciones',{rama:'sub-rama'})[0].padre,sub.id);assert.equal(t.leer('colecciones',{rama:'sub-rama'})[0].coleccion,t.leer('colecciones')[0].id);
  assert.throws(()=>t.operacion({idPedido:'doble',tipo:'prueba'},ctx=>ctx.lote('colecciones',[{nuevo:true,clave:'otra',rama,datos:{clase:'subcoleccion',nombre:'Otra',direccion:'Otra',rama:'sub-rama'}}],si)),/ya tiene un padre/);
  assert.throws(()=>t.operacion({idPedido:'huerfana',tipo:'prueba'},ctx=>ctx.lote('colecciones',[{nuevo:true,clave:'h',rama:'sin-padre',datos:{nombre:'h',direccion:'h.txt'}}],si)),/Rama sin fila padre/);
  assert.throws(()=>t.operacion({idPedido:'clase',tipo:'prueba'},ctx=>ctx.lote('colecciones',[{id:sub.id,rama,datos:{clase:'elemento'}}])),/clase/);
});

test('descartar una operación pendiente exige confirmación y no aplica a una con escrituras duraderas',()=>{
  const {t}=nueva();
  assert.throws(()=>t.operacion({idPedido:'pasos',tipo:'prueba'},ctx=>{ctx.marcar('paso',{hecho:true});throw new Error('corte');}),/corte/);
  assert.throws(()=>t.descartarOperacion({idPedido:'pasos'}),/confirmadoPorPersona/);
  assert.deepEqual(t.descartarOperacion({idPedido:'pasos',...si}),{descartada:true,idPedido:'pasos',tipo:'prueba',pasos:{paso:{hecho:true}}});
  assert.throws(()=>t.operacion({idPedido:'escrita',tipo:'prueba'},ctx=>{ctx.alta('conceptos',{concepto:'C',tema:'T'},{clave:'c'});throw new Error('corte');}),/corte/);
  assert.throws(()=>t.descartarOperacion({idPedido:'escrita',...si}),/escrituras duraderas/);
  assert.equal(t.descartarOperacion({idPedido:'nada',...si}).descartada,false);
});
