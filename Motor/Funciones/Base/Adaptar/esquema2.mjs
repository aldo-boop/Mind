// Regla determinista del esquema 1 al 2: Colecciones con clase, propiedad, padre y ubicación.
// Solo agrega columnas que faltan; nunca cambia un valor existente, un ID, una conexión ni el orden de los eventos.
// Lo que no se puede decidir sin interpretar (dueño ambiguo, rama sin padre) se marca en «pendiente» para la persona.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { esEnlace, esAbsoluta, atomico } from '../Tablas/tablas.mjs';

const RAMA = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const NUEVAS_V2 = Object.freeze(['clase','descripcion','proyecto','padre','coleccion','ubicacion','disponibilidad','comprobado','pendiente']);

function eventos(p,etiqueta) {
  return readFileSync(p,'utf8').split('\n').filter(l=>l.trim()).map((l,i)=>{
    let e; try { e=JSON.parse(l); } catch { throw Error(`Registro truncado: ${etiqueta}, línea ${i+1}`); }
    if(e.operacion!=='poner'||!e.fila||typeof e.fila.id!=='string') throw Error('Evento no soportado en '+etiqueta+'; requiere instrucciones del Motor');
    return e;
  });
}
const ultimos = evs => { const m=new Map(); for(const e of evs) m.set(e.fila.id,e.fila); return m; };
const lista = v => (Array.isArray(v)?v:[v]).filter(x=>typeof x==='string'&&x);

// En el esquema 1 una dirección relativa se entendía relativa a Memoria: se conserva ese significado («mind»).
const ubicacionV1 = (direccion,raiz) => esEnlace(direccion)?'enlace':esAbsoluta(direccion)?(raiz?'local':'absoluta'):'mind';

