import test from 'node:test';import assert from 'node:assert/strict';import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync } from 'node:fs';import { tmpdir } from 'node:os';import { join } from 'node:path';import { abrirTablas } from '../Tablas/tablas.mjs';import { detectarVersion,prepararMigracion,adaptarEsqueleto } from './migrar.mjs';import { VERSION } from '../Tablas/tablas.mjs';
test('respaldo y candidato conservan eventos y archivos; no modifica origen',()=>{const base=mkdtempSync(join(tmpdir(),'mind-v2-migrar-')),p=join(base,'Memoria'),t=abrirTablas(p).inicializar();const f=t.alta('conceptos',{concepto:'Fuerza',tema:'Física'});t.actualizar('conceptos',f.id,{sintesis:'masa por aceleración'});mkdirSync(join(p,'Colecciones'),{recursive:true});writeFileSync(join(p,'Colecciones','original.txt'),'ñ, obra original');const antes=readFileSync(join(p,'Tablas','conceptos.jsonl'),'utf8'),r=prepararMigracion(p,join(base,'taller'));assert.equal(r.filasConservadas,2);assert.equal(r.promovido,false);assert.equal(readFileSync(join(r.copia,'Colecciones','original.txt'),'utf8'),'ñ, obra original');assert.equal(readFileSync(join(p,'Tablas','conceptos.jsonl'),'utf8'),antes);assert.throws(()=>prepararMigracion(p,join(p,'dentro')),/separado/);assert.throws(()=>prepararMigracion(p,join(base,'taller')),/existente/);});
test('detector diferencia versiones, Memoria en 0 no requiere adaptación y un candado impide preparar migración',()=>{const base=mkdtempSync(join(tmpdir(),'mind-v2-version-')),p=join(base,'Memoria');const t=abrirTablas(p).inicializar();writeFileSync(join(base,'version.json'),JSON.stringify({memoria:VERSION+1}));assert.equal(detectarVersion(base,p).requiereAdaptacion,false);t.alta('conceptos',{concepto:'Luz',tema:'Física'});assert.equal(detectarVersion(base,p).requiereAdaptacion,true);writeFileSync(join(p,'Tablas','.escritura.lock'),'ocupado');assert.throws(()=>prepararMigracion(p,join(base,'taller')),/ocupada/);assert.equal(existsSync(join(base,'taller')),false);});
test('adaptación automática conserva historia, renombra columna y guarda originales completos',()=>{
 const base=mkdtempSync(join(tmpdir(),'mind-v2-adaptar-')),p=join(base,'Memoria'),t=abrirTablas(p).inicializar();
 const c=t.alta('conceptos',{concepto:'Energía',tema:'Física',sintesis:'Primera versión'});t.actualizar('conceptos',c.id,{sintesis:'Segunda versión'});mkdirSync(join(p,'Colecciones'),{recursive:true});writeFileSync(join(p,'Colecciones','obra.txt'),'original, ñ');
 const log=join(p,'Tablas','conceptos.jsonl'),antiguo=readFileSync(log,'utf8').replaceAll('"sintesis":','"resumen":');writeFileSync(log,antiguo);writeFileSync(join(p,'version.json'),JSON.stringify({memoria:0}));writeFileSync(join(base,'version.json'),JSON.stringify({memoria:VERSION}));
 const r=adaptarEsqueleto(base,p,{renombrar:{conceptos:{resumen:'sintesis'}}});
 assert.equal(r.estado,'adaptada');assert.equal(r.promovido,true);assert.equal(r.filasConservadas,2);assert.equal(t.leer('conceptos')[0].sintesis,'Segunda versión');assert.equal(t.leer('conceptos',{historia:true}).length,2);assert.equal(readFileSync(join(r.respaldo,'Tablas','conceptos.jsonl'),'utf8'),antiguo);assert.equal(readFileSync(join(r.respaldo,'Colecciones','obra.txt'),'utf8'),'original, ñ');assert.equal(readFileSync(join(p,'Colecciones','obra.txt'),'utf8'),'original, ñ');assert.equal(detectarVersion(base,p).requiereAdaptacion,false);assert.equal(existsSync(join(p,'.adaptacion.lock')),false);assert.equal(existsSync(join(p,'Tablas','.escritura.lock')),false);assert.equal(adaptarEsqueleto(base,p).estado,'sin-cambios');
});
test('sin regla para una columna no la descarta ni activa la nueva versión',()=>{
 const base=mkdtempSync(join(tmpdir(),'mind-v2-sin-plan-')),p=join(base,'Memoria'),t=abrirTablas(p).inicializar();t.alta('conceptos',{concepto:'Color',tema:'Arte',sintesis:'Pigmento'});const log=join(p,'Tablas','conceptos.jsonl'),original=readFileSync(log,'utf8').replaceAll('"sintesis":','"textoAntiguo":');writeFileSync(log,original);writeFileSync(join(p,'version.json'),JSON.stringify({memoria:0}));writeFileSync(join(base,'version.json'),JSON.stringify({memoria:VERSION}));
 assert.throws(()=>adaptarEsqueleto(base,p),/sin adaptación/);assert.equal(readFileSync(log,'utf8'),original);assert.equal(JSON.parse(readFileSync(join(p,'version.json'),'utf8')).memoria,0);assert.equal(existsSync(join(p,'.adaptacion.lock')),false);
});
test('un escritor activo aplaza la adaptación sin retirar su candado',()=>{const base=mkdtempSync(join(tmpdir(),'mind-v2-ocupada-')),p=join(base,'Memoria');abrirTablas(p).inicializar();mkdirSync(join(p,'Tablas'),{recursive:true});writeFileSync(join(base,'version.json'),JSON.stringify({memoria:VERSION}));writeFileSync(join(p,'version.json'),JSON.stringify({memoria:0}));writeFileSync(join(p,'Tablas','.escritura.lock'),'otra sesión');assert.throws(()=>adaptarEsqueleto(base,p),/ocupada/);assert.equal(readFileSync(join(p,'Tablas','.escritura.lock'),'utf8'),'otra sesión');assert.equal(existsSync(join(p,'.adaptacion.lock')),false);});
test('una migración hacia atrás o un esquema desconocido se detiene',()=>{const base=mkdtempSync(join(tmpdir(),'mind-v2-version-invalida-')),p=join(base,'Memoria');abrirTablas(p).inicializar();writeFileSync(join(base,'version.json'),JSON.stringify({memoria:VERSION}));writeFileSync(join(p,'version.json'),JSON.stringify({memoria:4}));assert.throws(()=>adaptarEsqueleto(base,p),/no soportada/);});


