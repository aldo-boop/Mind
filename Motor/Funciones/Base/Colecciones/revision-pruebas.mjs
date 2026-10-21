import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
const base=process.env.MIND_BASE??new URL('../',import.meta.url).href;
const {abrirTablas}=await import(base+'Tablas/tablas.mjs');
const {abrirFrentes}=await import(base+'Frentes/frentes.mjs');
const {abrirColecciones}=await import(base+'Colecciones/colecciones.mjs');
const si={confirmadoPorPersona:true};
function nueva(files={'A/original.txt':'DOCUMENTO','B/testigo.txt':'testigo'}) {
  const dir=fs.mkdtempSync(join(tmpdir(),'mind-revision-b34-')),desk=join(dir,'Escritorio');fs.mkdirSync(desk);
  const t=abrirTablas(join(dir,'Memoria')).inicializar(),f=abrirFrentes(t,{escritorio:()=>desk}),c=abrirColecciones(t),p=f.altaProyecto('Prueba','',si);
  for(const [rel,texto] of Object.entries(files)){const path=join(p.coleccion.direccion,rel);fs.mkdirSync(dirname(path),{recursive:true});fs.writeFileSync(path,texto);}
  c.indexar({coleccion:p.coleccion.id,...si});
  const filas=()=>t.ramas('colecciones').flatMap(r=>t.leer('colecciones',{rama:r}).map(x=>({...x,_rama:r})));
  const original=filas().find(x=>x.direccion===Object.keys(files)[0]),ref={coleccion:p.coleccion.id,elemento:original.id};
  const fr=f.altaFrente({nombre:'Trabajo',proyecto:p.proyecto.id},si);f.uso({operacion:'registrar',frente:fr.id,elementos:[ref]});
  return {dir,t,f,c,p,filas,original,ref,fr,raiz:p.coleccion.direccion};
}
const logs=e=>Object.fromEntries([undefined,...e.t.ramas('colecciones')].map(r=>[r??'raiz',e.t.leer('colecciones',{rama:r,historia:true})]));
function comprobar(e,direccion) {
  const lista=e.filas().filter(x=>x.id===e.ref.elemento&&x.vigencia==='vigente');assert.equal(lista.length,1);assert.equal(lista[0].direccion,direccion);
  assert.equal(e.t.elemento(e.ref).elemento.direccion,direccion);
  assert.equal(e.f.uso({operacion:'consultar',frente:e.fr.id,comprobar:true}).elementos[0].observada.disponibilidad,'disponible');
  assert.deepEqual(e.t.operacionesPendientes(),[]);
}

test('revisión: movimiento cortado dos veces recupera la identidad, el diario y las vistas sin duplicar',()=>{
  const e=nueva(),ramaB=e.filas().find(x=>x.direccion==='B').rama,pedido={coleccion:e.ref.coleccion,revincular:[{elemento:e.ref.elemento,direccion:'B/nuevo.txt'}],idPedido:'mover-recuperable',...si};
  fs.renameSync(join(e.raiz,'A/original.txt'),join(e.raiz,'B/nuevo.txt'));
  const open=fs.openSync;fs.openSync=(p,flags,...o)=>{if(String(p)===join(e.t.raiz,'Tablas','colecciones',ramaB+'.jsonl')&&flags==='a+')throw Object.assign(Error('CORTE DESTINO'),{code:'EACCES'});return open(p,flags,...o);};syncBuiltinESMExports();
  try {for(let i=0;i<2;i++){assert.throws(()=>e.c.indexar(pedido),/CORTE DESTINO/);assert.equal(e.t.operacionesPendientes().length,1);}}
  finally {fs.openSync=open;syncBuiltinESMExports();}
  // Otra instancia, sin caches de la ejecución interrumpida.
  abrirColecciones(abrirTablas(e.t.raiz)).indexar(pedido);comprobar(e,'B/nuevo.txt');
  const antes=e.filas();e.c.indexar(pedido);assert.deepEqual(e.filas(),antes);comprobar(e,'B/nuevo.txt');
  const dir=join(e.t.raiz,'Vistas','Proyectos'),ficha=fs.readdirSync(dir).find(x=>x.startsWith('frente - Trabajo--'));
  assert.ok(fs.readFileSync(join(dir,ficha),'utf8').includes(join(e.raiz,'B/nuevo.txt')));
});

