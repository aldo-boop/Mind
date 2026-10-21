import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,renameSync,existsSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {abrirTablas} from './tablas.mjs';
import {abrirFrentes} from '../Frentes/frentes.mjs';
const si={confirmadoPorPersona:true};
const nueva=()=>{const base=mkdtempSync(join(tmpdir(),'mind-b1-regresion-'));const t=abrirTablas(join(base,'Memoria')).inicializar();return {base,t,f:abrirFrentes(t,{escritorio:()=>t.raiz})};};

test('reintentar proyecto recupera vistas pendientes; mientras siga el fallo no oculta el recibo',()=>{
 const {base,t,f}=nueva(),op={...si,idPedido:'vista',coleccion:{base}};
 mkdirSync(join(t.raiz,'Tablas'),{recursive:true});mkdirSync(join(t.raiz,'Tablas','proyectos.csv'));
 assert.throws(()=>f.altaProyecto('P','',op),e=>e.recibo?.guardado===true&&e.recibo.vistaPendiente===true);
 assert.throws(()=>f.altaProyecto('P','',op),e=>e.recibo?.guardado===true&&e.recibo.vistaPendiente===true);
 renameSync(join(t.raiz,'Tablas','proyectos.csv'),join(base,'obstaculo-preservado'));
 const r=f.altaProyecto('P','',op);
 assert.equal(r.recibo.vistaPendiente,false);assert.ok(existsSync(join(t.raiz,'Tablas','proyectos.csv')));
 assert.equal(existsSync(join(t.raiz,'.vista-pendiente.json')),false);
 assert.equal(t.leer('proyectos',{historia:true}).length,1);assert.equal(t.leer('colecciones',{historia:true}).length,2);
});

test('una carpeta movida entre intentos mantiene el pendiente; restaurarla reanuda con los mismos IDs',()=>{
 const {base,t,f}=nueva();
 assert.throws(()=>f.altaProyecto('P','',{...si,idPedido:'movida',coleccion:{base,descripcion:5}}),e=>e.recibo?.pendiente===true);
 const [op]=t.operacionesPendientes(),dir=op.pasos.ubicacion.direccion,id=t.leer('proyectos')[0].id;
 renameSync(dir,dir+'-preservada');
 assert.throws(()=>f.altaProyecto('P','',{...si,idPedido:'movida',coleccion:{base}}),/no existe|ausente/);
 assert.equal(t.operacionesPendientes().length,1);assert.equal(t.leer('colecciones').length,0);assert.equal(t.leer('proyectos')[0].id,id);
 renameSync(dir+'-preservada',dir);
 const r=f.altaProyecto('P','',{...si,idPedido:'movida',coleccion:{base}});
 assert.equal(r.proyecto.id,id);assert.ok(existsSync(r.coleccion.direccion));assert.deepEqual(t.operacionesPendientes(),[]);
});

test('ni asignación directa ni ciclos permiten compartir una rama; reutilizar referencia original sí',()=>{
 const {t,f}=nueva(),p=f.altaProyecto('P','',si),q=f.altaProyecto('Q','',si);
 const c=t.leer('colecciones').find(c=>c.proyecto===p.id),d=t.leer('colecciones').find(c=>c.proyecto===q.id);
 const {rama}=t.abrirRama('colecciones',c.id,si);
 assert.throws(()=>t.actualizar('colecciones',d.id,{rama}),/padre|rama.*asignada|ambigua/);
 const sub=t.alta('colecciones',{clase:'subcoleccion',nombre:'Sub',direccion:'Sub'},{rama});
 assert.throws(()=>t.actualizar('colecciones',sub.id,{rama},{rama}),/ciclo|Ciclo|padre|rama.*asignada/);
 const e=t.alta('colecciones',{nombre:'a.txt',direccion:'a.txt'},{rama});
 const frente=f.altaFrente({nombre:'F',proyecto:q.id},si),ref={coleccion:c.id,elemento:e.id};
 t.actualizar('proyectos',frente.id,{elementosUsados:[ref]});assert.equal(t.elemento(ref).coleccion.id,c.id);
});

test('ramas heredadas ambiguas y elementos de otra raíz no producen referencias válidas',()=>{
 const {t}=nueva(),c=t.alta('colecciones',{nombre:'C',direccion:'D:/C'}),d=t.alta('colecciones',{nombre:'D',direccion:'D:/D'});
 const {rama}=t.abrirRama('colecciones',c.id,si),e=t.alta('colecciones',{nombre:'a',direccion:'a'},{rama});
 const log=join(t.raiz,'Tablas','colecciones.jsonl');
 writeFileSync(log,JSON.stringify({operacion:'poner',fila:{...d,rama}})+'\n',{flag:'a'});
 assert.throws(()=>t.elemento({coleccion:d.id,elemento:e.id}),/ambigua|padre|propiedad/);
 assert.throws(()=>t.alta('colecciones',{nombre:'b',direccion:'b'},{rama}),/ambigua|padre/);
 // Se retira la atribución ambigua y se simula metadato heredado de propiedad incorrecta.
 t.actualizar('colecciones',d.id,{rama:''});
 const archivo=join(t.raiz,'Tablas','colecciones',rama+'.jsonl');
 writeFileSync(archivo,JSON.stringify({operacion:'poner',fila:{...e,coleccion:d.id}})+'\n',{flag:'a'});
 assert.throws(()=>t.elemento({coleccion:c.id,elemento:e.id}),/propiedad|colección/);
});