// Bloque 1 · adaptación del esquema 1 al 2 con ramas, historia, dueños ambiguos y datos incompatibles.
const ev=(fila,fecha='2026-10-01T00:00:00.000Z')=>JSON.stringify({operacion:'poner',fila:{fecha,vigencia:'vigente',...fila}})+'\n';
const motorV2=base=>{const m=join(base,'motor');mkdirSync(m);writeFileSync(join(m,'version.json'),JSON.stringify({memoria:VERSION}));return m;};
test('esquema 1 → 2: Colecciones raíz y ramas de varios niveles sin perder eventos, IDs, conexiones ni archivos',()=>{
 const base=mkdtempSync(join(tmpdir(),'mind-v2-a-v2-')),p=join(base,'Memoria');mkdirSync(join(p,'Tablas','colecciones'),{recursive:true});mkdirSync(join(p,'Tablas','conceptos'),{recursive:true});
 writeFileSync(join(p,'Tablas','proyectos.jsonl'),ev({id:'pM',tipo:'proyecto',nombre:'Mind',estado:'activo'})+ev({id:'pK',tipo:'proyecto',nombre:'Aurora',estado:'activo'})+ev({id:'fM',tipo:'frente',nombre:'Motor',proyecto:'pM',estado:'activo'}));
 writeFileSync(join(p,'Tablas','colecciones.jsonl'),
  ev({id:'cRev',nombre:'Revisión',direccion:'Colecciones/Revisión',conectadoA:['fM']})+
  ev({id:'cAurora',nombre:'Taller Aurora',direccion:'D:/Taller Aurora',conectadoA:'Aurora',rama:'aurora-aaaaaa'})+
  ev({id:'cAurora',nombre:'Taller Aurora',direccion:'D:/Taller Aurora',conectadoA:'Aurora',rama:'aurora-aaaaaa',patron:'fotos'},'2026-10-02T00:00:00.000Z')+
  ev({id:'cAmb',nombre:'Compartida',direccion:'https://drive.example/x',conectadoA:['pM','pK']})+
  ev({id:'cLib',nombre:'Biblioteca',direccion:'E:/Libros',conectadoA:['Perfil']}));
 writeFileSync(join(p,'Tablas','colecciones','aurora-aaaaaa.jsonl'),ev({id:'eFotos',nombre:'Fotos',direccion:'D:/Taller Aurora/Fotos',rama:'fotos-bbbbbb'})+ev({id:'eLink',nombre:'Video',direccion:'https://youtu.be/x'}));
 writeFileSync(join(p,'Tablas','colecciones','fotos-bbbbbb.jsonl'),ev({id:'eA',nombre:'a.jpg',direccion:'Colecciones/Aurora/a.jpg'}));
 writeFileSync(join(p,'Tablas','colecciones','huerfana-cccccc.jsonl'),ev({id:'eH',nombre:'h.txt',direccion:'D:/h.txt'}));
 writeFileSync(join(p,'Tablas','conceptos.jsonl'),ev({id:'kF',concepto:'Física',tema:'Ciencia',rama:'fisica-dddddd'}));
 writeFileSync(join(p,'Tablas','conceptos','fisica-dddddd.jsonl'),ev({id:'k1',concepto:'Fuerza',tema:'Física'}));
 writeFileSync(join(p,'version.json'),JSON.stringify({memoria:1}));
 mkdirSync(join(p,'Vistas','Proyectos'),{recursive:true});writeFileSync(join(p,'Vistas','Proyectos','frente - Motor--x.md'),'<!-- mind:vista-derivada -->\nvieja');writeFileSync(join(p,'Vistas','nota propia.md'),'del usuario');
 const antes=Object.fromEntries(['colecciones.jsonl','colecciones/aurora-aaaaaa.jsonl','colecciones/fotos-bbbbbb.jsonl','colecciones/huerfana-cccccc.jsonl','conceptos/fisica-dddddd.jsonl','proyectos.jsonl'].map(r=>[r,readFileSync(join(p,'Tablas',r),'utf8')]));
 const r=adaptarEsqueleto(motorV2(base),p);
 assert.equal(r.estado,'adaptada');assert.equal(r.anterior,1);assert.equal(r.nueva,VERSION);assert.equal(r.filasConservadas,14);
 const t=abrirTablas(p),raices=new Map(t.leer('colecciones').map(f=>[f.id,f]));
 assert.equal(raices.get('cRev').proyecto,'pM');assert.equal(raices.get('cRev').ubicacion,'mind');assert.deepEqual(raices.get('cRev').conectadoA,['fM']);
 assert.equal(raices.get('cAurora').proyecto,'pK');assert.equal(raices.get('cAurora').ubicacion,'local');assert.equal(raices.get('cAurora').patron,'fotos');
 assert.equal(raices.get('cAmb').proyecto,undefined);assert.match(raices.get('cAmb').pendiente,/asignar-proyecto/);assert.equal(raices.get('cAmb').ubicacion,'enlace');
 assert.equal(raices.get('cLib').proyecto,undefined);assert.equal(raices.get('cLib').pendiente,undefined);
 assert.equal(t.leer('colecciones',{historia:true}).length,5);
 const aurora=t.leer('colecciones',{rama:'aurora-aaaaaa'}),fotos=aurora.find(f=>f.id==='eFotos');
 assert.equal(fotos.clase,'subcoleccion');assert.equal(fotos.padre,'cAurora');assert.equal(fotos.coleccion,'cAurora');assert.equal(fotos.ubicacion,'absoluta');
 assert.equal(aurora.find(f=>f.id==='eLink').ubicacion,'enlace');
 const a=t.leer('colecciones',{rama:'fotos-bbbbbb'})[0];assert.equal(a.clase,'elemento');assert.equal(a.padre,'eFotos');assert.equal(a.coleccion,'cAurora');assert.equal(a.ubicacion,'mind');
 assert.match(t.leer('colecciones',{rama:'huerfana-cccccc'})[0].pendiente,/sin-padre/);
 assert.equal(readFileSync(join(p,'Tablas','conceptos','fisica-dddddd.jsonl'),'utf8'),antes['conceptos/fisica-dddddd.jsonl']);
 assert.equal(readFileSync(join(p,'Tablas','proyectos.jsonl'),'utf8'),antes['proyectos.jsonl']);
 for(const [k,v] of Object.entries(antes))assert.equal(readFileSync(join(r.respaldo,'Tablas',k),'utf8'),v);
 assert.equal(readFileSync(join(p,'Vistas','nota propia.md'),'utf8'),'del usuario');
 assert.ok(r.pendientes.some(x=>x.id==='cAmb')&&r.pendientes.some(x=>x.id==='eH'));
 assert.equal(t.elemento('cAurora/eA').elemento.nombre,'a.jpg');
 assert.throws(()=>t.alta('colecciones',{nombre:'Otra de Aurora',direccion:'D:/otra',proyecto:'pK'}),/ya tiene/);
 assert.equal(adaptarEsqueleto(join(base,'motor'),p).estado,'sin-cambios');
});
test('esquema 1 → 2: rama dañada, dirección incompatible, rama con nombre no admitido u operaciones pendientes frenan sin tocar el original',()=>{
 const preparar=()=>{const base=mkdtempSync(join(tmpdir(),'mind-v2-a-v2-mal-')),p=join(base,'Memoria');mkdirSync(join(p,'Tablas','colecciones'),{recursive:true});writeFileSync(join(p,'Tablas','colecciones.jsonl'),ev({id:'c',nombre:'C',direccion:'D:/C',rama:'c-aaaaaa'}));writeFileSync(join(p,'version.json'),JSON.stringify({memoria:1}));return {p,motor:motorV2(base)};};
 const intacta=p=>assert.equal(JSON.parse(readFileSync(join(p,'version.json'),'utf8')).memoria,1);
 let {p,motor}=preparar();writeFileSync(join(p,'Tablas','colecciones','c-aaaaaa.jsonl'),'{"operacion":');
 assert.throws(()=>adaptarEsqueleto(motor,p),/truncado/);intacta(p);assert.equal(readFileSync(join(p,'Tablas','colecciones','c-aaaaaa.jsonl'),'utf8'),'{"operacion":');
 ({p,motor}=preparar());writeFileSync(join(p,'Tablas','colecciones','c-aaaaaa.jsonl'),ev({id:'x',nombre:'X',direccion:'../fuera.txt'}));
 assert.throws(()=>adaptarEsqueleto(motor,p),/incompatible/);intacta(p);
 ({p,motor}=preparar());writeFileSync(join(p,'Tablas','colecciones','Mal Nombre.jsonl'),ev({id:'y',nombre:'Y',direccion:'D:/y'}));
 assert.throws(()=>adaptarEsqueleto(motor,p),/no admitid/);intacta(p);
 ({p,motor}=preparar());writeFileSync(join(p,'.operaciones.json'),JSON.stringify({operaciones:[{idPedido:'x',tipo:'proyecto',estado:'interrumpida',pasos:{}}]}));
 assert.throws(()=>adaptarEsqueleto(motor,p),/pendientes/);intacta(p);
 for(const lock of ['.adaptacion.lock','.escritura.lock'])assert.equal(existsSync(join(p,lock)),false);
});