test('revisión: caída real entre ramas deja un lote que otra instancia completa con el mismo ID',()=>{
  const e=nueva(),ramaB=e.filas().find(x=>x.direccion==='B').rama,pedido={coleccion:e.ref.coleccion,revincular:[{elemento:e.ref.elemento,direccion:'B/nuevo.txt'}],idPedido:'caida-real',...si};
  fs.renameSync(join(e.raiz,'A/original.txt'),join(e.raiz,'B/nuevo.txt'));
  const codigo=`import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';import {abrirTablas} from ${JSON.stringify(base+'Tablas/tablas.mjs')};import {abrirColecciones} from ${JSON.stringify(base+'Colecciones/colecciones.mjs')};const original=fs.openSync;fs.openSync=(p,flags,...o)=>{if(String(p)===${JSON.stringify(join(e.t.raiz,'Tablas','colecciones',ramaB+'.jsonl'))}&&flags==='a+')process.exit(71);return original(p,flags,...o);};syncBuiltinESMExports();abrirColecciones(abrirTablas(${JSON.stringify(e.t.raiz)})).indexar(${JSON.stringify(pedido)});`;
  const r=spawnSync(process.execPath,['--input-type=module','-e',codigo],{encoding:'utf8',windowsHide:true});assert.equal(r.status,71,r.stderr);
  assert.equal(e.t.liberarCandado(si).liberado,true);
  abrirColecciones(abrirTablas(e.t.raiz)).indexar(pedido);comprobar(e,'B/nuevo.txt');
});

test('revisión: A → B → A → B conserva el ID, el historial y los usos',()=>{
  const e=nueva();let anterior='A/original.txt';
  for(const destino of ['B/nuevo.txt','A/regreso.txt','B/final.txt']){
    fs.renameSync(join(e.raiz,anterior),join(e.raiz,destino));
    e.c.indexar({coleccion:e.ref.coleccion,revincular:[{elemento:e.ref.elemento,direccion:destino}],...si});comprobar(e,destino);anterior=destino;
  }
  assert.ok(Object.values(logs(e)).flat().filter(x=>x.id===e.ref.elemento).length>=4);
});

test('revisión: fuentes repetidas en revincular se rechazan antes de escribir',()=>{
  const e=nueva({'uno.txt':'UNO','dos.txt':'DOS'});fs.renameSync(join(e.raiz,'uno.txt'),join(e.raiz,'nuevo.txt'));fs.writeFileSync(join(e.raiz,'otro.txt'),'OTRO');const antes=logs(e);
  assert.throws(()=>e.c.indexar({coleccion:e.ref.coleccion,revincular:[{elemento:e.ref.elemento,direccion:'nuevo.txt'},{elemento:e.ref.elemento,direccion:'otro.txt'}],...si}),x=>x.codigo==='REVINCULAR_AMBIGUO');
  assert.deepEqual(logs(e),antes);assert.deepEqual(e.t.operacionesPendientes(),[]);
  e.c.indexar({coleccion:e.ref.coleccion,...si});assert.equal(e.filas().filter(x=>x.vigencia==='vigente'&&x.clase==='elemento'&&x.disponibilidad==='disponible').length,3);
});

test('revisión: destinos repetidos, también por mayúsculas en Windows, se rechazan sin escribir',()=>{
  const e=nueva({'uno.txt':'UNO','dos.txt':'DOS'}),dos=e.filas().find(x=>x.direccion==='dos.txt');fs.renameSync(join(e.raiz,'uno.txt'),join(e.raiz,'nuevo.txt'));fs.unlinkSync(join(e.raiz,'dos.txt'));const antes=logs(e);
  for(const destino of ['nuevo.txt',...(process.platform==='win32'?['NUEVO.TXT']:[])]){
    assert.throws(()=>e.c.indexar({coleccion:e.ref.coleccion,revincular:[{elemento:e.ref.elemento,direccion:'nuevo.txt'},{elemento:dos.id,direccion:destino}],...si}),x=>x.codigo==='REVINCULAR_AMBIGUO');
    assert.deepEqual(logs(e),antes);assert.deepEqual(e.t.operacionesPendientes(),[]);
  }
});

