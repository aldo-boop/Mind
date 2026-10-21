import test from 'node:test';import assert from 'node:assert/strict';import * as fs from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {abrirTablas} from './tablas.mjs';import {prepararObsidian,FILTRO} from './obsidian.mjs';import {ejecutarNube} from '../Colecciones/nube.mjs';import {abrirFrentes} from '../Frentes/frentes.mjs';import {compararVersion} from '../../../Distribucion/canal.mjs';
const carpeta=()=>fs.mkdtempSync(join(tmpdir(),'mind-universal-')),taller=()=>{const root=carpeta();return {root,t:abrirTablas(join(root,'Memoria')).inicializar()}};
const put=(p,s)=>{fs.mkdirSync(join(p,'..'),{recursive:true});fs.writeFileSync(p,s)};
test('1.2: Obsidian parte vacío, configura una vez y agrega solo accesos existentes',()=>{
 const {root,t}=taller();assert.equal(fs.readdirSync(t.raiz).length,0);prepararObsidian(root);assert.equal(fs.readdirSync(t.raiz).length,0);
 assert.equal(JSON.parse(fs.readFileSync(join(root,'.obsidian/graph.json'))).search,FILTRO);
 assert.deepEqual(JSON.parse(fs.readFileSync(join(root,'.obsidian/bookmarks.json'))).items,[]);
 t.alta('proyectos',{tipo:'proyecto',nombre:'Aurora',estado:'activo'});prepararObsidian(root);
 assert.deepEqual(JSON.parse(fs.readFileSync(join(root,'.obsidian/bookmarks.json'))).items.map(x=>x.title),['Inicio','Proyectos']);
 assert.equal(prepararObsidian(root).estado,'sin-cambios');
});
test('1.2: respalda la configuración inicial y conserva filtros, marcadores y ajustes propios',()=>{
 const {root}=taller(),dir=join(root,'.obsidian');fs.mkdirSync(dir);const original=JSON.stringify({search:'',showOrphans:true,colorGroups:[{query:'tag:propio',color:42}]});put(join(dir,'graph.json'),original);put(join(dir,'bookmarks.json'),JSON.stringify({items:[{type:'group',title:'Personal',items:[]}]}));prepararObsidian(root);
 assert.ok(fs.readdirSync(join(dir,'.respaldos-mind')).some(n=>fs.readFileSync(join(dir,'.respaldos-mind',n),'utf8')===original));
 let graph=JSON.parse(fs.readFileSync(join(dir,'graph.json')));graph.search='';graph.showOrphans=true;put(join(dir,'graph.json'),JSON.stringify(graph));prepararObsidian(root);graph=JSON.parse(fs.readFileSync(join(dir,'graph.json')));assert.equal(graph.search,'');assert.equal(graph.showOrphans,true);assert.equal(graph.colorGroups[0].color,42);
 assert.equal(JSON.parse(fs.readFileSync(join(dir,'bookmarks.json'))).items[0].title,'Personal');
 const other=carpeta();put(join(other,'.obsidian/graph.json'),JSON.stringify({search:'tag:Elegido',showOrphans:true}));prepararObsidian(other);assert.equal(JSON.parse(fs.readFileSync(join(other,'.obsidian/graph.json'))).search,'tag:Elegido');
});
test('1.2: JSON dañado y enlaces de configuración no se sobrescriben',()=>{
 const {root}=taller();put(join(root,'.obsidian/graph.json'),'{');assert.throws(()=>prepararObsidian(root));assert.equal(fs.readFileSync(join(root,'.obsidian/graph.json'),'utf8'),'{');assert.equal(fs.existsSync(join(root,'.obsidian/app.json')),false);
});
test('1.2: muchos frentes pasan a resumen explícito sin perder registros ni próximos pasos',()=>{
 const {root,t}=taller();t.operacion({idPedido:'escala',tipo:'fixture'},ctx=>{
  for(let i=0;i<35;i++){const p=ctx.alta('proyectos',{tipo:'proyecto',nombre:'Proyecto '+i,estado:'activo'},{clave:'p'+i});for(let j=0;j<6;j++)ctx.alta('proyectos',{tipo:'frente',nombre:'Frente '+j,proyecto:p.id,estado:'activo',loQueSigue:'Acción concreta '+i+'/'+j},{clave:'f'+i+'-'+j});}
 });
 const inicio=fs.readFileSync(join(t.raiz,'Vistas/Inicio.md'),'utf8');assert.match(inicio,/35 proyectos · 210 frentes activos/);assert.match(inicio,/Detalle y siguientes pasos/);assert.equal(t.leer('proyectos').length,245);
 const detalle=fs.readdirSync(join(t.raiz,'Vistas/Proyectos')).map(n=>fs.readFileSync(join(t.raiz,'Vistas/Proyectos',n),'utf8')).join('\n');assert.ok(detalle.includes('Acción concreta 34/5'));
 assert.equal(t.regenerar().avisos.some(x=>x.startsWith('Arranque:')),false);
});
test('1.2: conectar una carpeta sirve para proveedores distintos y no acredita una copia remota',()=>{
 const {root,t}=taller(),cloud=join(carpeta(),'Nube con espacios á');fs.mkdirSync(cloud);const f=abrirFrentes(t,{escritorio:()=>{throw Error('No debe consultar el Escritorio')}});
 assert.equal(ejecutarNube(t,{operacion:'estado'}).estado,'sin-configurar');assert.throws(()=>ejecutarNube(t,{operacion:'conectar',carpeta:cloud}),/elección explícita/);
 const a=ejecutarNube(t,{operacion:'conectar',carpeta:cloud,confirmadoPorPersona:true});assert.equal(a.verificacion.remota,false);assert.equal(a.existentesConservadas,true);
 const p=f.altaProyecto('Aurora','',{confirmadoPorPersona:true,idPedido:'aurora'});assert.equal(p.coleccion.ubicacion,'sincronizada');assert.ok(p.coleccion.direccion.startsWith(join(cloud,'Proyectos')));
 const b=ejecutarNube(t,{operacion:'conectar',carpeta:cloud,confirmadoPorPersona:true});assert.equal(a.biblioteca,b.biblioteca);assert.equal(t.leer('decisiones').filter(x=>x.tipo==='ubicacion-colecciones').length,1);
 const old=carpeta(),q=f.altaProyecto('Local','',{confirmadoPorPersona:true,coleccion:{direccion:old}});assert.equal(q.coleccion.direccion,old);
 const other=carpeta();assert.throws(()=>ejecutarNube(t,{operacion:'conectar',carpeta:other,confirmadoPorPersona:true}),/ya apunta a otra/);assert.equal(ejecutarNube(t,{operacion:'estado'}).estado,'carpeta-disponible');
});
test('1.2: cambiar de numeración reconoce solo las construcciones 2.0.0-dev; rechaza versiones realmente anteriores',()=>{
 assert.equal(compararVersion('1.2.1','2.0.0-dev.25'),1);assert.equal(compararVersion('1.2.1','2.0.0-dev.27'),1);assert.equal(compararVersion('1.2.2','1.2.1'),1);assert.equal(compararVersion('1.2.0','1.2.1'),-1);assert.equal(compararVersion('1.2.1','2.0.0'),-1);assert.equal(compararVersion('1.1.99','2.0.0-dev.25'),-1);
});
