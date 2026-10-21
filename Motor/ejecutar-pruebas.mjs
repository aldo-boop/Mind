import test from 'node:test';import assert from 'node:assert/strict';import { mkdtempSync,writeFileSync,readFileSync,mkdirSync,readdirSync,statSync } from 'node:fs';import { tmpdir } from 'node:os';import { join,resolve } from 'node:path';import { fileURLToPath } from 'node:url';import { spawnSync } from 'node:child_process';import { abrirTablas } from './Funciones/Base/Tablas/tablas.mjs';import { abrirFrentes } from './Funciones/Base/Frentes/frentes.mjs';import { abrirDecisionesEnTablas } from './Funciones/Base/Recordar/tablas.mjs';import { buscar } from './Funciones/Base/Buscar/buscar.mjs';import { lecturaArranque as entrada } from './actualizar.mjs';
import { CONCEPTOS_MIND } from './Funciones/Base/Tablas/semilla-mind.mjs';
test('orden aprobado, medidas y presupuesto sin truncar silenciosamente',()=>{
 const motor=resolve(fileURLToPath(new URL('.',import.meta.url))),t=abrirTablas(mkdtempSync(join(tmpdir(),'mind-v2-entrada-'))).inicializar();
 let e=entrada(motor,t.raiz);assert.ok(e.cabe);assert.ok(e.tokensEstimados<2000);assert.deepEqual(e.rutas.map(p=>p.split(/[\\/]/).at(-1)),['Bienvenida.md']);
 t.alta('decisiones',{tipo:'regla-usuario',proyecto:'General',decision:'Regla',estado:'confirmada'});
 t.alta('perfil',{tipo:'faceta',faceta:'F',afirmacion:'A'});
 t.alta('proyectos',{tipo:'proyecto',nombre:'P',estado:'activo'});
 e=entrada(motor,t.raiz);assert.deepEqual(e.rutas.map(p=>p.split(/[\\/]/).at(-1)),['Bienvenida.md','Inicio.md']);
 t.alta('decisiones',{tipo:'regla-usuario',proyecto:'General',decision:'X'.repeat(9000),estado:'confirmada'});e=entrada(motor,t.raiz);assert.equal(e.cabe,false);assert.ok(e.texto.includes('X'.repeat(9000)));
 // Se mide lo que proyectará este Motor: una vista vieja guardada no cuenta.
 const t2=abrirTablas(mkdtempSync(join(tmpdir(),'mind-v2-entrada-'))).inicializar();t2.alta('perfil',{tipo:'faceta',faceta:'F',afirmacion:'A'});writeFileSync(join(t2.raiz,'Vistas','Inicio.md'),'X'.repeat(9000));e=entrada(motor,t2.raiz);assert.equal(e.cabe,true);assert.ok(!e.texto.includes('XXXX'));
});
test('El arranque lee una Memoria anterior sin tocarla; Tablas no escribe en ella; adaptar exige confirmación y conserva respaldo',()=>{const motor=resolve(fileURLToPath(new URL('.',import.meta.url))),t=abrirTablas(mkdtempSync(join(tmpdir(),'mind-v2-entrada-version-'))).inicializar();t.alta('conceptos',{concepto:'Velocidad',tema:'Física'});writeFileSync(join(t.raiz,'version.json'),JSON.stringify({memoria:0}));
 const huella=()=>readdirSync(t.raiz,{recursive:true}).sort().map(n=>{const p=join(t.raiz,n);return statSync(p).isFile()?n+':'+readFileSync(p,'base64'):n;}).join('|'),antes=huella();
 const e=entrada(motor,t.raiz);assert.equal('migracionPendiente' in e,false);assert.ok(e.cabe);assert.equal(huella(),antes);
 assert.throws(()=>t.alta('conceptos',{concepto:'Masa',tema:'Física'}),/incompatible/);assert.equal(huella(),antes);
 assert.equal(llamar('entrada',t.raiz).estado,2);assert.equal(huella(),antes);
 for(const confirmadoPorPersona of [undefined,false,'true'])assert.equal(llamar('adaptar',t.raiz,confirmadoPorPersona===undefined?{}:{confirmadoPorPersona}).estado,2);assert.equal(huella(),antes);
 const a=llamar('adaptar',t.raiz,{confirmadoPorPersona:true});assert.equal(a.estado,0,a.error);assert.equal(a.datos.estado,'adaptada');assert.equal(a.datos.filasConservadas,1);assert.equal(t.leer('conceptos')[0].concepto,'Velocidad');assert.equal(t.alta('conceptos',{concepto:'Masa',tema:'Física'}).concepto,'Masa');});