for(const [nombre,cambiar] of [
 ['contenido alterado',e=>fs.writeFileSync(join(e.destino,'a.txt'),'ALTERADO')],
 ['archivo borrado',e=>fs.unlinkSync(join(e.destino,'a.txt'))],
 ['archivo agregado',e=>fs.writeFileSync(join(e.destino,'extra.txt'),'EXTRA')],
 ['origen alterado',e=>fs.writeFileSync(join(e.raiz,'a.txt'),'ORIGINAL CAMBIADO')],
 ['origen ampliado',e=>fs.writeFileSync(join(e.raiz,'extra.txt'),'EXTRA')],
]) test('revisión: reanudar copia con '+nombre+' vuelve a comprobar y conserva la raíz original',()=>{
  const e=nueva({'a.txt':'ORIGINAL'}),destino=join(e.dir,'Destino');e.destino=destino;
  const actualizar=e.t.actualizar;e.t.actualizar=(t,id,cambios,o)=>{if(t==='colecciones'&&id===e.ref.coleccion&&cambios.direccion===destino)throw Error('CORTE ACTIVACION');return actualizar(t,id,cambios,o);};
  const pedido={coleccion:e.ref.coleccion,destino:{direccion:destino},idPedido:'copiar-verificado',...si};
  try{assert.throws(()=>e.c.reubicar(pedido),/CORTE ACTIVACION/);}finally{e.t.actualizar=actualizar;}
  assert.ok(e.t.operacionesPendientes()[0].pasos.verificacion);cambiar(e);
  assert.throws(()=>abrirColecciones(abrirTablas(e.t.raiz)).reubicar(pedido),x=>x.codigo==='VERIFICACION_FALLIDA');
  assert.equal(e.t.leer('colecciones').find(x=>x.id===e.ref.coleccion).direccion,e.raiz);assert.equal(e.t.operacionesPendientes().length,1);
  assert.ok(fs.existsSync(join(e.raiz,'a.txt')));
});

test('revisión: reanudar una copia intacta lee de nuevo el contenido y completa la operación',()=>{
  const e=nueva({'a.txt':'ORIGINAL'}),destino=join(e.dir,'Destino');let lecturas=0;
  const archivos={...fs,openSync(p,...o){if(String(p)===join(destino,'a.txt'))lecturas++;return fs.openSync(p,...o);}},c=abrirColecciones(e.t,{archivos});
  const actualizar=e.t.actualizar;e.t.actualizar=(t,id,cambios,o)=>{if(t==='colecciones'&&id===e.ref.coleccion&&cambios.direccion===destino)throw Error('CORTE ACTIVACION');return actualizar(t,id,cambios,o);};
  const pedido={coleccion:e.ref.coleccion,destino:{direccion:destino},idPedido:'copiar-intacto',...si};
  try{assert.throws(()=>c.reubicar(pedido),/CORTE ACTIVACION/);}finally{e.t.actualizar=actualizar;}
  lecturas=0;const r=c.reubicar(pedido);assert.ok(lecturas>0);assert.equal(r.coleccion.direccion,destino);assert.deepEqual(e.t.operacionesPendientes(),[]);assert.equal(fs.readFileSync(join(destino,'a.txt'),'utf8'),'ORIGINAL');
});

test('revisión: un segundo fallo sin nuevos escritos conserva los escritos anteriores del diario',()=>{
  const e=nueva(),op={idPedido:'previos',tipo:'prueba'};
  assert.throws(()=>e.t.operacion(op,ctx=>{ctx.alta('conceptos',{concepto:'Prueba',tema:'Prueba'},{clave:'c'});throw Error('PRIMER FALLO');}),/PRIMER FALLO/);
  assert.throws(()=>e.t.operacion(op,()=>{throw Error('SEGUNDO FALLO');}),x=>x.message==='SEGUNDO FALLO'&&x.recibo.guardado===true&&x.recibo.pendiente===true);
  assert.equal(e.t.operacionesPendientes().length,1);assert.equal(e.t.operacionesPendientes()[0].escritos.length,1);
  e.t.operacion(op,()=>({recuperado:true}));assert.deepEqual(e.t.operacionesPendientes(),[]);
});

test('revisión: reactivar una identidad retirada nunca la traslada a otra colección',()=>{
  const e=nueva({'a.txt':'A'}),x=e.original;
  e.t.retirar('colecciones',x.id,{rama:x._rama});
  const otra=e.f.altaProyecto('Otra','',si),antes=logs(e);
  assert.throws(()=>e.t.operacion({idPedido:'no-robar-identidad',tipo:'prueba'},ctx=>ctx.lote('colecciones',[{nuevo:true,id:x.id,clave:'mover',rama:otra.coleccion.rama,datos:{clase:'elemento',nombre:'a.txt',direccion:'a.txt',ubicacion:'relativa'}}])),/otra colección/);
  assert.deepEqual(logs(e),antes);assert.deepEqual(e.t.operacionesPendientes(),[]);
});