export function adaptarColeccionesV2(memoria) {
  const tablas=join(memoria,'Tablas'), principal=join(tablas,'colecciones.jsonl'), carpeta=join(tablas,'colecciones');
  const archivos=new Map(); // '' = tabla principal; si no, nombre de la rama
  if(existsSync(principal)) archivos.set('',eventos(principal,'colecciones'));
  if(existsSync(carpeta)) for(const n of readdirSync(carpeta).filter(n=>n.endsWith('.jsonl')).sort()) {
    const r=n.slice(0,-6);
    if(!RAMA.test(r)) throw Error('Rama con nombre no admitido: colecciones/'+n);
    archivos.set(r,eventos(join(carpeta,n),'colecciones/'+r));
  }
  if(!archivos.size) return {archivos:new Map(),pendientes:[]};
  const actuales=new Map([...archivos].map(([r,evs])=>[r,ultimos(evs)]));

  // Quién abrió cada rama: la única fila (vigente si la hay) que la declara.
  const declarantes=new Map();
  for(const [r,filas] of actuales) for(const f of filas.values()) if(f.rama) { if(!declarantes.has(f.rama)) declarantes.set(f.rama,[]); declarantes.get(f.rama).push({rama:r,fila:f}); }
  const padreDe=r=>{ const l=declarantes.get(r)??[], v=l.filter(x=>x.fila.vigencia==='vigente'), c=v.length?v:l; return c.length===1?c[0]:null; };
  const raizDe=r=>{ const vistos=new Set(); let x=padreDe(r); while(x&&x.rama!==''){ if(vistos.has(x.rama)) return null; vistos.add(x.rama); x=padreDe(x.rama); } return x; };

  // Dueño de cada colección raíz: el único proyecto al que apuntan sus conexiones (proyecto, o frente de ese proyecto).
  const proyectos=existsSync(join(tablas,'proyectos.jsonl'))?[...ultimos(eventos(join(tablas,'proyectos.jsonl'),'proyectos')).values()]:[];
  const duenoDe=f=>{
    const ids=new Set();
    for(const ref of lista(f.conectadoA)) {
      const porId=proyectos.find(p=>p.id===ref);
      if(porId?.tipo==='proyecto') ids.add(porId.id);
      else if(porId?.tipo==='frente'&&porId.proyecto) ids.add(porId.proyecto);
      else for(const p of proyectos.filter(p=>p.tipo==='proyecto'&&p.nombre===ref)) ids.add(p.id);
    }
    return [...ids];
  };
  const propiedad=new Map(); // id raíz → {proyecto, pendiente}
  const porProyecto=new Map();
  for(const f of (actuales.get('')??new Map()).values()) {
    const ids=duenoDe(f);
    const d=ids.length===1?{proyecto:ids[0],pendiente:''}:ids.length>1?{proyecto:'',pendiente:'asignar-proyecto: conectada a '+ids.join(', ')}:{proyecto:'',pendiente:''};
    propiedad.set(f.id,d);
    if(d.proyecto&&f.vigencia==='vigente') { if(!porProyecto.has(d.proyecto)) porProyecto.set(d.proyecto,[]); porProyecto.get(d.proyecto).push(f.id); }
  }
  // Un proyecto solo tiene una colección raíz: si varias apuntan al mismo, ninguna se asigna sola.
  for(const [p,ids] of porProyecto) if(ids.length>1) for(const id of ids) propiedad.set(id,{proyecto:'',pendiente:'asignar-proyecto: varias colecciones de '+p});

  const salida=new Map(), pendientes=[];
  for(const [r,evs] of archivos) {
    const enRama=r!=='', padre=enRama?padreDe(r):null, raiz=enRama?raizDe(r):null;
    const nuevas=evs.map(e=>{
      const f=e.fila, actual=actuales.get(r).get(f.id), extra={};
      if(enRama) {
        extra.clase=actual.rama?'subcoleccion':'elemento';
        extra.padre=padre?.fila.id??'';
        extra.coleccion=raiz?.fila.id??'';
        if(!padre||!raiz) extra.pendiente='sin-padre: rama '+r+' sin fila padre única';
      } else {
        extra.clase='coleccion';
        const d=propiedad.get(f.id);
        if(d.proyecto) extra.proyecto=d.proyecto;
        if(d.pendiente) extra.pendiente=d.pendiente;
      }
      if(typeof f.direccion==='string'&&f.direccion) extra.ubicacion=ubicacionV1(f.direccion,!enRama);
      const fila={...f};
      for(const [k,v] of Object.entries(extra)) if(!Object.hasOwn(fila,k)||fila[k]===undefined||fila[k]===null||fila[k]==='') if(v!=='') fila[k]=v;
      return {operacion:'poner',fila};
    });
    salida.set(r,nuevas.map(e=>e.fila));
    for(const f of ultimos(nuevas).values()) if(f.pendiente) pendientes.push({rama:r||null,id:f.id,nombre:f.nombre,pendiente:f.pendiente});
    atomico(enRama?join(carpeta,r+'.jsonl'):principal,nuevas.map(e=>JSON.stringify(e)+'\n').join(''));
  }
  return {archivos:salida,pendientes};
}

// Comprueba que la adaptación solo agregó columnas permitidas: mismos eventos, mismo orden, mismos IDs y valores.
export function comprobarSoloAgrega(antes,despues,etiqueta) {
  if(antes.length!==despues.length) throw Error('No se conserva el número de eventos en '+etiqueta);
  antes.forEach((a,i)=>{
    const d=despues[i];
    if(a.id!==d.id) throw Error('Cambió el orden o el ID de un evento en '+etiqueta);
    for(const [k,v] of Object.entries(a)) if(JSON.stringify(d[k])!==JSON.stringify(v)) throw Error(`Cambió el valor ${k} de ${a.id} en ${etiqueta}`);
    for(const k of Object.keys(d)) if(!Object.hasOwn(a,k)&&!NUEVAS_V2.includes(k)) throw Error(`Columna no prevista ${k} en ${etiqueta}`);
  });
}