const motorPrueba=resolve(fileURLToPath(new URL('.',import.meta.url)));
function llamar(accion,memoria,op){const r=spawnSync(process.execPath,[join(motorPrueba,'ejecutar.mjs'),accion,memoria,...(op===undefined?[]:[JSON.stringify(op)])],{encoding:'utf8',windowsHide:true});let datos;try{datos=JSON.parse(r.stdout);}catch{}return {estado:r.status,datos,error:r.stderr};}
const nuevaCLI=(op)=>{const p=join(mkdtempSync(join(tmpdir(),'mind-v2-lote3-')),'Memoria'),r=llamar('inicializar',p,op);assert.equal(r.estado,0,r.error);return {p,t:abrirTablas(p),r};};
test('fábrica nace en cero sin archivos de relleno; sembrar opcional precarga dieciocho conceptos sin aumentar el arranque',()=>{
 const p=join(mkdtempSync(join(tmpdir(),'mind-v2-semilla-')),'Memoria'),r0=llamar('inicializar',p);assert.equal(r0.estado,0,r0.error);assert.equal(r0.datos.semilla.agregados,0);
 const t=abrirTablas(p),antes=entrada(motorPrueba,p);
 for(const tabla of ['perfil','proyectos','decisiones','colecciones','conceptos'])assert.equal(t.leer(tabla).length,0);
 const r=llamar('inicializar',p,{sembrar:true});assert.equal(r.estado,0,r.error);assert.equal(r.datos.semilla.agregados,18);assert.equal(t.leer('conceptos').length,18);assert.deepEqual(t.leer('conceptos').map(f=>f.id),CONCEPTOS_MIND.map(f=>f.id));assert.equal(t.leer('conceptos').some(f=>f.id==='c-extensiones'),false);assert.equal(t.leer('conceptos').some(f=>f.id==='c-nucleo'),true);
 const despues=entrada(motorPrueba,p);assert.equal(despues.texto,antes.texto);assert.equal(despues.tokensEstimados,antes.tokensEstimados);assert.ok(despues.tokensEstimados<2000);
 const csv=readFileSync(join(p,'Tablas','conceptos.csv'),'utf8');assert.equal(csv[0],'\ufeff');assert.equal(csv.trim().split('\r\n').length,19);
 const busqueda=llamar('buscar',p,{tabla:'conceptos',tema:'Mind',limite:18});assert.equal(busqueda.estado,0);assert.equal(busqueda.datos.filas.length,18);assert.equal(llamar('buscar',p,{tabla:'conceptos',tema:'Mind'}).datos.filas.length,10);
});
test('reinicializar no duplica ni sobrescribe correcciones o retiros',()=>{const {p,t}=nuevaCLI({sembrar:true});t.actualizar('conceptos','c-mind',{sintesis:'Mi propia explicación'});t.retirar('conceptos','c-motor');const antes=t.leer('conceptos',{historia:true}).length,r=llamar('inicializar',p,{sembrar:true});assert.equal(r.estado,0,r.error);assert.equal(r.datos.semilla.agregados,0);assert.equal(t.leer('conceptos',{historia:true}).length,antes);assert.equal(t.leer('conceptos').find(f=>f.id==='c-mind').sintesis,'Mi propia explicación');assert.equal(t.leer('conceptos').find(f=>f.id==='c-motor').vigencia,'reemplazada');});
test('CLI retirar conserva la historia y actualiza CSV',()=>{const {p,t}=nuevaCLI({sembrar:true}),r=llamar('retirar',p,{tabla:'conceptos',id:'c-mind'});assert.equal(r.estado,0,r.error);assert.equal(r.datos.vigencia,'reemplazada');assert.equal(t.leer('conceptos',{historia:true}).filter(f=>f.id==='c-mind').length,2);assert.match(readFileSync(join(p,'Tablas','conceptos.csv'),'utf8'),/reemplazada/);assert.equal(llamar('retirar',p,{tabla:'conceptos',id:'no-existe'}).estado,2);});
test('CLI Recordar guarda, exige true, confirma, recuerda y corrige',()=>{
 const {p,t}=nuevaCLI(),caso={tipo:'prueba',proyecto:'General',texto:'Respuestas breves claras'},guardar=llamar('recordar',p,{operacion:'guardar',...caso,respuesta:'Una frase'});assert.equal(guardar.estado,0,guardar.error);const id=guardar.datos.id;
 assert.equal(llamar('recordar',p,{operacion:'recordar',...caso,condicionesComprobadas:true}).datos,null);
 for(const confirmadoPorPersona of [false,'true',1])assert.equal(llamar('recordar',p,{operacion:'confirmar',id,confirmadoPorPersona}).estado,2);
 assert.equal(llamar('recordar',p,{operacion:'confirmar',id,confirmadoPorPersona:true}).estado,0);
 assert.equal(llamar('recordar',p,{operacion:'recordar',...caso,condicionesComprobadas:'true'}).datos,null);
 assert.equal(llamar('recordar',p,{operacion:'recordar',...caso,condicionesComprobadas:true}).datos.respuesta,'Una frase');
 assert.equal(llamar('recordar',p,{operacion:'corregir',id,respuesta:'Dos frases',confirmadoPorPersona:'true'}).estado,2);
 assert.equal(llamar('recordar',p,{operacion:'corregir',id,respuesta:'Dos frases',confirmadoPorPersona:true}).estado,0);
 assert.equal(llamar('recordar',p,{operacion:'recordar',...caso,condicionesComprobadas:true}).datos.respuesta,'Dos frases');assert.equal(t.leer('decisiones').length,1);
 assert.equal(llamar('recordar',p,{operacion:'otra'}).estado,2);
});
test('CLI Seguridad informa bloqueo, exige confirmación y rechaza operación desconocida',()=>{const {p}=nuevaCLI(),carpeta=join(mkdtempSync(join(tmpdir(),'mind-v2-cli-seguridad-')),'muestra');mkdirSync(carpeta);writeFileSync(join(carpeta,'SKILL.md'),'# Muestra inocua');const r=llamar('seguridad',p,{operacion:'escanear',carpeta,ejecutable:''});assert.equal(r.estado,2);assert.equal(r.datos.recomendacion,'BLOCKED');const a=llamar('seguridad',p,{operacion:'autorizar',carpeta,confirmadoPorPersona:false});assert.equal(a.estado,2);assert.match(a.error,/confirmación/);assert.equal(llamar('seguridad',p,{operacion:'otra'}).estado,2);assert.equal(llamar('seguridad',p,{operacion:'escanear'}).estado,2);});
test('CLI rechaza JSON no objeto y la Bienvenida no nombra agentes específicos',()=>{const {p}=nuevaCLI();for(const op of [null,[],42])assert.equal(llamar('buscar',p,op).estado,2);const bienvenida=readFileSync(resolve(motorPrueba,'..','Bienvenida.md'),'utf8');assert.ok(bienvenida.includes('Memoria/Vistas/Inicio.md'));assert.doesNotMatch(bienvenida,/ejecutar\.mjs entrada/);assert.ok(Math.ceil(bienvenida.length/4)<=1000);assert.doesNotMatch(bienvenida,/Codex|Claude|Gemini/);for(const archivo of ['Reglas de Proyectos.md','Reglas de Colecciones.md','Reglas de la Memoria.md'])assert.doesNotMatch(readFileSync(join(motorPrueba,'Reglas base',archivo),'utf8'),/archivo Índices|índice de la Biblioteca/);});

