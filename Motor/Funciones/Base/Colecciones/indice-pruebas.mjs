import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {join,dirname,basename,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {abrirTablas} from '../Tablas/tablas.mjs';
import {abrirFrentes} from '../Frentes/frentes.mjs';
import {abrirColecciones} from './colecciones.mjs';
// Bloque 3: inventario por metadatos, resolución local o por enlace y reubicación recuperable. Datos ficticios en carpetas temporales.
const si={confirmadoPorPersona:true};
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function nueva() {
  const base=fs.mkdtempSync(join(tmpdir(),'mind-b3-')),escritorio=join(base,'Escritorio ñ & pruebas');fs.mkdirSync(escritorio);
  const t=abrirTablas(join(base,'Memoria')).inicializar();
  return {base,escritorio,t,f:abrirFrentes(t,{escritorio:()=>escritorio}),c:abrirColecciones(t)};
}
const escribir=(dir,rel,texto)=>{const p=join(dir,...rel.split('/'));fs.mkdirSync(dirname(p),{recursive:true});fs.writeFileSync(p,texto);return p;};
// Todas las filas de una colección, bajando por sus ramas.
function filas(t,raiz,{todas=false}={}) {
  const salida=[],cola=[raiz.rama];
  while(cola.length){const r=cola.shift();for(const x of t.leer('colecciones',{rama:r})){if(todas||x.vigencia==='vigente')salida.push({...x,_rama:r});if(x.rama&&x.vigencia==='vigente')cola.push(x.rama);}}
  return salida;
}
const porDireccion=(t,raiz)=>new Map(filas(t,raiz).map(x=>[x.direccion+'|'+x.clase,x]));
const raizDe=(t,id)=>t.leer('colecciones').find(x=>x.id===id);
// Espía del sistema de archivos: registra cualquier lectura de contenido dentro de la carpeta vigilada
// y puede presentar archivos «solo en línea» como puntos de reanálisis (simulación de un proveedor de nube).
function espia(vigilada,{soloEnLinea=new Set(),negar=new Set()}={}) {
  const reg={contenido:[],listados:[]},dentro=p=>{const r=relative(vigilada,String(p));return !r.startsWith('..')&&!isAbsolute(r);};
  const contenido=n=>(p,...a)=>{if(dentro(p))reg.contenido.push(n+': '+p);return fs[n](p,...a);};
  const archivos={...fs,openSync:contenido('openSync'),readFileSync:contenido('readFileSync'),createReadStream:contenido('createReadStream'),copyFileSync:contenido('copyFileSync'),utimesSync:contenido('utimesSync'),chmodSync:contenido('chmodSync'),
    readdirSync(p,o){
      if(dentro(p))reg.listados.push(String(p));
      if(negar.has(String(p)))throw Object.assign(new Error('Acceso denegado (simulado)'),{code:'EACCES'});
      const l=fs.readdirSync(p,o);
      return o?.withFileTypes?l.map(d=>soloEnLinea.has(join(p,d.name))?{name:d.name,isFile:()=>false,isDirectory:()=>false,isSymbolicLink:()=>true}:d):l;
    }};
  return {archivos,reg};
}

test('inventario de miles de elementos: índices por niveles, resultados acotados y sin abrir contenido',ctx=>{
  const {t,f}=nueva(),p=f.altaProyecto('Miles','',si),dir=p.coleccion.direccion;
  for(let i=0;i<3000;i++)escribir(dir,'Carpeta '+(i%30)+'/'+(Math.floor(i/30)%3===0?'Interior/':'')+'documento '+i+'.txt','dato '+i);
  const {archivos,reg}=espia(dir),c=abrirColecciones(t,{archivos});
  let inicio=performance.now();const r=c.indexar({coleccion:p.coleccion.id,...si});const primero=performance.now()-inicio;
  inicio=performance.now();const r2=c.indexar({coleccion:p.coleccion.id,...si});const segundo=performance.now()-inicio;
  ctx.diagnostic(`indexar 3000 archivos y 60 carpetas: ${primero.toFixed(0)} ms; repetir sin cambios: ${segundo.toFixed(0)} ms; escritos ${r.escritos} y ${r2.escritos}`);
  assert.equal(r.observados.archivos,3000);assert.equal(r.observados.carpetas,60);assert.equal(r.nuevos,3060);assert.equal(r.ramasNuevas,60);
  assert.deepEqual(reg.contenido,[]);
  assert.ok(r.nuevosMuestra.length<=10);assert.ok(r.recibo.escritos.length<=10);assert.equal(r.recibo.escritosTotal,r.escritos);
  assert.equal(r2.nuevos,0);assert.equal(r2.escritos,1);assert.equal(r2.sinCambios,3060);
  const raiz=t.leer('colecciones',{rama:p.coleccion.rama});
  assert.equal(raiz.length,30);assert.ok(raiz.every(x=>x.clase==='subcoleccion'&&x.rama&&x.padre===p.coleccion.id&&x.coleccion===p.coleccion.id&&!x.proyecto));
  assert.equal(t.ramas('colecciones').length,61);
  for(const rama of t.ramas('colecciones'))assert.ok(t.leer('colecciones',{rama}).length<=100,'cada nivel queda bajo el aviso de 100 filas: '+rama);
  assert.ok(fs.existsSync(join(t.raiz,'Vistas','Colecciones',raiz[0].rama+'.md')));
  assert.equal(c.buscar({coleccion:p.coleccion.id,texto:'documento'}).filas.length,10);
  assert.equal(c.buscar({coleccion:p.coleccion.id,texto:'documento',limite:50}).filas.length,50);
  assert.throws(()=>c.buscar({coleccion:p.coleccion.id,limite:51}),/1–50/);
  assert.equal(c.buscar({coleccion:p.coleccion.id,texto:'documento 2999'}).filas[0].fila.nombre,'documento 2999.txt');
  assert.equal(new Set(filas(t,p.coleccion).map(x=>x.id)).size,3060);
});

test('simulación de carpeta sincronizada: marcadores solo en línea se inventarían por metadatos, sin abrirlos ni cambiar atributos',()=>{
  const {t,f,base}=nueva(),nube=join(base,'Nube ficticia');fs.mkdirSync(nube);
  const p=f.altaProyecto('Nube','',{...si,coleccion:{ubicacion:'sincronizada',base:nube}}),dir=p.coleccion.direccion;
  escribir(dir,'local.txt','aquí');const a=escribir(dir,'Fotos/solo en línea.jpg','x'),b=escribir(dir,'solo en línea.pdf','y');
  const antes=[a,b].map(x=>fs.statSync(x).mtimeMs),{archivos,reg}=espia(dir,{soloEnLinea:new Set([a,b])}),c=abrirColecciones(t,{archivos});
  const r=c.indexar({coleccion:p.coleccion.id,...si});
  assert.equal(r.observados.archivos,3);assert.equal(r.omitidos.total,0);assert.deepEqual(reg.contenido,[]);
  assert.deepEqual([a,b].map(x=>fs.statSync(x).mtimeMs),antes);
  const pdf=porDireccion(t,p.coleccion).get('solo en línea.pdf|elemento'),res=c.resolver({coleccion:p.coleccion.id,elemento:pdf.id});
  assert.equal(res.observada.disponibilidad,'disponible');assert.equal(res.apertura,'puede-requerir-descarga');assert.match(res.nota,/descargue/);
  assert.deepEqual(reg.contenido,[]);
});

test('repetir inventario conserva IDs; ausencia, reaparición y cambio de tipo sin duplicar; la descripción de la persona se conserva',()=>{
  const {t,f,c}=nueva(),p=f.altaProyecto('Repetir','',si),dir=p.coleccion.direccion,col=p.coleccion.id;
  escribir(dir,'a.txt','a');escribir(dir,'Docs/b.txt','b');escribir(dir,'Docs/c.txt','c');fs.mkdirSync(join(dir,'Vacía'));
  c.indexar({coleccion:col,...si});const ids=porDireccion(t,p.coleccion);assert.equal(ids.size,5);
  const r2=c.indexar({coleccion:col,...si});assert.equal(r2.nuevos,0);assert.equal(r2.escritos,1);
  assert.deepEqual([...porDireccion(t,p.coleccion)].map(([k,x])=>[k,x.id]),[...ids].map(([k,x])=>[k,x.id]));
  const a=ids.get('a.txt|elemento');t.actualizar('colecciones',a.id,{descripcion:'Contrato firmado'},{rama:a._rama});
  fs.rmSync(join(dir,'Docs','b.txt'));
  const r3=c.indexar({coleccion:col,...si});assert.equal(r3.ausentes,1);assert.equal(r3.ausentesMuestra[0].id,ids.get('Docs/b.txt|elemento').id);
  assert.equal(porDireccion(t,p.coleccion).get('Docs/b.txt|elemento').disponibilidad,'ausente');
  escribir(dir,'Docs/b.txt','b otra vez');
  const r4=c.indexar({coleccion:col,...si});assert.equal(r4.reaparecidos,1);assert.equal(r4.nuevos,0);
  assert.equal(porDireccion(t,p.coleccion).get('Docs/b.txt|elemento').id,ids.get('Docs/b.txt|elemento').id);
  fs.rmSync(join(dir,'a.txt'));fs.mkdirSync(join(dir,'a.txt'));
  const r5=c.indexar({coleccion:col,...si});assert.equal(r5.nuevos,1);assert.equal(r5.ausentes,1);
  const despues=porDireccion(t,p.coleccion);
  assert.equal(despues.get('a.txt|elemento').disponibilidad,'ausente');assert.equal(despues.get('a.txt|elemento').descripcion,'Contrato firmado');
  assert.equal(despues.get('a.txt|subcoleccion').disponibilidad,'disponible');assert.notEqual(despues.get('a.txt|subcoleccion').id,a.id);
  const claves=filas(t,p.coleccion).map(x=>x.direccion+'|'+x.clase);assert.equal(new Set(claves).size,claves.length);
});

test('lectura parcial: una carpeta ilegible se informa y no retira sus elementos; un ámbito ausente no marca nada',()=>{
  const {t,f}=nueva(),p=f.altaProyecto('Parcial','',si),dir=p.coleccion.direccion,col=p.coleccion.id;
  escribir(dir,'Docs/b.txt','b');escribir(dir,'Docs/Interior/c.txt','c');escribir(dir,'d.txt','d');
  abrirColecciones(t).indexar({coleccion:col,...si});
  const {archivos}=espia(dir,{negar:new Set([join(dir,'Docs')])}),r=abrirColecciones(t,{archivos}).indexar({coleccion:col,...si});
  assert.deepEqual(r.errores.lista,[{direccion:'Docs',codigo:'EACCES'}]);assert.equal(r.ausentes,0);
  const estado=porDireccion(t,p.coleccion);
  for(const k of ['Docs|subcoleccion','Docs/b.txt|elemento','Docs/Interior|subcoleccion','Docs/Interior/c.txt|elemento'])assert.equal(estado.get(k).disponibilidad,'disponible',k);
  const raizNegada=espia(dir,{negar:new Set([dir])}),r2=abrirColecciones(t,{archivos:raizNegada.archivos}).indexar({coleccion:col,...si});
  assert.equal(r2.errores.lista[0].direccion,'.');assert.equal(r2.ausentes,0);
  const antes=t.leer('colecciones',{historia:true,rama:p.coleccion.rama}).length;
  fs.renameSync(dir,dir+' (apartada)');
  assert.throws(()=>abrirColecciones(t).indexar({coleccion:col,...si}),e=>e.codigo==='AMBITO_INACCESIBLE'&&e.necesitaDecision===true);
  assert.equal(t.leer('colecciones',{historia:true,rama:p.coleccion.rama}).length,antes);assert.deepEqual(t.operacionesPendientes(),[]);
  fs.renameSync(dir+' (apartada)',dir);
});

test('resolver da localizador y disponibilidad observada; un archivo borrado fuera de Mind conserva su ID y la referencia del frente',()=>{
  const {t,f,c}=nueva(),p=f.altaProyecto('Resolver','',si),dir=p.coleccion.direccion,col=p.coleccion.id,archivo=escribir(dir,'Docs/informe.pdf','%PDF ficticio');
  c.indexar({coleccion:col,...si});const e=porDireccion(t,p.coleccion).get('Docs/informe.pdf|elemento');
  const fr=f.altaFrente({nombre:'Usa informe',proyecto:p.proyecto.id},si),ref={coleccion:col,elemento:e.id};
  t.actualizar('proyectos',fr.id,{elementosUsados:[ref]});
  const r=c.resolver(ref);
  assert.deepEqual(r.localizador,{tipo:'ruta',valor:archivo});assert.equal(r.observada.disponibilidad,'disponible');assert.equal(r.comprobacion,'metadatos-locales');assert.equal(r.indiceDesactualizado,false);
  const raiz=c.resolver({coleccion:col});assert.equal(raiz.localizador.valor,dir);assert.equal(raiz.observada.disponibilidad,'disponible');
  fs.rmSync(archivo);
  const r2=c.resolver(ref);assert.equal(r2.observada.disponibilidad,'ausente');assert.equal(r2.registrada.disponibilidad,'disponible');assert.equal(r2.indiceDesactualizado,true);assert.equal(r2.revincular,undefined);
  c.indexar({coleccion:col,...si});
  assert.equal(t.elemento(ref).elemento.id,e.id);assert.equal(t.elemento(ref).elemento.disponibilidad,'ausente');
  assert.deepEqual(t.leer('proyectos').find(x=>x.id===fr.id).elementosUsados,[ref]);
  assert.equal(c.resolver(ref).indiceDesactualizado,false);
});

test('renombre externo ambiguo pide revincular; la persona decide y se conserva el ID sin fusionar por parecido',()=>{
  const {t,f,c}=nueva(),p=f.altaProyecto('Renombre','',si),dir=p.coleccion.direccion,col=p.coleccion.id;
  escribir(dir,'Docs/informe.pdf','v1');escribir(dir,'Docs/otro.pdf','o');
  c.indexar({coleccion:col,...si});const informe=porDireccion(t,p.coleccion).get('Docs/informe.pdf|elemento');
  fs.renameSync(join(dir,'Docs','informe.pdf'),join(dir,'Docs','informe final.pdf'));
  const res=c.resolver({coleccion:col,elemento:informe.id});
  assert.equal(res.observada.disponibilidad,'ausente');assert.equal(res.revincular.necesitaDecision,true);assert.deepEqual(res.revincular.candidatos,[{direccion:'Docs/informe final.pdf',coincidencia:'fuerte'}]);
  const r=c.indexar({coleccion:col,...si});
  assert.equal(r.ausentes,1);assert.equal(r.nuevos,1);assert.equal(r.revincular.propuestas[0].elemento,informe.id);
  const nuevo=porDireccion(t,p.coleccion).get('Docs/informe final.pdf|elemento');assert.notEqual(nuevo.id,informe.id);
  assert.deepEqual(r.revincular.propuestas[0].candidatos,[{id:nuevo.id,direccion:'Docs/informe final.pdf',coincidencia:'fuerte'}]);
  assert.throws(()=>c.indexar({coleccion:col,revincular:[{elemento:informe.id,direccion:'Docs/informe final.pdf'}]}),/confirmadoPorPersona/);
  assert.throws(()=>c.indexar({coleccion:col,...si,revincular:[{elemento:informe.id,direccion:'../informe final.pdf'}]}),/no es un archivo observado/);
  const r2=c.indexar({coleccion:col,...si,revincular:[{elemento:informe.id,direccion:'Docs/informe final.pdf'}]});
  assert.equal(r2.revincular,undefined);
  const vigentes=filas(t,p.coleccion).filter(x=>x.direccion==='Docs/informe final.pdf');
  assert.deepEqual(vigentes.map(x=>[x.id,x.disponibilidad]),[[informe.id,'disponible']]);
  assert.equal(filas(t,p.coleccion,{todas:true}).find(x=>x.id===nuevo.id).vigencia,'reemplazada');
  assert.equal(c.resolver({coleccion:col,elemento:informe.id}).localizador.valor,join(dir,'Docs','informe final.pdf'));
  // Si la fila nueva ya la usa un frente, no se retira: hace falta una decisión.
  fs.renameSync(join(dir,'Docs','otro.pdf'),join(dir,'Docs','otro v2.pdf'));c.indexar({coleccion:col,...si});
  const otro=porDireccion(t,p.coleccion).get('Docs/otro.pdf|elemento'),v2=porDireccion(t,p.coleccion).get('Docs/otro v2.pdf|elemento');
  const fr=f.altaFrente({nombre:'Usa v2',proyecto:p.proyecto.id},si);t.actualizar('proyectos',fr.id,{elementosUsados:[{coleccion:col,elemento:v2.id}]});
  assert.throws(()=>c.indexar({coleccion:col,...si,revincular:[{elemento:otro.id,direccion:'Docs/otro v2.pdf'}]}),e=>e.codigo==='REVINCULAR_REFERENCIADO');
  assert.equal(porDireccion(t,p.coleccion).get('Docs/otro v2.pdf|elemento').id,v2.id);
});

test('registrar y resolver un enlace no accede a la red ni afirma descarga (con revisión estática del código)',()=>{
  const fuente=fs.readFileSync(fileURLToPath(new URL('./colecciones.mjs',import.meta.url)),'utf8');
  for(const prohibido of ['node:http','node:https','node:net','node:dns','fetch('])assert.equal(fuente.includes(prohibido),false,prohibido);
  const original=globalThis.fetch;let llamadas=0;globalThis.fetch=()=>{llamadas++;throw new Error('sin red');};
  try {
    const {t,f,c,escritorio}=nueva(),p=f.altaProyecto('Enlaces','',si),col=p.coleccion.id,antes=fs.readdirSync(p.coleccion.direccion);
    const r=c.registrarEnlace({coleccion:col,nombre:'Guía',direccion:'https://example.invalid/guia.pdf',descripcion:'Referencia externa'});
    assert.equal(r.elemento.ubicacion,'enlace');assert.equal(r.elemento.disponibilidad,'no-comprobada');assert.equal(r.elemento.coleccion,col);assert.match(r.estado.nota,/no descargó/);
    const otra=c.registrarEnlace({coleccion:col,nombre:'Guía',direccion:'https://example.invalid/guia.pdf'});assert.equal(otra.repetido,true);assert.equal(otra.elemento.id,r.elemento.id);
    assert.equal(filas(t,p.coleccion).length,1);
    const res=c.resolver({coleccion:col,elemento:r.elemento.id});
    assert.deepEqual(res.localizador,{tipo:'enlace',valor:'https://example.invalid/guia.pdf'});assert.equal(res.observada.disponibilidad,'no-comprobada');assert.equal(res.apertura,'requiere-acceso-remoto');
    fs.mkdirSync(join(p.coleccion.direccion,'Docs'));c.indexar({coleccion:col,...si});
    const docs=porDireccion(t,p.coleccion).get('Docs|subcoleccion');
    assert.throws(()=>c.registrarEnlace({coleccion:col,dentroDe:docs.id,nombre:'Hoja',direccion:'drive:hoja-ficticia'}),/confirmadoPorPersona/);
    const dentro=c.registrarEnlace({coleccion:col,dentroDe:docs.id,nombre:'Hoja',direccion:'drive:hoja-ficticia',...si});assert.equal(dentro.elemento.padre,docs.id);
    for(const direccion of ['file:///C:/Usuarios/x.txt','C:\\x.txt','javascript:alert(1)','sin esquema'])assert.throws(()=>c.registrarEnlace({coleccion:col,nombre:'Mal',direccion}),e=>e.necesitaDecision===true);
    const q=f.altaProyecto('Remoto','',{...si,coleccion:{ubicacion:'enlace',direccion:'drive:carpeta-ficticia'}});
    assert.equal(c.registrarEnlace({coleccion:q.coleccion.id,nombre:'Acta',direccion:'drive:acta-ficticia'}).elemento.ubicacion,'enlace');
    assert.throws(()=>c.indexar({coleccion:q.coleccion.id,...si}),e=>e.codigo==='INDEXAR_ENLACE');
    assert.equal(c.resolver({coleccion:q.coleccion.id}).observada.disponibilidad,'no-comprobada');
    assert.deepEqual(fs.readdirSync(p.coleccion.direccion).filter(n=>!antes.includes(n)),['Docs']);assert.equal(fs.readdirSync(escritorio).length,1);
    assert.equal(llamadas,0);
  } finally { globalThis.fetch=original; }
});

test('junctions dentro de una colección no se siguen: ciclo y escape se informan sin indexar lo ajeno',{skip:process.platform!=='win32'},()=>{
  const {t,f,c,base}=nueva(),p=f.altaProyecto('Atajos','',si),dir=p.coleccion.direccion,col=p.coleccion.id,fuera=join(base,'Fuera');
  escribir(fuera,'secreto.txt','ajeno');escribir(dir,'Docs/a.txt','a');
  fs.symlinkSync(fuera,join(dir,'Atajo'),'junction');fs.symlinkSync(dir,join(dir,'Docs','Ciclo'),'junction');
  const r=c.indexar({coleccion:col,...si});
  assert.deepEqual(r.omitidos.lista.map(x=>[x.direccion,x.motivo]).sort(),[['Atajo','enlace-simbolico'],['Docs/Ciclo','enlace-simbolico']]);
  assert.equal(r.observados.archivos,1);assert.ok(!filas(t,p.coleccion).some(x=>x.nombre==='secreto.txt'));
  const {rama}=porDireccion(t,p.coleccion).get('Docs|subcoleccion');
  const absoluto=t.alta('colecciones',{nombre:'Por atajo',direccion:join(dir,'Atajo','secreto.txt'),ubicacion:'absoluta'},{rama});
  const res=c.resolver({coleccion:col,elemento:absoluto.id});assert.equal(res.observada.disponibilidad,'sin-acceso');
  assert.equal(fs.readFileSync(join(fuera,'secreto.txt'),'utf8'),'ajeno');
});

test('escapes de ruta y ramas ajenas se rechazan antes de acceder',()=>{
  const {t,f,c}=nueva(),p=f.altaProyecto('Ámbito','',si),q=f.altaProyecto('Ajeno','',si);
  escribir(q.coleccion.direccion,'Sub/x.txt','x');c.indexar({coleccion:q.coleccion.id,...si});
  const sub=porDireccion(t,q.coleccion).get('Sub|subcoleccion');
  assert.throws(()=>t.alta('colecciones',{nombre:'Escape',direccion:'../fuera.txt'},{rama:p.coleccion.rama}),/incompatible|inválid/i);
  assert.throws(()=>c.indexar({coleccion:p.coleccion.id,rama:sub.rama,...si}),/no pertenece/);
  assert.throws(()=>c.indexar({coleccion:p.coleccion.id,elemento:sub.id,...si}),/inexistente/);
  assert.throws(()=>c.reubicar({coleccion:p.coleccion.id,destino:{base:join(p.coleccion.direccion)},...si}),e=>e.necesitaDecision===true);
  assert.throws(()=>c.indexar({coleccion:p.coleccion.id,profundidad:0}),/profundidad/);
  assert.equal(filas(t,p.coleccion).length,0);
});

test('inventario acotado: profundidad y subcolección limitan el recorrido y no tocan otras ramas',()=>{
  const {t,f}=nueva(),p=f.altaProyecto('Acotado','',si),dir=p.coleccion.direccion,col=p.coleccion.id;
  escribir(dir,'A/a1.txt','1');escribir(dir,'A/Sub/s1.txt','s');escribir(dir,'B/b1.txt','b');
  const r=abrirColecciones(t).indexar({coleccion:col,profundidad:1,...si});
  assert.deepEqual([r.observados.carpetas,r.observados.archivos],[2,0]);assert.equal(filas(t,p.coleccion).length,2);
  abrirColecciones(t).indexar({coleccion:col,...si});
  const A=porDireccion(t,p.coleccion).get('A|subcoleccion'),B=porDireccion(t,p.coleccion).get('B|subcoleccion');
  const ramaB=join(t.raiz,'Tablas','colecciones',B.rama+'.jsonl'),hB=hash(ramaB),ramaRaiz=join(t.raiz,'Tablas','colecciones',p.coleccion.rama+'.jsonl'),hR=hash(ramaRaiz);
  escribir(dir,'A/a2.txt','2');escribir(dir,'B/b2.txt','fuera del ámbito');
  const {archivos,reg}=espia(dir),r2=abrirColecciones(t,{archivos}).indexar({coleccion:col,elemento:A.id,...si});
  assert.equal(r2.nuevos,1);assert.equal(r2.ambito.direccion,'A');
  assert.ok(reg.listados.every(x=>x.startsWith(join(dir,'A'))));assert.equal(hash(ramaB),hB);
  assert.notEqual(hash(ramaRaiz),hR); // Solo cambia la fila del ámbito (comprobado), no las demás.
  assert.equal(abrirColecciones(t).indexar({coleccion:col,rama:B.rama,...si}).nuevos,1);
});

test('indexación interrumpida tras escrituras duraderas se reanuda sin duplicar IDs',()=>{
  const {t,f,c}=nueva(),p=f.altaProyecto('Corte','',si),dir=p.coleccion.direccion,col=p.coleccion.id,idPedido='indexar-corte';
  for(let i=0;i<3;i++)escribir(dir,'A/x'+i+'.txt',String(i));
  c.indexar({coleccion:col,...si});
  for(let i=3;i<5;i++)escribir(dir,'A/x'+i+'.txt',String(i));escribir(dir,'B/y.txt','y');
  // Obstáculo: la rama de «A» queda de solo lectura; el lote se corta al escribirla, después de guardar la raíz y la rama principal.
  const A=porDireccion(t,p.coleccion).get('A|subcoleccion'),obstaculo=join(t.raiz,'Tablas','colecciones',A.rama+'.jsonl');
  fs.chmodSync(obstaculo,0o444);
  try { assert.throws(()=>c.indexar({coleccion:col,idPedido,...si}),e=>e.recibo?.guardado===true&&e.recibo.pendiente===true); }
  finally { fs.chmodSync(obstaculo,0o666); }
  assert.equal(t.operacionesPendientes().length,1);assert.equal(t.operacionesPendientes()[0].tipo,'indexar');
  assert.ok(porDireccion(t,p.coleccion).has('B|subcoleccion'));assert.ok(!porDireccion(t,p.coleccion).has('A/x3.txt|elemento'));
  const r=c.indexar({coleccion:col,...si});
  assert.equal(r.recibo.operacion,idPedido);assert.deepEqual(t.operacionesPendientes(),[]);
  const todas=filas(t,p.coleccion),claves=todas.map(x=>x.direccion+'|'+x.clase);
  assert.equal(todas.length,8);assert.equal(new Set(claves).size,8);assert.equal(new Set(todas.map(x=>x.id)).size,8);
});

test('vista pendiente tras inventariar: el recibo lo informa y reintentar recupera sin duplicar',()=>{
  const {t,f,c,base}=nueva(),p=f.altaProyecto('Vista','',si),dir=p.coleccion.direccion,col=p.coleccion.id;
  escribir(dir,'a.txt','a');escribir(dir,'b.txt','b');
  const csv=join(t.raiz,'Tablas','colecciones',p.coleccion.rama+'.csv');
  if(fs.existsSync(csv))fs.renameSync(csv,join(base,'csv-previo'));fs.mkdirSync(csv,{recursive:true});
  assert.throws(()=>c.indexar({coleccion:col,idPedido:'vista',...si}),e=>e.recibo?.guardado===true&&e.recibo.vistaPendiente===true);
  assert.equal(filas(t,p.coleccion).length,2);
  assert.throws(()=>c.indexar({coleccion:col,idPedido:'vista',...si}),e=>e.recibo?.guardado===true&&e.recibo.vistaPendiente===true);
  assert.equal(filas(t,p.coleccion).length,2);
  fs.rmdirSync(csv);
  const r=c.indexar({coleccion:col,idPedido:'vista',...si});
  assert.equal(r.recibo.vistaPendiente,false);assert.ok(fs.statSync(csv).isFile());assert.equal(fs.existsSync(join(t.raiz,'.vista-pendiente.json')),false);
  assert.equal(r.nuevos,0);assert.equal(filas(t,p.coleccion).length,2);
});

test('reubicar copia, verifica y cambia la raíz conservando IDs, referencias de frentes y originales',()=>{
  const {t,f,c,base}=nueva(),p=f.altaProyecto('Mudanza','Colección automática del Bloque 2',si),dir=p.coleccion.direccion,col=p.coleccion.id;
  escribir(dir,'Docs/informe.pdf','%PDF ficticio');escribir(dir,'Docs/Anexos/tabla.csv','a;b\n1;2');escribir(dir,'nota ñ.txt','tildes');
  fs.writeFileSync(join(dir,'datos.bin'),Buffer.from([0,1,2,255,254]));fs.mkdirSync(join(dir,'Vacía'));
  c.indexar({coleccion:col,...si});
  const antes=filas(t,p.coleccion),informe=antes.find(x=>x.direccion==='Docs/informe.pdf'),bin=antes.find(x=>x.direccion==='datos.bin');
  const fr=f.altaFrente({nombre:'Usa recursos',proyecto:p.proyecto.id},si),refs=[{coleccion:col,elemento:informe.id},{coleccion:col,elemento:bin.id}];
  t.actualizar('proyectos',fr.id,{elementosUsados:refs});
  const originales=new Map(['Docs/informe.pdf','Docs/Anexos/tabla.csv','nota ñ.txt','datos.bin'].map(r=>[r,hash(join(dir,...r.split('/')))]));
  const disco=join(base,'Disco nuevo');fs.mkdirSync(disco);
  assert.throws(()=>c.reubicar({coleccion:col,destino:{base:disco}}),/confirmadoPorPersona/);
  const r=c.reubicar({coleccion:col,destino:{base:disco},...si});
  const destinoFinal=join(disco,basename(dir));
  assert.equal(r.idsConservados,true);assert.equal(r.coleccion.direccion,destinoFinal);assert.equal(r.coleccion.id,col);assert.equal(r.origen.conservado,true);
  assert.deepEqual([r.verificacion.archivos,r.verificacion.carpetas],[4,3]);assert.match(r.verificacion.contenido,/SHA-256/);
  for(const [rel,h] of originales){assert.equal(hash(join(dir,...rel.split('/'))),h);assert.equal(hash(join(destinoFinal,...rel.split('/'))),h);}
  assert.ok(fs.statSync(join(destinoFinal,'Vacía')).isDirectory());
  assert.deepEqual(filas(t,raizDe(t,col)).map(x=>x.id).sort(),antes.map(x=>x.id).sort());
  for(const ref of refs){assert.equal(t.elemento(ref).elemento.id,ref.elemento);const res=c.resolver(ref);assert.ok(res.localizador.valor.startsWith(destinoFinal));assert.equal(res.observada.disponibilidad,'disponible');}
  assert.deepEqual(t.leer('proyectos').find(x=>x.id===fr.id).elementosUsados,refs);
  const ficha=fs.readdirSync(join(t.raiz,'Vistas','Proyectos')).filter(n=>n.endsWith(' - Usa recursos.md')).map(n=>fs.readFileSync(join(t.raiz,'Vistas','Proyectos',n),'utf8'))[0];
  assert.ok(ficha.includes(destinoFinal));
  assert.equal(c.reubicar({coleccion:col,destino:{base:disco},...si}).repetido,true);
  assert.deepEqual(fs.readdirSync(disco),[basename(dir)]);assert.equal(t.leer('colecciones').filter(x=>x.vigencia==='vigente').length,1);
  const nombres=[];const recorrer=d=>{for(const n of fs.readdirSync(d)){nombres.push(n);if(fs.statSync(join(d,n)).isDirectory())recorrer(join(d,n));}};recorrer(destinoFinal);
  assert.ok(!nombres.some(n=>n.includes('.mind-')));
  assert.deepEqual(t.operacionesPendientes(),[]);
});

test('reubicar rechaza destino ocupado, destino dentro del origen, descargas no autorizadas y enlaces; vincular exige la copia completa',()=>{
  const {t,f,c,base}=nueva(),p=f.altaProyecto('Límites','',si),dir=p.coleccion.direccion,col=p.coleccion.id;
  escribir(dir,'a.txt','a');escribir(dir,'Docs/b.txt','b');c.indexar({coleccion:col,...si});
  const ocupado=join(base,'Ocupado'),ajeno=escribir(ocupado,'ajeno.txt','de otra persona');
  assert.throws(()=>c.reubicar({coleccion:col,destino:{direccion:ocupado},...si}),e=>e.codigo==='DESTINO_OCUPADO');
  assert.equal(fs.readFileSync(ajeno,'utf8'),'de otra persona');assert.deepEqual(fs.readdirSync(ocupado),['ajeno.txt']);
  assert.throws(()=>c.reubicar({coleccion:col,destino:{base:join(dir,'Docs')},...si}),e=>e.necesitaDecision===true);
  assert.equal(raizDe(t,col).direccion,dir);assert.deepEqual(t.operacionesPendientes(),[]);
  const nube=join(base,'Nube');fs.mkdirSync(nube);const s=f.altaProyecto('Sincronizada','',{...si,coleccion:{ubicacion:'sincronizada',base:nube}});
  escribir(s.coleccion.direccion,'foto.jpg','x');
  assert.throws(()=>c.reubicar({coleccion:s.coleccion.id,destino:{base:join(base,'Local')},...si}),e=>e.codigo==='DESCARGA_NO_AUTORIZADA'||e.codigo==='DECISION_UBICACION');
  fs.mkdirSync(join(base,'Local'));
  assert.throws(()=>c.reubicar({coleccion:s.coleccion.id,destino:{base:join(base,'Local')},...si}),e=>e.codigo==='DESCARGA_NO_AUTORIZADA');
  assert.deepEqual(fs.readdirSync(join(base,'Local')),[]);
  const autorizada=c.reubicar({coleccion:s.coleccion.id,destino:{base:join(base,'Local')},permitirDescarga:true,...si});assert.equal(autorizada.verificacion.archivos,1);
  const e=f.altaProyecto('Remota','',{...si,coleccion:{ubicacion:'enlace',direccion:'drive:carpeta-ficticia'}});
  assert.throws(()=>c.reubicar({coleccion:e.coleccion.id,destino:{base},modo:'copiar',...si}),x=>x.codigo==='ORIGEN_REMOTO');
  assert.throws(()=>c.reubicar({coleccion:col,destino:{ubicacion:'enlace',direccion:'drive:otra'},...si}),x=>x.codigo==='REUBICAR_A_ENLACE');
  const cambiada=c.reubicar({coleccion:e.coleccion.id,destino:{ubicacion:'enlace',direccion:'drive:carpeta-nueva'},...si});
  assert.equal(cambiada.coleccion.direccion,'drive:carpeta-nueva');assert.equal(cambiada.coleccion.disponibilidad,'no-comprobada');
  // Vincular una copia hecha por la persona: incompleta se rechaza con detalle; completa se adopta.
  const copia=join(base,'Copia de la persona');fs.cpSync(dir,copia,{recursive:true});fs.rmSync(join(copia,'Docs','b.txt'));
  assert.throws(()=>c.reubicar({coleccion:col,destino:{direccion:copia},modo:'vincular',...si}),x=>x.codigo==='VINCULAR_INCOMPLETO'&&x.detalle.faltantes.lista[0]==='Docs/b.txt');
  fs.writeFileSync(join(copia,'Docs','b.txt'),'distinto');
  assert.throws(()=>c.reubicar({coleccion:col,destino:{direccion:copia},modo:'vincular',...si}),x=>x.codigo==='VINCULAR_INCOMPLETO'&&x.detalle.distintos.lista[0]==='Docs/b.txt');
  fs.writeFileSync(join(copia,'Docs','b.txt'),'b');
  const v=c.reubicar({coleccion:col,destino:{direccion:copia},modo:'vincular',...si});
  assert.equal(v.coleccion.direccion,copia);assert.match(v.verificacion.contenido,/SHA-256/);assert.ok(fs.existsSync(join(dir,'a.txt')));
});

test('reubicación interrumpida conserva la raíz original, puede cancelarse o reanudarse hasta una copia verificada',()=>{
  const {t,f,c,base}=nueva(),p=f.altaProyecto('Interrumpida','',si),dir=p.coleccion.direccion,col=p.coleccion.id;
  for(let i=0;i<6;i++)escribir(dir,'Docs/archivo '+i+'.txt','contenido '+i);
  c.indexar({coleccion:col,...si});const ids=filas(t,p.coleccion).map(x=>x.id).sort(),disco=join(base,'Destino');fs.mkdirSync(disco);
  let restantes=3;const archivos={...fs,copyFileSync(a,b,...x){if(--restantes===0)throw new Error('Caída simulada durante la copia');return fs.copyFileSync(a,b,...x);}};
  assert.throws(()=>abrirColecciones(t,{archivos}).reubicar({coleccion:col,destino:{base:disco},...si}),e=>e.recibo?.pendiente===true&&e.recibo.guardado===false);
  assert.equal(raizDe(t,col).direccion,dir);
  const [op]=t.operacionesPendientes();assert.equal(op.tipo,'reubicar');assert.equal(op.pasos.destino.estado,'copiando');
  assert.ok(c.resolver({coleccion:col,elemento:ids[0]}).localizador.valor.startsWith(dir));
  assert.throws(()=>c.indexar({coleccion:col,...si}),e=>e.codigo==='REUBICACION_PENDIENTE');
  assert.throws(()=>c.reubicar({coleccion:col,destino:{base:base},...si}),e=>e.codigo==='REUBICACION_PENDIENTE');
  // Cancelar devuelve el control sin borrar la copia parcial; reubicar de nuevo exige un destino vacío.
  const cancelada=c.reubicar({coleccion:col,cancelar:true,...si});
  assert.equal(cancelada.cancelada,true);assert.equal(raizDe(t,col).direccion,dir);assert.deepEqual(t.operacionesPendientes(),[]);
  assert.ok(fs.existsSync(join(disco,basename(dir))));
  assert.throws(()=>c.reubicar({coleccion:col,destino:{base:disco},...si}),e=>e.codigo==='DESTINO_OCUPADO');
  // Reanudar: otro corte y el reintento sin idPedido continúa la misma operación.
  const disco2=join(base,'Destino 2');fs.mkdirSync(disco2);restantes=2;
  assert.throws(()=>abrirColecciones(t,{archivos}).reubicar({coleccion:col,destino:{base:disco2},...si}),e=>e.recibo?.pendiente===true);
  const r=c.reubicar({coleccion:col,destino:{base:disco2},...si});
  assert.equal(r.coleccion.direccion,join(disco2,basename(dir)));assert.equal(r.verificacion.archivos,6);assert.deepEqual(t.operacionesPendientes(),[]);
  assert.deepEqual(filas(t,raizDe(t,col)).map(x=>x.id).sort(),ids);
  assert.deepEqual(fs.readdirSync(join(r.coleccion.direccion,'Docs')).sort(),fs.readdirSync(join(dir,'Docs')).sort());
  // Tras escribir la raíz, una vista pendiente queda en el recibo y el reintento con el mismo idPedido la recupera.
  const disco3=join(base,'Destino 3');fs.mkdirSync(disco3);const csv=join(t.raiz,'Tablas','colecciones.csv');
  fs.renameSync(csv,join(base,'csv-previo'));fs.mkdirSync(csv);
  assert.throws(()=>c.reubicar({coleccion:col,destino:{base:disco3},idPedido:'mover-vista',...si}),e=>e.recibo?.guardado===true&&e.recibo.vistaPendiente===true);
  assert.equal(raizDe(t,col).direccion,join(disco3,basename(dir)));
  fs.rmdirSync(csv);
  const reintento=c.reubicar({coleccion:col,destino:{base:disco3},idPedido:'mover-vista',...si});
  assert.equal(reintento.repetido,true);assert.equal(reintento.recibo.vistaPendiente,false);assert.ok(fs.statSync(csv).isFile());
});

test('dos procesos indexan y reubican a la vez sin duplicar filas ni copias',async()=>{
  const {t,f,base}=nueva(),p=f.altaProyecto('Concurrente','',si),dir=p.coleccion.direccion,col=p.coleccion.id;
  for(let i=0;i<200;i++)escribir(dir,'Carpeta '+(i%4)+'/f'+i+'.txt',String(i));
  const modT=new URL('../Tablas/tablas.mjs',import.meta.url).href,modC=new URL('./colecciones.mjs',import.meta.url).href;
  const correr=op=>new Promise((bien,mal)=>{
    const codigo=`import {abrirTablas} from ${JSON.stringify(modT)};import {abrirColecciones} from ${JSON.stringify(modC)};const c=abrirColecciones(abrirTablas(${JSON.stringify(t.raiz)}));for(let i=0;i<1000;i++){try{const r=c.${op.operacion}(${JSON.stringify(op)});console.log(JSON.stringify({nuevos:r.nuevos,repetido:r.repetido===true,direccion:r.coleccion?.direccion}));break;}catch(e){if(!/Memoria ocupada/.test(e.message))throw e;await new Promise(r=>setTimeout(r,10));}}`;
    const h=spawn(process.execPath,['--input-type=module','-e',codigo],{windowsHide:true});let s='',e='';h.stdout.on('data',b=>s+=b);h.stderr.on('data',b=>e+=b);h.on('error',mal);h.on('exit',x=>x===0?bien(JSON.parse(s)):mal(Error(e)));
  });
  const indexados=await Promise.all([correr({operacion:'indexar',coleccion:col,...si}),correr({operacion:'indexar',coleccion:col,...si})]);
  assert.deepEqual(indexados.map(x=>x.nuevos).sort((a,b)=>a-b),[0,204]);
  const claves=filas(t,p.coleccion).map(x=>x.direccion);assert.equal(claves.length,204);assert.equal(new Set(claves).size,204);
  const disco=join(base,'Disco compartido');fs.mkdirSync(disco);
  const movidos=await Promise.all([correr({operacion:'reubicar',coleccion:col,destino:{base:disco},...si}),correr({operacion:'reubicar',coleccion:col,destino:{base:disco},...si})]);
  assert.deepEqual(movidos.map(x=>x.repetido).sort(),[false,true]);
  assert.deepEqual(fs.readdirSync(disco),[basename(dir)]);assert.equal(raizDe(t,col).direccion,join(disco,basename(dir)));
  assert.deepEqual(t.operacionesPendientes(),[]);
});

test('CLI de Colecciones: inventario, resolución, enlace y reubicación devuelven datos; una decisión sale con código 2 y detalle',()=>{
  const {t,f,base}=nueva(),p=f.altaProyecto('CLI índice','',si),dir=p.coleccion.direccion,col=p.coleccion.id,exec=fileURLToPath(new URL('../../../ejecutar.mjs',import.meta.url));
  escribir(dir,'Docs/a.txt','a');
  const cli=op=>{const r=spawnSync(process.execPath,[exec,'coleccion',t.raiz,JSON.stringify({...op,coleccion:col})],{encoding:'utf8',windowsHide:true});return {status:r.status,json:r.stdout?JSON.parse(r.stdout):null,stderr:r.stderr};};
  const i=cli({operacion:'indexar',...si});assert.equal(i.status,0,i.stderr);assert.equal(i.json.nuevos,2);assert.equal(i.json.recibo.escritosTotal,3);
  const a=porDireccion(t,p.coleccion).get('Docs/a.txt|elemento');
  const r=cli({operacion:'resolver',elemento:a.id});assert.equal(r.status,0);assert.equal(r.json.observada.disponibilidad,'disponible');
  const e=cli({operacion:'registrarEnlace',nombre:'Web',direccion:'https://example.invalid'});assert.equal(e.status,0);assert.equal(e.json.elemento.disponibilidad,'no-comprobada');
  const vacia=join(base,'Vacía');fs.mkdirSync(vacia);
  const d=cli({operacion:'reubicar',destino:{direccion:vacia},modo:'vincular',...si});
  assert.equal(d.status,2);assert.equal(d.json.codigo,'VINCULAR_INCOMPLETO');assert.equal(d.json.necesitaDecision,true);assert.ok(d.json.detalle.faltantes.total>=1);
  const m=cli({operacion:'reubicar',destino:{base:vacia},...si});assert.equal(m.status,0,m.stderr);assert.equal(m.json.coleccion.direccion,join(vacia,basename(dir)));
});