test('referencias estructuradas se conservan en JSONL/CSV, deduplican por IDs y permiten retirar usos',()=>{
 const {t,f}=nueva(),p=f.altaProyecto('P','',si),fr=f.altaFrente({nombre:'F',proyecto:p.id},si);
 const c=t.alta('colecciones',{nombre:'C',direccion:'D:/C'}),{rama}=t.abrirRama('colecciones',c.id,si),e=t.alta('colecciones',{nombre:'a',direccion:'a'},{rama});
 const ref={coleccion:c.id,elemento:e.id};
 t.actualizar('proyectos',fr.id,{elementosUsados:[ref]});
 assert.deepEqual(t.leer('proyectos').find(x=>x.id===fr.id).elementosUsados,[ref]);
 const csv=readFileSync(join(t.raiz,'Tablas','proyectos.csv'),'utf8');assert.ok(csv.includes('""coleccion""'));assert.ok(csv.includes('""elemento""'));
 assert.throws(()=>t.actualizar('proyectos',fr.id,{elementosUsados:[ref,{elemento:e.id,coleccion:c.id}]}),/repetida/);
 assert.throws(()=>t.actualizar('proyectos',fr.id,{elementosUsados:[{...ref,extra:'x'}]}),/referencia/i);
 assert.throws(()=>t.actualizar('proyectos',fr.id,{elementosUsados:[{coleccion:c.id,elemento:'ausente'}]}),/inexistente/);
 t.retirar('colecciones',e.id,{rama});t.actualizar('proyectos',fr.id,{loQueSigue:'Seguir'});
 t.actualizar('proyectos',fr.id,{elementosUsados:[]});assert.equal(t.leer('colecciones',{rama})[0].id,e.id);
});

test('historia dev.12 con cadenas se conserva y las escrituras nuevas normalizan a objetos',()=>{
 const {t,f}=nueva(),p=f.altaProyecto('P','',si),fr=f.altaFrente({nombre:'F',proyecto:p.id},si);
 const c=t.alta('colecciones',{nombre:'C',direccion:'D:/C'}),{rama}=t.abrirRama('colecciones',c.id,si),e=t.alta('colecciones',{nombre:'a',direccion:'a'},{rama});
 const ref=c.id+'/'+e.id,archivo=join(t.raiz,'Tablas','proyectos.jsonl');
 writeFileSync(archivo,JSON.stringify({operacion:'poner',fila:{...fr,elementosUsados:[ref]}})+'\n',{flag:'a'});
 t.actualizar('proyectos',fr.id,{loQueSigue:'Continuar'});
 const hist=t.leer('proyectos',{historia:true}).filter(x=>x.id===fr.id);
 assert.deepEqual(hist.at(-2).elementosUsados,[ref]);assert.deepEqual(hist.at(-1).elementosUsados,[{coleccion:c.id,elemento:e.id}]);
 assert.equal(t.elemento(ref).elemento.id,e.id);
});

test('reintento compuesto sin escrituras conserva el recibo fallido y no limpia una rama ajena',()=>{
 const {base,t}=nueva(),concepto=t.alta('conceptos',{concepto:'Raíz',tema:'T'}),{rama}=t.abrirRama('conceptos',concepto.id,si);
 const csvRama=join(t.raiz,'Tablas','conceptos',rama+'.csv');
 mkdirSync(join(t.raiz,'Tablas','conceptos'),{recursive:true});mkdirSync(csvRama);
 assert.throws(()=>t.alta('conceptos',{concepto:'Hijo',tema:'T'},{rama,idPedido:'rama-ajena'}),e=>e.recibo?.vistaPendiente===true);
 renameSync(csvRama,join(base,'obstaculo-rama'));
 renameSync(join(t.raiz,'Tablas','conceptos.csv'),join(base,'csv-previo'));
 mkdirSync(join(t.raiz,'Tablas','conceptos.csv'));
 const correr=()=>t.operacion({idPedido:'compuesta',tipo:'prueba'},ctx=>ctx.alta('conceptos',{concepto:'Nuevo',tema:'T'},{clave:'nuevo'}));
 assert.throws(correr,e=>e.recibo?.guardado===true&&e.recibo.vistaPendiente===true);
 assert.throws(correr,e=>e.recibo?.guardado===true&&e.recibo.vistaPendiente===true);
 const pendientes=()=>JSON.parse(readFileSync(join(t.raiz,'.vista-pendiente.json'),'utf8')).pedidos;
 assert.ok(pendientes().some(p=>p.operacion==='compuesta'));assert.ok(pendientes().some(p=>p.tabla==='conceptos/'+rama));
 renameSync(join(t.raiz,'Tablas','conceptos.csv'),join(base,'obstaculo-raiz'));
 assert.equal(correr().recibo.vistaPendiente,false);
 assert.equal(pendientes().length,1);assert.equal(pendientes()[0].tabla,'conceptos/'+rama);
 assert.equal(t.leer('conceptos',{historia:true}).filter(x=>x.concepto==='Nuevo').length,1);
});