test('árboles grandes mantienen lecturas de Nivel 1; el detalle no se lee y el crecimiento raíz se informa',()=>{
 const t=abrirTablas(mkdtempSync(join(tmpdir(),'mind-v2-arbol-entrada-'))).inicializar(),motor=motorPrueba;
 t.alta('decisiones',{tipo:'regla-usuario',proyecto:'General',decision:'Regla base',estado:'confirmada'});
 const p=t.alta('proyectos',{tipo:'proyecto',nombre:'Prueba',estado:'activo'}),f=t.alta('proyectos',{tipo:'frente',nombre:'Raíz',proyecto:p.id,estado:'activo'}),faceta=t.alta('perfil',{tipo:'faceta',faceta:'Arte',afirmacion:'Crear'});
 const antes=entrada(motor,t.raiz);
 for(let i=0;i<25;i++) {t.alta('proyectos',{tipo:'frente',nombre:'Subfrente '+i,proyecto:p.id,perteneceA:f.id,estado:'pausado',descripcion:'DETALLE_NO_LEER'.repeat(80)});t.alta('perfil',{tipo:'faceta',faceta:'Faceta '+i,perteneceA:faceta.id,afirmacion:'DETALLE_NO_LEER'.repeat(80)});}
 let e=entrada(motor,t.raiz);assert.equal(e.rutas.length,2);assert.equal(e.texto,antes.texto);assert.equal(e.tokensEstimados,antes.tokensEstimados);assert.doesNotMatch(e.texto,/DETALLE_NO_LEER/);
 for(let i=0;i<25;i++)t.alta('proyectos',{tipo:'frente',nombre:'Activo '+i,proyecto:p.id,perteneceA:f.id,estado:'activo',loQueSigue:'Pendiente '.repeat(40)});
 e=entrada(motor,t.raiz);assert.equal(e.rutas.length,2);assert.equal(e.cabe,true);assert.ok(e.tokensEstimados<=2000);assert.match(e.texto,/26 frentes activos/);assert.match(readFileSync(join(t.raiz,'Vistas','Proyectos','Prueba - Activo 24.md'),'utf8'),/Lo que sigue: Pendiente/);assert.equal(t.leer('proyectos').filter(x=>x.tipo==='frente'&&x.estado==='activo').length,26);
});

