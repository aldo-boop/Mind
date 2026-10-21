import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {join,dirname,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {abrirTablas} from '../Tablas/tablas.mjs';
import {abrirFrentes} from '../Frentes/frentes.mjs';
import {abrirColecciones} from './colecciones.mjs';
// Bloque 4 · Precisión del índice (esquema 3): tamaño y fecha de modificación por metadatos, cambios de contenido,
// coincidencias fuertes y movimientos entre carpetas. Datos ficticios en carpetas temporales.
const si={confirmadoPorPersona:true};
function nueva() {
  const base=fs.mkdtempSync(join(tmpdir(),'mind-b4-precision-')),escritorio=join(base,'Escritorio');fs.mkdirSync(escritorio);
  const t=abrirTablas(join(base,'Memoria')).inicializar();
  return {base,t,f:abrirFrentes(t,{escritorio:()=>escritorio}),c:abrirColecciones(t)};
}
const escribir=(dir,rel,texto,fecha)=>{const p=join(dir,...rel.split('/'));fs.mkdirSync(dirname(p),{recursive:true});fs.writeFileSync(p,texto);if(fecha)fs.utimesSync(p,fecha,fecha);return p;};
function filas(t,raiz,{todas=false}={}) {
  const salida=[],cola=[raiz.rama];
  while(cola.length){const r=cola.shift();for(const x of t.leer('colecciones',{rama:r})){if(todas||x.vigencia==='vigente')salida.push({...x,_rama:r});if(x.rama&&x.vigencia==='vigente')cola.push(x.rama);}}
  return salida;
}
const por=(t,raiz)=>new Map(filas(t,raiz).map(x=>[x.direccion+'|'+x.clase,x]));
const iso=p=>new Date(fs.lstatSync(p).mtimeMs).toISOString();

test('el inventario guarda tamaño y fecha de cada archivo por metadatos, sin abrirlo; las carpetas no los llevan',()=>{
  const {t,f}=nueva(),p=f.altaProyecto('Metadatos','',si),dir=p.coleccion.direccion;
  const a=escribir(dir,'Docs/informe.pdf','%PDF 12345'),b=escribir(dir,'nota.txt','');
  const leidos=[],dentro=x=>{const r=relative(dir,String(x));return !r.startsWith('..')&&!isAbsolute(r);};
  const archivos={...fs,openSync:(x,...o)=>{if(dentro(x))leidos.push(x);return fs.openSync(x,...o);},readFileSync:(x,...o)=>{if(dentro(x))leidos.push(x);return fs.readFileSync(x,...o);}};
  abrirColecciones(t,{archivos}).indexar({coleccion:p.coleccion.id,...si});
  const m=por(t,p.coleccion);
  assert.deepEqual([m.get('Docs/informe.pdf|elemento').tamano,m.get('Docs/informe.pdf|elemento').modificado],[String(fs.statSync(a).size),iso(a)]);
  assert.equal(m.get('nota.txt|elemento').tamano,'0');assert.equal(m.get('nota.txt|elemento').modificado,iso(b));
  assert.equal(m.get('Docs|subcoleccion').tamano,undefined);assert.equal(m.get('Docs|subcoleccion').modificado,undefined);
  assert.deepEqual(leidos,[]);
  assert.throws(()=>t.alta('colecciones',{clase:'subcoleccion',nombre:'X',direccion:'X',tamano:'3'},{rama:p.coleccion.rama}),/elementos de archivo/);
  assert.throws(()=>t.alta('colecciones',{nombre:'y',direccion:'y.txt',tamano:'tres'},{rama:p.coleccion.rama}),/Tamaño inválido/);
});

test('un archivo modificado se detecta sin abrirlo y conserva su ID; una fila sin datos previos solo se completa',()=>{
  const {t,f,c}=nueva(),p=f.altaProyecto('Cambios','',si),dir=p.coleccion.direccion,col=p.coleccion.id;
  const a=escribir(dir,'texto.txt','versión 1',new Date('2026-01-01T10:00:00Z')),b=escribir(dir,'igual.txt','sin cambios');
  c.indexar({coleccion:col,...si});const antes=por(t,p.coleccion).get('texto.txt|elemento');
  assert.equal(c.indexar({coleccion:col,...si}).modificados,0);
  fs.writeFileSync(a,'versión 2 más larga');fs.utimesSync(a,new Date('2026-02-01T10:00:00Z'),new Date('2026-02-01T10:00:00Z'));
  const r=c.indexar({coleccion:col,...si}),despues=por(t,p.coleccion).get('texto.txt|elemento');
  assert.equal(r.modificados,1);assert.equal(r.nuevos,0);assert.equal(despues.id,antes.id);
  assert.deepEqual(r.modificadosMuestra[0],{id:antes.id,direccion:'texto.txt',antes:{tamano:antes.tamano,modificado:antes.modificado},ahora:{tamano:despues.tamano,modificado:despues.modificado}});
  // Mismo tamaño, fecha distinta: también es un cambio.
  fs.utimesSync(b,new Date('2026-03-01T10:00:00Z'),new Date('2026-03-01T10:00:00Z'));
  assert.equal(c.indexar({coleccion:col,...si}).modificados,1);
  // Una fila registrada antes del esquema 3 (sin tamaño ni fecha) se completa sin contarse como cambio.
  escribir(dir,'antigua.txt','registrada a mano');
  const manual=t.alta('colecciones',{nombre:'antigua.txt',direccion:'antigua.txt'},{rama:p.coleccion.rama});
  const r2=c.indexar({coleccion:col,...si});
  assert.deepEqual([r2.completados,r2.modificados,r2.nuevos],[1,0,0]);
  assert.equal(por(t,p.coleccion).get('antigua.txt|elemento').id,manual.id);assert.ok(por(t,p.coleccion).get('antigua.txt|elemento').tamano);
});

test('entre cinco archivos nuevos se propone solo el que coincide en tamaño y fecha; si el contenido cambió, la propuesta es débil',()=>{
  const {t,f,c}=nueva(),p=f.altaProyecto('Fuerte','',si),dir=p.coleccion.direccion,col=p.coleccion.id;
  escribir(dir,'Docs/informe.pdf','contenido original del informe',new Date('2026-04-01T09:00:00Z'));
  c.indexar({coleccion:col,...si});const informe=por(t,p.coleccion).get('Docs/informe.pdf|elemento');
  fs.renameSync(join(dir,'Docs','informe.pdf'),join(dir,'Docs','informe final.pdf'));
  for(let i=0;i<4;i++)escribir(dir,'Docs/nuevo '+i+'.pdf','otro '+'x'.repeat(i),new Date('2026-05-0'+(i+1)+'T09:00:00Z'));
  const r=c.indexar({coleccion:col,...si});
  assert.equal(r.nuevos,5);const [prop]=r.revincular.propuestas;
  assert.equal(prop.elemento,informe.id);assert.equal(prop.coincidencia,'fuerte');
  assert.deepEqual(prop.candidatos.map(x=>[x.direccion,x.coincidencia]),[['Docs/informe final.pdf','fuerte']]);
  const res=c.resolver({coleccion:col,elemento:informe.id});
  assert.deepEqual(res.revincular.candidatos,[{direccion:'Docs/informe final.pdf',coincidencia:'fuerte'}]);
  // Otro caso: renombrado y además editado. Ya no coincide tamaño ni fecha: se proponen los de su extensión como débiles.
  const q=f.altaProyecto('Débil','',si),d2=q.coleccion.direccion;
  escribir(d2,'Docs/acta.pdf','acta',new Date('2026-04-01T09:00:00Z'));c.indexar({coleccion:q.coleccion.id,...si});
  const acta=por(t,q.coleccion).get('Docs/acta.pdf|elemento');
  fs.rmSync(join(d2,'Docs','acta.pdf'));escribir(d2,'Docs/acta corregida.pdf','acta con cambios');escribir(d2,'Docs/otra.pdf','otra');escribir(d2,'Docs/hoja.xlsx','hoja');
  const p2=c.indexar({coleccion:q.coleccion.id,...si}).revincular.propuestas[0];
  assert.equal(p2.elemento,acta.id);assert.equal(p2.coincidencia,'debil');assert.deepEqual(p2.candidatos.map(x=>x.direccion).sort(),['Docs/acta corregida.pdf','Docs/otra.pdf']);
});

test('dos copias idénticas son dos coincidencias fuertes: es una propuesta, no una certeza',()=>{
  const {t,f,c}=nueva(),p=f.altaProyecto('Copias','',si),dir=p.coleccion.direccion,col=p.coleccion.id,fecha=new Date('2026-06-01T12:00:00Z');
  escribir(dir,'logo.svg','<svg/>',fecha);c.indexar({coleccion:col,...si});const logo=por(t,p.coleccion).get('logo.svg|elemento');
  fs.renameSync(join(dir,'logo.svg'),join(dir,'logo final.svg'));escribir(dir,'Copia/logo final.svg','<svg/>',fecha);
  const prop=c.indexar({coleccion:col,...si}).revincular.propuestas[0];
  assert.equal(prop.elemento,logo.id);assert.equal(prop.coincidencia,'fuerte');assert.equal(prop.candidatos.length,2);
  assert.equal(por(t,p.coleccion).get('logo.svg|elemento').id,logo.id);assert.equal(por(t,p.coleccion).get('logo.svg|elemento').disponibilidad,'ausente');
});

test('un archivo movido a otra carpeta se revincula: conserva su ID y los frentes que lo usan; la versión anterior queda en el historial',()=>{
  const {t,f,c}=nueva(),p=f.altaProyecto('Mover','',si),dir=p.coleccion.direccion,col=p.coleccion.id;
  escribir(dir,'Entrada/contrato.pdf','contrato firmado',new Date('2026-07-01T08:00:00Z'));fs.mkdirSync(join(dir,'Archivo'));escribir(dir,'Archivo/viejo.txt','x');
  c.indexar({coleccion:col,...si});
  const contrato=por(t,p.coleccion).get('Entrada/contrato.pdf|elemento'),ref={coleccion:col,elemento:contrato.id};
  const fr=f.altaFrente({nombre:'Firma',proyecto:p.proyecto.id},si);f.uso({operacion:'registrar',frente:fr.id,elementos:[ref]});
  fs.renameSync(join(dir,'Entrada','contrato.pdf'),join(dir,'Archivo','contrato.pdf'));
  const r=c.indexar({coleccion:col,...si}),prop=r.revincular.propuestas[0];
  assert.equal(prop.elemento,contrato.id);assert.deepEqual(prop.candidatos.map(x=>[x.direccion,x.coincidencia]),[['Archivo/contrato.pdf','fuerte']]);
  const r2=c.indexar({coleccion:col,...si,revincular:[{elemento:contrato.id,direccion:'Archivo/contrato.pdf'}]});
  assert.deepEqual([r2.revinculados,r2.movidos],[1,1]);
  const vigentes=filas(t,p.coleccion).filter(x=>x.id===contrato.id);
  assert.equal(vigentes.length,1);assert.equal(vigentes[0].direccion,'Archivo/contrato.pdf');assert.equal(vigentes[0].disponibilidad,'disponible');
  const archivo=por(t,p.coleccion).get('Archivo|subcoleccion');assert.equal(vigentes[0]._rama,archivo.rama);assert.equal(vigentes[0].padre,archivo.id);
  assert.ok(filas(t,p.coleccion,{todas:true}).some(x=>x.id===contrato.id&&x.vigencia==='reemplazada'&&x._rama===por(t,p.coleccion).get('Entrada|subcoleccion').rama));
  assert.equal(filas(t,p.coleccion).filter(x=>x.direccion==='Archivo/contrato.pdf').length,1);
  assert.equal(t.elemento(ref).elemento.direccion,'Archivo/contrato.pdf');
  assert.equal(c.resolver(ref).localizador.valor,join(dir,'Archivo','contrato.pdf'));
  const usos=f.uso({operacion:'consultar',frente:fr.id});assert.equal(usos.elementos[0].localizador,join(dir,'Archivo','contrato.pdf'));
  // A una carpeta que aparece en el mismo inventario también se puede mover.
  fs.mkdirSync(join(dir,'Nueva'));fs.renameSync(join(dir,'Archivo','contrato.pdf'),join(dir,'Nueva','contrato.pdf'));
  const r3=c.indexar({coleccion:col,...si,revincular:[{elemento:contrato.id,direccion:'Nueva/contrato.pdf'}]});
  assert.equal(r3.movidos,1);assert.equal(r3.nuevos,1);assert.equal(t.elemento(ref).elemento.direccion,'Nueva/contrato.pdf');
  assert.equal(filas(t,p.coleccion).filter(x=>x.nombre==='contrato.pdf').length,1);
});

test('buscar en la colección conserva el desempate literal al juntar ramas y con archivos indexados después',()=>{
  const {t,f,c}=nueva(),p=f.altaProyecto('Logos','',si),dir=p.coleccion.direccion,col=p.coleccion.id;
  escribir(dir,'Archivos/logo-v2.png','v2');c.indexar({coleccion:col,...si});
  // Los otros logos llegan más tarde, en otra rama: son más recientes y empatan en puntuación.
  const espera=Date.now()+20;while(Date.now()<espera){}
  escribir(dir,'logo-v1.png','v1');escribir(dir,'Archivos/logo-v3.png','v3');c.indexar({coleccion:col,...si});
  const r=c.buscar({coleccion:col,texto:'logo-v2'}).filas;
  assert.equal(r[0].fila.nombre,'logo-v2.png');assert.equal(r.length,3);assert.ok(r.every(x=>x.puntuacion===r[0].puntuacion));
  assert.equal(c.buscar({coleccion:col,texto:'logo-v1'}).filas[0].fila.nombre,'logo-v1.png');
  assert.ok(!('literal' in r[0]));
});