test('vistas completas de consulta en Vistas/ no se leen al arrancar',()=>{
 const t=abrirTablas(mkdtempSync(join(tmpdir(),'mind-v2-tablas-lectura-'))).inicializar(),antes=entrada(motorPrueba,t.raiz);
 t.alta('conceptos',{concepto:'Solo consulta',tema:'Prueba',sintesis:'DETALLE_TABLA_NO_LEER'.repeat(600)});t.alta('colecciones',{nombre:'Solo consulta',direccion:'Colecciones/Prueba'});
 const e=entrada(motorPrueba,t.raiz);assert.deepEqual(e.rutas,antes.rutas);assert.equal(e.rutas.length,1);assert.equal(e.texto,antes.texto);assert.equal(e.tokensEstimados,antes.tokensEstimados);
 assert.match(readFileSync(join(t.raiz,'Vistas','Conceptos.md'),'utf8'),/DETALLE_TABLA_NO_LEER/);assert.doesNotMatch(e.texto,/DETALLE_TABLA_NO_LEER/);
});
test('ciclo desde Memoria vacía: Perfil, concepto, proyecto, frente, decisión y arranque',()=>{
 const motor=resolve(fileURLToPath(new URL('.',import.meta.url))),t=abrirTablas(mkdtempSync(join(tmpdir(),'mind-v2-ciclo-'))).inicializar(),f=abrirFrentes(t,{escritorio:()=>t.raiz}),si={confirmadoPorPersona:true};
 t.alta('perfil',{tipo:'faceta',faceta:'Estudio',afirmacion:'Aprender con práctica'});
 t.alta('perfil',{tipo:'entrada',faceta:'Estudio',afirmacion:'Estudio física',origen:'dijo'});
 const p=f.altaProyecto('Laboratorio','Proyecto ficticio',si);const frente=f.altaFrente({nombre:'Experimento',proyecto:p.id,turno:'Persona',loQueSigue:'Medir'},si);
 t.alta('conceptos',{concepto:'Aceleración',sintesis:'Cambio de velocidad',tema:'Física',conectadoA:[p.id]});
 t.alta('colecciones',{nombre:'Apuntes',direccion:'Colecciones/Apuntes',conectadoA:[p.id],dueno:'propia',patron:'texto'});
 const r=abrirDecisionesEnTablas(t),id=r.guardar({tipo:'regla-usuario',texto:'Al responder',respuesta:'Usa frases breves'});r.confirmar(id,si);
 const e=entrada(motor,t.raiz);assert.equal(e.cabe,true);assert.match(e.texto,/Aprender con práctica/);assert.match(e.texto,/Experimento.*Persona.*Medir/);assert.match(e.texto,/Usa frases breves/);assert.equal(buscar(t,{tabla:'conceptos',conectadoA:p.id,texto:'aceleracion'})[0].fila.concepto,'Aceleración');
 f.cambiar(frente.id,{estado:'terminado'});assert.doesNotMatch(entrada(motor,t.raiz).texto,/Experimento/);assert.equal(t.leer('colecciones').length,2);assert.ok(t.leer('colecciones').some(c=>c.id===p.coleccion.id));assert.ok(t.leer('colecciones').some(c=>c.nombre==='Apuntes'));
});
test('CLI real inicializa, el arranque cabe y rechaza una acción inválida',()=>{const motor=resolve(fileURLToPath(new URL('.',import.meta.url))),p=join(mkdtempSync(join(tmpdir(),'mind-v2-cli-')),'Memoria'),cli=join(motor,'ejecutar.mjs');let r=spawnSync(process.execPath,[cli,'inicializar',p],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);assert.equal(entrada(motor,p).cabe,true);assert.equal(spawnSync(process.execPath,[cli,'entrada',p],{encoding:'utf8',windowsHide:true}).status,2);r=spawnSync(process.execPath,[cli,'borrar',p],{encoding:'utf8',windowsHide:true});assert.equal(r.status,2);});

test('estándar de arranque: AGENTS.md, CLAUDE.md y GEMINI.md llevan a Bienvenida; Claude y Gemini solo importan Bienvenida con @',()=>{
 const raiz=resolve(motorPrueba,'..');
 for(const f of ['AGENTS.md','CLAUDE.md','GEMINI.md']){const t=readFileSync(join(raiz,f),'utf8');assert.ok(t.includes('`Bienvenida.md`'),f);assert.ok(Math.ceil(t.length/4)<=100,f+' debe ser mínimo');}
 for(const f of ['CLAUDE.md','GEMINI.md']){const t=readFileSync(join(raiz,f),'utf8');assert.match(t,/^@Bienvenida\.md$/m);assert.doesNotMatch(t,/Inicio/);}
 assert.doesNotMatch(readFileSync(join(raiz,'AGENTS.md'),'utf8'),/^@/m);
});

test('Bienvenida indica qué hacer con un Mind nuevo y lleva a la Guía, que existe',()=>{
 const b=readFileSync(resolve(motorPrueba,'..','Bienvenida.md'),'utf8');
 assert.match(b,/Si no existe, el Mind es nuevo/);assert.match(b,/¿cómo funciona Mind\?/);assert.match(b,/\u2192 Guía\./);
 assert.ok(readFileSync(join(motorPrueba,'Reglas base','Guía.md'),'utf8').includes('# Guía de Mind'));
 assert.ok(Math.ceil(b.length/4)<=1000);
});

test('la forma escapada del JSON funciona en cualquier consola y Bienvenida lleva a las Capacidades',()=>{
 const {p}=nuevaCLI(),cli=join(motorPrueba,'ejecutar.mjs');
 const escapado='{\\"tabla\\":\\"conceptos\\",\\"fila\\":{\\"concepto\\":\\"Armonía\\",\\"tema\\":\\"Música\\"}}';
 assert.ok(escapado.includes('\\"'));
 let r=spawnSync(process.execPath,[cli,'alta',p,escapado],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);
 r=spawnSync(process.execPath,[cli,'buscar',p,'{"tabla":"conceptos","texto":"armonia"}'],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).filas[0].fila.tema,'Música');
 assert.equal(spawnSync(process.execPath,[cli,'buscar',p,'{tabla:conceptos}'],{encoding:'utf8',windowsHide:true}).status,2);
 const b=readFileSync(resolve(motorPrueba,'..','Bienvenida.md'),'utf8');assert.match(b,/Motor\/Capacidades\/Del usuario\//);assert.match(b,/buscar Memoria/);assert.ok(Math.ceil(b.length/4)<=1000);
});

test('CLI: rama exige confirmación, crea la tabla hija y Buscar baja por ella',()=>{
 const {p}=nuevaCLI(),padre=llamar('alta',p,{tabla:'colecciones',fila:{nombre:'Taller Aurora',direccion:'D:/Aurora'}});assert.equal(padre.estado,0,padre.error);
 assert.equal(llamar('rama',p,{tabla:'colecciones',id:padre.datos.id}).estado,2);
 const r=llamar('rama',p,{tabla:'colecciones',id:padre.datos.id,confirmadoPorPersona:true});assert.equal(r.estado,0,r.error);
 const a=llamar('alta',p,{tabla:'colecciones',rama:r.datos.rama,fila:{nombre:'Bolsa lateral.jpg',direccion:'D:/Aurora/bolsa.jpg'}});assert.equal(a.estado,0,a.error);
 const b=llamar('buscar',p,{tabla:'colecciones',rama:r.datos.rama,texto:'bolsa'});assert.equal(b.datos.filas[0].fila.nombre,'Bolsa lateral.jpg');
 assert.equal(llamar('buscar',p,{tabla:'colecciones',texto:'bolsa'}).datos.filas.length,0);
});
test('CLI: proyecto con su colección en una operación; operaciones pendientes y candado sin huérfano',()=>{
 const {p,t}=nuevaCLI(),base=mkdtempSync(join(tmpdir(),'mind-v2-cli-base con espacios-'));
 const r=llamar('proyecto',p,{nombre:'Tienda',descripcion:'Ficticio',confirmadoPorPersona:true,coleccion:{base}});
 assert.equal(r.estado,0,r.error);assert.equal(r.datos.coleccion.proyecto,r.datos.proyecto.id);assert.ok(r.datos.coleccion.rama);assert.equal(r.datos.recibo.guardado,true);
 assert.equal(readdirSync(base).length,1);assert.equal(t.leer('colecciones').length,1);
 const o=llamar('operaciones',p,{});assert.equal(o.estado,0,o.error);assert.deepEqual(o.datos.pendientes,[]);
 const l=llamar('liberar',p,{confirmadoPorPersona:true});assert.equal(l.estado,0,l.error);assert.equal(l.datos.liberado,false);
 const mal=llamar('proyecto',p,{nombre:'Sin base',confirmadoPorPersona:true,coleccion:{base:join(base,'no-existe')}});assert.equal(mal.estado,2);assert.match(mal.error,/no existe/);assert.equal(t.leer('proyectos').length,1);
});
