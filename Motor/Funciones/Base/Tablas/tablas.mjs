import { mkdirSync, existsSync, readFileSync, writeFileSync, openSync, closeSync, fsyncSync, writeSync, renameSync, unlinkSync, lstatSync, readdirSync, fstatSync, readSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { hostname } from 'node:os';
export { adaptarEsqueleto } from '../Adaptar/migrar.mjs';

// JSONL es el registro durable; CSV y Markdown se reconstruyen desde él.
export const ESQUEMA = Object.freeze({
  perfil: ['id','tipo','faceta','perteneceA','afirmacion','origen','fuente','evidencia','limites','contradicciones','fecha','vigencia'],
  proyectos: ['id','tipo','nombre','proyecto','perteneceA','descripcion','turno','loQueSigue','estado','elementosUsados','fecha','vigencia'],
  decisiones: ['id','tipo','proyecto','condicion','decision','alcance','origen','limite','estado','fecha','vigencia'],
  colecciones: ['id','clase','nombre','descripcion','proyecto','padre','coleccion','ubicacion','direccion','disponibilidad','comprobado','tamano','modificado','conectadoA','dueno','patron','rama','pendiente','fecha','vigencia'],
  conceptos: ['id','concepto','sintesis','tema','perteneceA','conectadoA','fuente','rama','fecha','vigencia'],
});
// Esquema 3: Colecciones agrega «tamano» (bytes) y «modificado» (fecha ISO) para los elementos de archivo.
export const VERSION = 3;
// Un frente puede registrar hasta este número de elementos usados; desde el aviso conviene referenciar una subcolección.
export const USOS = Object.freeze({aviso:100,tope:200});
// Colecciones (esquema 2). Una colección raíz vive en la tabla principal y pertenece a un proyecto («proyecto»)
// o a la persona (sin proyecto); sus subcolecciones y elementos viven en su rama. «conectadoA» son conexiones
// y reutilización, nunca propiedad. Los elementos no copian la propiedad: la heredan de su colección («coleccion»).
export const CLASES = Object.freeze(['coleccion','subcoleccion','elemento']);
// Raíz: local o sincronizada (ruta absoluta en disco), mind (relativa a Memoria) o enlace (URL o identificador «esquema:valor»).
// Hijos: relativa (a la raíz de su colección), absoluta, mind (relativa a Memoria, heredada del esquema 1) o enlace.
// Un enlace nunca se suma a una ruta local.
export const UBICACIONES = Object.freeze({coleccion:Object.freeze(['local','sincronizada','mind','enlace']),hijo:Object.freeze(['relativa','absoluta','mind','enlace'])});
export const DISPONIBILIDADES = Object.freeze(['disponible','ausente','sin-acceso','no-comprobada']);
export const esEnlace = d => typeof d==='string' && /^[a-z][a-z0-9+.-]+:\S+$/i.test(d);
export const esAbsoluta = d => typeof d==='string' && (/^[a-z]:[\\/]/i.test(d) || /^[\\/]{2}[^\\/]/.test(d) || /^\/(?![\\/])/.test(d));
export const esRelativaSegura = d => typeof d==='string' && d.trim()!=='' && !esEnlace(d) && !esAbsoluta(d) && !/^[a-z]:/i.test(d) && !/^[\\/]/.test(d) && !d.split(/[\\/]/).some(s=>s==='..');
const ARREGLOS = ['conectadoA','elementosUsados'];
const REFERENCIA = /^[^\s/]+\/[^\s/]+$/;
// Las cadenas de dev.12 siguen siendo legibles; cada escritura nueva guarda el contrato estructurado.
function referencia(ref) {
  if(typeof ref==='string'&&REFERENCIA.test(ref)) { const [coleccion,elemento]=ref.split('/'); return {coleccion,elemento}; }
  if(ref&&typeof ref==='object'&&!Array.isArray(ref)&&Object.keys(ref).length===2&&
    typeof ref.coleccion==='string'&&typeof ref.elemento==='string'&&REFERENCIA.test(ref.coleccion+'/'+ref.elemento)) return {coleccion:ref.coleccion,elemento:ref.elemento};
  throw new Error('Referencia inválida: se requiere {coleccion, elemento}');
}
const claveReferencia = ref => { const r=referencia(ref); return r.coleccion+'/'+r.elemento; };
const PEDIDO = /^[A-Za-z0-9._:-]{1,120}$/;
// Completa clase y ubicación que no se indicaron, sin tocar lo indicado: la regla del esquema 2 para altas nuevas.
export function completarColeccion(f,enRama) {
  const r={...f}, vacio=v=>v===undefined||v===null||v==='';
  if(vacio(r.clase)) r.clase=enRama?(r.rama?'subcoleccion':'elemento'):'coleccion';
  if(vacio(r.ubicacion)&&typeof r.direccion==='string'&&r.direccion) r.ubicacion=esEnlace(r.direccion)?'enlace':r.clase==='coleccion'?(esAbsoluta(r.direccion)?'local':'mind'):(esAbsoluta(r.direccion)?'absoluta':'relativa');
  return r;
}
export const idDePedido = (tk,idPedido) => 'p-'+createHash('sha256').update(tk+':'+idPedido).digest('hex').slice(0,24);
// Nombre legible y estable de la rama que abre una fila; «largo» amplía el sufijo si el corto ya está ocupado.
export function nombreRama(t,ramaPadre,idPadre,nombre,largo=6) {
  const base=String(nombre||'rama').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40)||'rama';
  return base+'-'+createHash('sha256').update(t+'|'+(ramaPadre??'')+'|'+idPadre).digest('hex').slice(0,largo);
}
// Índices por niveles: una fila de estas tablas puede apuntar (columna «rama») a una tabla hija en su propio archivo,
// Tablas/<tabla>/<rama>.jsonl. Así ninguna tabla acumula miles de filas y el agente baja solo por la rama que necesita.
export const RAMIFICABLES = Object.freeze(['colecciones','conceptos']);
export const FILAS_POR_TABLA = 100;
const RAMA = /^[a-z0-9][a-z0-9-]{0,63}$/;
const TITULOS = Object.freeze({decisiones:'Decisiones',colecciones:'Colecciones',conceptos:'Conceptos'});
const ETIQUETAS = Object.freeze({id:'ID',tipo:'Tipo',faceta:'Faceta',perteneceA:'Pertenece a',afirmacion:'Afirmación',origen:'Origen',fuente:'Fuente',evidencia:'Evidencia',limites:'Límites',contradicciones:'Contradicciones',fecha:'Fecha',vigencia:'Vigencia',nombre:'Nombre',proyecto:'Proyecto',descripcion:'Descripción',turno:'Turno',loQueSigue:'Lo que sigue',estado:'Estado',condicion:'Condición',decision:'Decisión',alcance:'Alcance',limite:'Límite',direccion:'Dirección',conectadoA:'Conectado a',dueno:'Dueño',patron:'Patrón',concepto:'Concepto',sintesis:'Síntesis',tema:'Tema',rama:'Rama',clase:'Clase',padre:'Padre',coleccion:'Colección',ubicacion:'Ubicación',disponibilidad:'Disponibilidad',comprobado:'Comprobado',pendiente:'Pendiente',elementosUsados:'Elementos usados',tamano:'Tamaño',modificado:'Modificado'});
// Presupuesto de arranque (tokens estimados = caracteres / 4): Mind solo (Bienvenida) y Mind + Inicio.md.
export const LIMITES = Object.freeze({ mind: 1000, total: 2000 });
const BIENVENIDA = fileURLToPath(new URL('../../../../Bienvenida.md', import.meta.url));
const tokensBienvenida = () => existsSync(BIENVENIDA) ? Math.ceil(readFileSync(BIENVENIDA, 'utf8').length / 4) : 0;
const textoValor = v => Array.isArray(v)?v.map(x=>x&&typeof x==='object'?JSON.stringify(x):x).join(', '):v??'';
const celda = v => String(textoValor(v)).replace(/[\r\n]+/g,' ').replace(/\|/g,'\\|').replace(/\[/g,'&#91;').replace(/\]/g,'&#93;');
const csv = v => '"' + String(Array.isArray(v) ? JSON.stringify(v) : v ?? '').replace(/"/g,'""') + '"';
const celdaVista = v => celda(String(textoValor(v)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'));
const textoCsv = (t,filas) => '\ufeff'+[ESQUEMA[t].map(csv).join(','),...filas.map(f=>ESQUEMA[t].map(k=>csv(f[k])).join(','))].join('\r\n')+'\r\n';
function lineasTabla(titulo,t,filas) {
  const columnas=[...ESQUEMA[t].filter(k=>!['id','fecha'].includes(k)),'id','fecha'];
  return ['# Tabla de '+titulo,'',`${filas.length} registros · ${filas.filter(f=>f.vigencia==='vigente').length} vigentes`,'','Vista generada desde la tabla. Para corregir datos, pide el cambio a Mind.','',
    '| '+columnas.map(k=>ETIQUETAS[k]).join(' | ')+' |','| '+columnas.map(()=>'---').join(' | ')+' |',
    ...filas.map(f=>'| '+columnas.map(k=>celdaVista(f[k])).join(' | ')+' |')];
}
function seguro(ruta) {
  let p = resolve(ruta);
  while (true) {
    // Un solo lstat sin excepción si no existe: otro proceso puede soltar el candado entre comprobar y leer.
    if (lstatSync(p, {throwIfNoEntry:false})?.isSymbolicLink()) throw new Error('No se permiten enlaces en la Memoria');
    const padre = dirname(p); if (padre === p) break; p = padre;
  }
  return ruta;
}
export function atomico(ruta, texto) {
  seguro(ruta); mkdirSync(dirname(ruta), {recursive:true});
  const temp = ruta + '.' + randomUUID() + '.tmp';
  const fd = openSync(temp,'wx');
  try { writeFileSync(fd,texto,'utf8'); fsyncSync(fd); } finally { closeSync(fd); }
  // En Windows, reemplazar un archivo que otro proceso está leyendo falla un instante (EPERM/EACCES/EBUSY): se reintenta ~2 s.
  for(let i=0;;i++) {
    try { renameSync(temp,ruta); return; }
    catch(e) {
      if(!['EPERM','EACCES','EBUSY'].includes(e.code)||i>=25) { try { unlinkSync(temp); } catch {} throw e; }
      Atomics.wait(ESPERA,0,0,Math.min(5*2**i,100));
    }
  }
}
const ESPERA=new Int32Array(new SharedArrayBuffer(4));
export function abrirTablas(memoria) {
  const raiz = seguro(resolve(memoria));
  const ruta = (t, rama) => {
    if (!Object.hasOwn(ESQUEMA,t)) throw new Error('Tabla desconocida');
    const sinRama = rama === undefined || rama === null || rama === '', k = t+'/'+(sinRama?'':rama);
    if (!sinRama && !RAMIFICABLES.includes(t)) throw new Error('La tabla '+t+' no admite ramas');
    if (!sinRama && (typeof rama !== 'string' || !RAMA.test(rama))) throw new Error('Rama inválida');
    // Con el candado tomado, cada ruta se comprueba contra enlaces una sola vez por sesión.
    if (sesion?.rutas.has(k)) return sesion.rutas.get(k);
    const p = seguro(sinRama?join(raiz,'Tablas',t+'.jsonl'):join(raiz,'Tablas',t,rama+'.jsonl'));
    sesion?.rutas.set(k,p);
    return p;
  };
  // Con el candado tomado nadie más escribe: la sesión recuerda lo leído y lo actualiza en cada escritura propia.
  const ramas = t => {
    if(sesion?.ramas.has(t)) return [...sesion.ramas.get(t)];
    const d=join(raiz,'Tablas',t), lista=RAMIFICABLES.includes(t)&&existsSync(d)?readdirSync(d).filter(n=>n.endsWith('.jsonl')).map(n=>n.slice(0,-6)).filter(n=>RAMA.test(n)).sort():[];
    sesion?.ramas.set(t,lista);
    return [...lista];
  };
  function cargar(t,rama) {
    // La adaptación toma el mismo candado de escritura: dentro de una sesión ya se comprobó al entrar.
    if(!sesion&&existsSync(join(raiz,'.adaptacion.lock'))) throw new Error('Memoria en adaptación; reintentar');
    const p=ruta(t,rama), enSesion=sesion?.cache.get(p);
    if(enSesion) return enSesion;
    const filas=new Map();
    for(const f of existsSync(p)?leerEventos(t,p):[]) filas.set(f.id,f);
    sesion?.cache.set(p,filas);
    return filas;
  }
  function leer(t, {historia=false,rama}={}) {
    if(!historia) return [...cargar(t,rama).values()];
    if(existsSync(join(raiz,'.adaptacion.lock'))) throw new Error('Memoria en adaptación; reintentar');
    const p = ruta(t,rama); return existsSync(p)?leerEventos(t,p):[];
  }
  function leerEventos(t,p) {
    const texto = readFileSync(p,'utf8'), eventos = [];
    const lineas = texto.split('\n');
    for (let i=0;i<lineas.length;i++) {
      const l = lineas[i]; if (!l.trim()) continue;
      let e; try { e = JSON.parse(l); } catch { throw new Error(`Registro incompleto o dañado: ${t}, línea ${i+1}; conservar y reparar antes de escribir`); }
      if (e.operacion !== 'poner' || !e.fila || typeof e.fila.id !== 'string') throw new Error('Evento inválido');
      validar(t,e.fila); eventos.push(e.fila);
    }
    return eventos;
  }
  function validar(t,f) {
    for (const k of Object.keys(f)) if (!ESQUEMA[t].includes(k)) throw new Error('Columna no permitida: '+k);
    if (!f.id || !f.fecha || !Number.isFinite(Date.parse(f.fecha))) throw new Error('Faltan ID o fecha ISO');
    if (!['vigente','reemplazada'].includes(f.vigencia)) throw new Error('Vigencia inválida');
    for (const [k,v] of Object.entries(f)) if (v !== null && typeof v !== 'string' && !(ARREGLOS.includes(k) && Array.isArray(v) && (k==='elementosUsados'||v.every(x=>typeof x==='string')))) throw new Error('Valor inválido: '+k);
    if (t==='perfil' && !['faceta','entrada'].includes(f.tipo)) throw new Error('Tipo de Perfil inválido');
    if (t==='perfil' && f.tipo==='entrada' && (!f.afirmacion || !['dijo','hizo','interpreta'].includes(f.origen))) throw new Error('Falta afirmación u origen válido');
    if (t==='perfil' && !f.faceta) throw new Error('Falta faceta');
    if (t==='proyectos' && (!['proyecto','frente'].includes(f.tipo) || !f.nombre || !['activo','pausado','terminado'].includes(f.estado))) throw new Error('Proyecto/frente inválido');
    if (t==='decisiones' && (!f.decision || !f.proyecto || !['propuesta','confirmada','corregida'].includes(f.estado))) throw new Error('Decisión inválida');
    if (t==='colecciones') {
      if (!f.nombre || !f.direccion) throw new Error('Colección sin nombre o dirección');
      if (f.clase && !CLASES.includes(f.clase)) throw new Error('Clase de colección inválida');
      if (f.ubicacion) {
        if (!(f.clase==='coleccion'||!f.clase?UBICACIONES.coleccion:UBICACIONES.hijo).includes(f.ubicacion)) throw new Error('Ubicación inválida para '+(f.clase||'coleccion')+': '+f.ubicacion);
        const d=f.direccion, valida=['local','sincronizada','absoluta'].includes(f.ubicacion)?esAbsoluta(d):f.ubicacion==='enlace'?esEnlace(d)&&!esAbsoluta(d):esRelativaSegura(d);
        if (!valida) throw new Error('Dirección incompatible con la ubicación '+f.ubicacion);
      }
      if (f.disponibilidad && !DISPONIBILIDADES.includes(f.disponibilidad)) throw new Error('Disponibilidad inválida');
      if (f.comprobado && !Number.isFinite(Date.parse(f.comprobado))) throw new Error('Fecha de comprobación inválida');
      if (f.tamano && !/^\d{1,16}$/.test(f.tamano)) throw new Error('Tamaño inválido: bytes en números');
      if (f.modificado && !Number.isFinite(Date.parse(f.modificado))) throw new Error('Fecha de modificación inválida');
      if ((f.tamano || f.modificado) && f.clase && f.clase!=='elemento') throw new Error('Tamaño y fecha de modificación son de elementos de archivo');
    }
    if (t==='proyectos' && f.elementosUsados !== undefined && f.elementosUsados !== null) {
      if (!Array.isArray(f.elementosUsados)) throw new Error('elementosUsados admite solo referencias {coleccion, elemento}');
      const referencias=f.elementosUsados.map(claveReferencia);
      if (f.elementosUsados.length && f.tipo!=='frente') throw new Error('Solo un frente registra elementos usados');
      if (new Set(referencias).size!==referencias.length) throw new Error('Referencia repetida en elementosUsados');
    }
    if (t==='conceptos' && (!f.concepto || !f.tema)) throw new Error('Concepto sin nombre o tema');
    if (f.rama !== undefined && f.rama !== null && f.rama !== '' && !RAMA.test(f.rama)) throw new Error('Rama inválida');
  }
  // Sesión de escritura de este proceso: el candado es reentrante para que una operación compuesta
  // agrupe varias escrituras sin soltarlo, y la proyección puede diferirse hasta el final.
  let sesion=null;
  const pCandado=()=>seguro(join(raiz,'.escritura.lock'));
  // El candado guarda quién lo tomó. Si ese proceso ya no existe, se informa; nunca se retira solo.
  function candadoHuerfano() {
    try {
      const d=JSON.parse(readFileSync(pCandado(),'utf8'));
      if(!Number.isInteger(d.pid)||d.host!==hostname()) return null;
      try { process.kill(d.pid,0); return null; } catch(e) { return e.code==='ESRCH'?d:null; }
    } catch { return null; }
  }
  function exclusivo(fn) {
    if(existsSync(join(raiz,'..','Motor','.actualizando.lock'))) throw new Error('Memoria ocupada: Motor en actualización; reintentar al terminar');
    if(sesion) return fn();
    if(existsSync(join(raiz,'.adaptacion.lock'))) throw new Error('Memoria en adaptación; reintentar');
    seguro(raiz); mkdirSync(raiz,{recursive:true});
    if(existsSync(join(raiz,'Tablas','.escritura.lock'))) throw new Error('Memoria ocupada; reintentar sin retirar el candado');
    const p=pCandado(); let fd;
    try { fd=openSync(p,'wx'); } catch {
      const h=candadoHuerfano();
      throw new Error(h?`Memoria ocupada por un proceso que ya no existe (pid ${h.pid}, desde ${h.inicio}); la persona puede liberar el candado con la acción liberar`:'Memoria ocupada; reintentar sin retirar el candado');
    }
    try {
      writeSync(fd,JSON.stringify({pid:process.pid,host:hostname(),inicio:new Date().toISOString()}),null,'utf8');
      // version.json se lee con el candado tomado: otro escritor puede estar creándolo (temporal + renombrar).
      const version=join(raiz,'version.json');
      if(existsSync(version) && JSON.parse(readFileSync(version,'utf8')).memoria!==VERSION) throw new Error('Versión de Memoria incompatible; requiere adaptación');
      sesion={diferir:false,tocadas:new Set(),padres:new Map(),escritos:null,cache:new Map(),ramas:new Map(),rutas:new Map()};
      return fn();
    } finally { sesion=null; closeSync(fd); unlinkSync(p); }
  }
  function proyectar({ramas:conRamas=false}={}) {
    const marca='<!-- mind:vista-derivada -->\n', avisos=[], errores=[];
    const esVistaPropia=p=>existsSync(p)&&lstatSync(p).isFile()&&readFileSync(p,'utf8').startsWith(marca);
    const cache=new Map();
    for (const t of Object.keys(ESQUEMA)) {
      const pCsv=seguro(join(raiz,'Tablas',t+'.csv'));
      try {
        const hist=existsSync(ruta(t))?leer(t,{historia:true}):[];
        if (hist.length>0) {
          const filas=leer(t); cache.set(t,filas);
          atomico(pCsv,textoCsv(t,filas));
        } else { cache.set(t,[]); if (existsSync(pCsv)) unlinkSync(pCsv); }
      } catch (e) { errores.push(e); }
    }
    for (const obsoleto of ['Tablas de la Memoria.md','Perfil.md','Proyectos.md','Decisiones.md','Colecciones.md','Conceptos.md']) {
      const p=seguro(join(raiz,'Tablas',obsoleto));
      if(esVistaPropia(p)) unlinkSync(p);
    }
    const tiene=t=>cache.has(t)&&cache.get(t).length>0;
    const vigentes=t=>(cache.get(t)??[]).filter(f=>f.vigencia==='vigente');
    const perfil=vigentes('perfil'), proyectos=vigentes('proyectos'), decisiones=vigentes('decisiones');
    const enlace=(ruta,nombre)=>`[[Memoria/Vistas/${ruta}|${celda(nombre)}]]`;
    // Nombres legibles; el ID permanece en Tablas. Solo se añade sufijo si dos nombres colisionan.
    const archivo=(tipo,id)=>{
      const fila=(tipo==='faceta'?perfil:proyectos).find(f=>f.id===id);
      const limpiar=s=>String(s).normalize('NFKC').replace(/[<>:"/\\|?*\x00-\x1f\[\]#^]/g,'-').replace(/[. ]+$/g,'').slice(0,80).trim()||'Sin nombre';
      const nombre=f=>limpiar(f?.nombre??f?.faceta??tipo);
      const base=f=>f?.tipo==='frente'?limpiar(proyectos.find(p=>p.id===f?.proyecto)?.nombre||'General')+' - '+nombre(f):nombre(f);
      const lista=tipo==='faceta'?perfil.filter(f=>f.tipo==='faceta'):proyectos;
      const repetidos=lista.filter(f=>base(f).toLocaleLowerCase('es')===base(fila).toLocaleLowerCase('es')).length>1;
      const limpio=base(fila), reservado=/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(limpio);
      return (reservado?'_':'')+limpio+(repetidos?' ('+createHash('sha256').update(id).digest('hex').slice(0,8)+')':'')+'.md';
    };
    const nodo=(carpeta,tipo,f,nombre)=>enlace(carpeta+'/'+archivo(tipo,f.id).slice(0,-3),nombre);
    function publicar(carpeta,archivos) {
      const dir=seguro(join(raiz,'Vistas',carpeta));
      if(archivos.size) mkdirSync(dir,{recursive:true});
      for(const [nombre,texto] of archivos) {
        const p=seguro(join(dir,nombre));
        if(existsSync(p)&&!esVistaPropia(p)) { avisos.push(`Colisión sin marca en Vistas/${carpeta}/${nombre}; archivo ajeno conservado`); continue; }
        atomico(p,marca+texto+'\n');
      }
      if(!existsSync(dir)) return;
      for(const nombre of readdirSync(dir)) {
        if(archivos.has(nombre)||!nombre.endsWith('.md')) continue;
        const p=seguro(join(dir,nombre));
        if(esVistaPropia(p)) unlinkSync(p);
        else if(lstatSync(p).isFile()) avisos.push(`Colisión sin marca en Vistas/${carpeta}/${nombre}; archivo ajeno conservado`);
      }
    }
    const ponerVista=(nombre,lineas)=>{
      const p=seguro(join(raiz,'Vistas',nombre));
      if(existsSync(p)&&!esVistaPropia(p)) { avisos.push(`Colisión sin marca en Vistas/${nombre}; archivo ajeno conservado`); return; }
      atomico(p,marca+lineas.join('\n')+'\n');
    };
    const quitarVista=nombre=>{
      const p=seguro(join(raiz,'Vistas',nombre));
      if(!existsSync(p)) return;
      if(esVistaPropia(p)) unlinkSync(p);
      else if(lstatSync(p).isFile()) avisos.push(`Colisión sin marca en Vistas/${nombre}; archivo ajeno conservado`);
    };
    for(const [t,titulo] of [['decisiones','Decisiones'],['colecciones','Colecciones'],['conceptos','Conceptos']]) {
      if(!cache.has(t)) continue;
      if(!tiene(t)) { quitarVista(titulo+'.md'); continue; }
      ponerVista(titulo+'.md',lineasTabla(titulo,t,cache.get(t)));
    }
    // Regeneración completa: también cada rama, y se retiran vistas de ramas que ya no existen.
    if(conRamas) for(const t of RAMIFICABLES) {
      const vivas=new Set(ramas(t));
      for(const r of vivas) avisos.push(...proyectarRama(t,r).avisos);
      const dir=seguro(join(raiz,'Vistas',TITULOS[t]));
      if(existsSync(dir)) for(const n of readdirSync(dir)) if(n.endsWith('.md')&&!vivas.has(n.slice(0,-3))) quitarVista(TITULOS[t]+'/'+n);
    }
    const recurso=x=>{
      if(!x.direccion)return celda(x.nombre)+' — sin ubicación registrada';
      const u=x.ubicacion||(esAbsoluta(x.direccion)?'local':'mind');
      const destino=u==='enlace'?x.direccion:pathToFileURL(u==='mind'?join(raiz,x.direccion):x.direccion).href;
      return '['+celda(x.nombre)+']('+String(destino).replace(/\(/g,'%28').replace(/\)/g,'%29')+')';
    };
    let secControlador=null, secPerfil=null, secReglas=null, idxProyectos=null, idxPerfil=null;
    const disponibles=proyectos.filter(f=>f.estado!=='terminado');
    const padres=disponibles.filter(f=>f.tipo==='proyecto'&&f.estado==='activo');
    const frentesTodos=disponibles.filter(f=>f.tipo==='frente');
    const padreDe=f=>{
      if(!f.perteneceA) return null;
      const candidatos=frentesTodos.filter(p=>p.proyecto===f.proyecto && (p.id===f.perteneceA||p.nombre===f.perteneceA));
      return candidatos.find(p=>p.id===f.perteneceA) ?? (candidatos.length===1?candidatos[0]:undefined);
    };
    function alcanzable(f) {
      const vistos=new Set();
      while(f) { if(vistos.has(f.id)) return false; vistos.add(f.id); if(!f.perteneceA) return true; f=padreDe(f); if(!f) return false; }
      return false;
    }
    const frentes=frentesTodos.filter(f=>padres.some(p=>p.id===f.proyecto)&&alcanzable(f));
    if(cache.has('proyectos')) {
      const vistasProyectos=new Map();
      if(tiene('proyectos')) {
        for(const p of padres) {
          const hijos=frentes.filter(f=>f.proyecto===p.id&&!f.perteneceA);
          const decisionesPropias=decisiones.filter(d=>(d.proyecto===p.id||d.proyecto===p.nombre)&&['confirmada','corregida'].includes(d.estado));
          vistasProyectos.set(archivo('proyecto',p.id),['# '+celda(p.nombre),'',celda(p.descripcion),'','## Decisiones','',...decisionesPropias.map(d=>'- '+celda(d.decision)+(d.condicion?' · Cuando: '+celda(d.condicion):'')+(d.alcance?' · Alcance: '+celda(d.alcance):'')+(d.limite?' · Volver a consultar: '+celda(d.limite):'')),'','## Frentes','',...hijos.map(f=>'- '+nodo('Proyectos','frente',f,f.nombre))].join('\n'));
        }
        // Elementos usados: el localizador sale de los datos (raíz + dirección) y el estado es el último registrado.
        // La ficha no consulta el disco; el estado actual lo da la acción coleccion resolver o uso con comprobar.
        let indiceUsos=null;
        const usoDe=r=>{
          if(!indiceUsos) { indiceUsos=new Map(); try { for(const x of ramas('colecciones')) for(const e of leer('colecciones',{rama:x})) if(e.vigencia==='vigente') indiceUsos.set(e.id,e); } catch(e) { avisos.push('Elementos usados: no se pudo leer el índice ('+e.message+')'); } }
          const raizC=vigentes('colecciones').find(x=>x.id===r.coleccion&&x.clase==='coleccion'), el=indiceUsos.get(r.elemento);
          return raizC&&el&&el.coleccion===r.coleccion?{raiz:raizC,elemento:el}:null;
        };
        function lineasUsos(f,p,tope) {
          let usos; try { usos=(f.elementosUsados??[]).map(referencia); } catch { usos=[]; }
          if(!usos.length) return [];
          return ['## Elementos usados','',...usos.slice(0,tope).map(r=>{
            const u=usoDe(r);
            if(!u) return '- '+celda(r.coleccion+'/'+r.elemento)+' — referencia no disponible (retirada o inexistente)';
            return '- '+celda(u.elemento.nombre)+' — '+celda(localizarUso(u.raiz,u.elemento))+' · '+celda(u.elemento.disponibilidad||'no-comprobada')+(u.raiz.proyecto!==p?.id?' · de '+celda(u.raiz.nombre):'');
          }),...(usos.length>tope?[`- …y ${usos.length-tope} más: consúltalos con la acción uso (operacion consultar).`]:[]),''];
        }
        // Ficha del frente: con una sola lectura el agente sabe qué es, qué decidió el proyecto y qué índices traer.
        const conectado=(x,claves)=>(Array.isArray(x.conectadoA)?x.conectadoA:[x.conectadoA]).some(c=>claves.has(c));
        for(const f of frentes) {
          const p=padres.find(x=>x.id===f.proyecto), claves=new Set([f.id,p?.id,p?.nombre].filter(Boolean));
          const decis=decisiones.filter(d=>(d.proyecto===p?.id||d.proyecto===p?.nombre)&&['confirmada','corregida'].includes(d.estado));
          // Primero la colección propia del proyecto; después las conectadas al frente o al proyecto.
          const propia=x=>Boolean(p)&&x.clase==='coleccion'&&x.proyecto===p.id;
          const cols=vigentes('colecciones').filter(x=>propia(x)||conectado(x,claves)).sort((a,b)=>propia(b)-propia(a)), cons=vigentes('conceptos').filter(x=>conectado(x,claves));
          const tope=8, mas=(lista,etiqueta)=>lista.length>tope?[`- …y ${lista.length-tope} ${etiqueta} más: búscalos con conectadoA.`]:[];
          const rama=x=>(x.ubicacion?' · '+celda(x.ubicacion):'')+(x.rama?' · rama: '+celda(x.rama):'');
          vistasProyectos.set(archivo('frente',f.id),['# '+celda(f.nombre),'','Proyecto: '+celda(p?.nombre),'Estado: '+celda(f.estado),'Turno: '+celda(f.turno),'Lo que sigue: '+celda(f.loQueSigue),'',celda(f.descripcion),'',
            '## Del proyecto','',celda(p?.descripcion),...decis.slice(0,5).map(d=>'- '+celda(d.decision)+(d.condicion?' · Cuando: '+celda(d.condicion):'')),...(decis.length>5?[`- …y ${decis.length-5} decisiones más en la vista del proyecto.`]:[]),'',
            '## Para trabajar','',...cols.slice(0,tope).map(x=>'- '+recurso(x)),...mas(cols,'colecciones'),
            ...cons.slice(0,tope).map(x=>'- Concepto: '+celda(x.concepto)+' — '+celda(x.tema)+rama(x)),...mas(cons,'conceptos'),
            ...(cols.length||cons.length?[]:['- Aún no hay índices conectados a este frente o a su proyecto.']),
            '<details>','<summary>Datos de consulta</summary>','','ID: '+celda(f.id),'Para ver más: buscar en colecciones o conceptos con conectadoA = '+celda(f.id)+' o '+celda(p?.id)+'; si una fila trae rama, busca dentro de ella.',...cols.map(x=>'- '+(propia(x)?'Colección del proyecto':'Colección')+': '+celda(x.nombre)+' — '+celda(x.direccion)+rama(x)),'','</details>','',
            ...lineasUsos(f,p,tope),
            '## Subfrentes','',...frentes.filter(h=>padreDe(h)?.id===f.id).map(h=>'- '+nodo('Proyectos','frente',h,h.nombre))].join('\n'));
        }
      }
      publicar('Proyectos',vistasProyectos);
      if(tiene('proyectos')) {
        const nombres=new Map(padres.filter(p=>p.estado==='activo').map(p=>[p.id,p.nombre]));
        const activos=frentes.filter(f=>f.estado==='activo'&&nombres.has(f.proyecto));
        activos.sort((a,b)=>{const x=nombres.get(a.proyecto),y=nombres.get(b.proyecto);return x===y?a.nombre.localeCompare(b.nombre,'es'):x==='General'?-1:y==='General'?1:x.localeCompare(y,'es');});
        // Inicio se lee en cada arranque: nombres sin rutas. Los enlaces a cada ficha viven en Índice.md, que no se lee al arrancar.
        const sinFrentes=padres.filter(p=>p.estado==='activo'&&!activos.some(f=>f.proyecto===p.id));
        const filas=activos.map(f=>`| ${celda(nombres.get(f.proyecto))} | ${celda(f.nombre)} | ${celda(f.turno)} | ${celda(f.loQueSigue)} |`);
        for(const p of sinFrentes) filas.push(`| ${celda(p.nombre)} | | | |`);
        secControlador=['## Controlador','','| Proyecto | Frente | Turno | Lo que sigue |','|---|---|---|---|',...filas];
        idxProyectos=['## Proyectos','',...activos.flatMap((f,i)=>[...(i&&activos[i-1].proyecto===f.proyecto?[]:['- '+nodo('Proyectos','proyecto',{id:f.proyecto},nombres.get(f.proyecto))]),'  - '+nodo('Proyectos','frente',f,f.nombre)]),...sinFrentes.map(p=>'- '+nodo('Proyectos','proyecto',p,p.nombre))];
      }
    }
    const facetas=perfil.filter(f=>f.tipo==='faceta');
    const facetaPadre=f=>{
      if(!f.perteneceA) return null;
      const candidatos=facetas.filter(p=>p.id===f.perteneceA||p.faceta===f.perteneceA);
      return candidatos.find(p=>p.id===f.perteneceA) ?? (candidatos.length===1?candidatos[0]:undefined);
    };
    const facetasVisibles=facetas.filter(f=>{const vistos=new Set();while(f){if(vistos.has(f.id))return false;vistos.add(f.id);if(!f.perteneceA)return true;f=facetaPadre(f);if(!f)return false;}return false;});
    if(cache.has('perfil')) {
      const vistasPerfil=new Map();
      if(tiene('perfil')) {
        for(const f of facetasVisibles) {
          const entradas=perfil.filter(e=>e.tipo==='entrada'&&(e.faceta===f.id||e.faceta===f.faceta));
          const detalle=entradas.map(e=>'- '+(e.origen==='interpreta'?'**Observación sin confirmar:** ':e.origen==='hizo'?'**Hecho observado:** ':'')+celda(e.afirmacion)+' · Origen: '+celda(e.origen)+' · Fecha: '+celda(e.fecha)+(e.fuente?' · Fuente: '+celda(e.fuente):'')+(e.evidencia?' · Evidencia: '+celda(e.evidencia):'')+(e.limites?' · Límites: '+celda(e.limites):'')+(e.contradicciones?' · Contradicciones: '+celda(e.contradicciones):''));
          const hijos=facetasVisibles.filter(h=>facetaPadre(h)?.id===f.id);
          vistasPerfil.set(archivo('faceta',f.id),['# '+celda(f.faceta),'',celda(f.afirmacion)||'Aún sin síntesis.',
            ...(detalle.length?['','<details>','<summary>Detalle y fuentes ('+detalle.length+' entradas)</summary>','',...detalle,'','</details>']:[]),
            ...(hijos.length?['','## Subfacetas','',...hijos.map(h=>'- '+nodo('Perfil','faceta',h,h.faceta))]:[])].join('\n'));
        }
      }
      publicar('Perfil',vistasPerfil);
      if(tiene('perfil')) {
        const raices=facetasVisibles.filter(f=>!f.perteneceA);
        const resumen=['## Perfil','',...raices.map(f=>'- '+celda(f.faceta)+': '+celda(f.afirmacion||'Sin resumen.'))];
        if(!raices.length) resumen.push('Sin facetas registradas.');
        secPerfil=resumen;
        if(raices.length) idxPerfil=['## Perfil','',...raices.map(f=>'- '+nodo('Perfil','faceta',f,f.faceta))];
      }
    }
    const reglas=[...decisiones.filter(f=>f.proyecto==='General'&&f.tipo==='regla-usuario'&&['confirmada','corregida'].includes(f.estado)).map(f=>'- '+celda(f.decision)+(f.condicion?' (Cuando: '+celda(f.condicion)+')':'')+(f.alcance?' · Alcance: '+celda(f.alcance):'')+(f.limite?' · Volver a consultar: '+celda(f.limite):''))];
    if(reglas.length) secReglas=['## Reglas del usuario','',...reglas];
    // Una sola vista de arranque: Reglas del usuario, Perfil y Controlador en Inicio.md.
    for(const anterior of ['Controlador.md','Resumen del Perfil.md','Reglas del usuario.md']) quitarVista(anterior);
    if(['perfil','proyectos','decisiones'].every(t=>cache.has(t))) {
      const desplegar=(titulo,lineas)=>lineas?['<details>','<summary>'+titulo+'</summary>','',...lineas,'','</details>']:null;
      const secciones=[desplegar('Reglas de trabajo',secReglas),desplegar('Perfil',secPerfil),secControlador].filter(Boolean),indice=[idxPerfil,idxProyectos].filter(Boolean);
      if(indice.length) ponerVista('Índice.md',['# Índice','','Consulta por dominio.','',...indice.flatMap(x=>[...x,''])]);
      else quitarVista('Índice.md');
      if(secciones.length) {
        const navegacion=[...(idxPerfil?[enlace('Perfil','Perfil')]:[]),...(padres.length?[enlace('Proyectos','Proyectos')]:[]),...(tiene('colecciones')?[enlace('Biblioteca','Biblioteca')]:[])];
        let lineas=['# Inicio','',...(navegacion.length?[navegacion.join(' · '),'']:[]),...(indice.length?['[[Memoria/Vistas/Índice|Índice]]','']:[]),...secciones.flatMap(x=>[...x,''])];
        const medir=ls=>Math.ceil((marca+ls.join('\n')+'\n').length/4)+tokensBienvenida();
        if(secControlador&&medir(lineas)>LIMITES.total){
          const activos=frentes.filter(f=>f.estado==='activo');
          const resumen=['## Controlador','',padres.length+' proyectos · '+activos.length+' frentes activos. Detalle y siguientes pasos en '+enlace('Proyectos','Proyectos')+'.','','| Proyecto | Frentes activos |','|---|---|',...padres.map(p=>'| '+nodo('Proyectos','proyecto',p,p.nombre)+' | '+activos.filter(f=>f.proyecto===p.id).length+' |')];
          const armar=control=>['# Inicio','',...(navegacion.length?[navegacion.join(' · '),'']:[]),...(indice.length?['[[Memoria/Vistas/Índice|Índice]]','']:[]),...secciones.slice(0,-1).flatMap(x=>[...x,'']),...control,''];
          lineas=armar(resumen);
          if(medir(lineas)>LIMITES.total)lineas=armar(resumen.slice(0,3));
        }
        ponerVista('Inicio.md',lineas);
        const tokens=Math.ceil((marca+lineas.join('\n')+'\n').length/4)+tokensBienvenida();
        if(tokens>LIMITES.total) avisos.push(`Arranque: Bienvenida + Inicio.md suman unos ${tokens} tokens y superan ${LIMITES.total}; conviene resumir con la persona.`);
      } else quitarVista('Inicio.md');
    }
    if(cache.has('perfil')) {
      if(idxPerfil) ponerVista('Perfil.md',['# Perfil','',...facetasVisibles.filter(f=>!f.perteneceA).map(f=>'- '+nodo('Perfil','faceta',f,f.faceta)+': '+celda(f.afirmacion||'Aún sin síntesis.'))]);
      else quitarVista('Perfil.md');
    }
    if(cache.has('proyectos')) {
      if(padres.length) ponerVista('Proyectos.md',['# Proyectos','',...padres.map(p=>'- '+nodo('Proyectos','proyecto',p,p.nombre))]);
      else quitarVista('Proyectos.md');
    }
    if(cache.has('colecciones')) {
      const colecciones=vigentes('colecciones').filter(c=>c.clase==='coleccion'&&c.direccion);
      if(colecciones.length) {
        const grupos=new Map();
        for(const c of colecciones) {
          const p=proyectos.find(p=>p.id===c.proyecto||p.nombre===c.proyecto);
          const vinculos=Array.isArray(c.conectadoA)?c.conectadoA:[c.conectadoA];
          const vinculado=proyectos.find(p=>p.tipo==='proyecto'&&vinculos.includes(p.id));
          const grupo=p?.nombre||vinculado?.nombre||'Personal y compartido';
          if(!grupos.has(grupo))grupos.set(grupo,[]);
          grupos.get(grupo).push('- '+recurso(c));
        }
        ponerVista('Biblioteca.md',['# Biblioteca','','Documentos y recursos completos; cada enlace abre su ubicación registrada.','',...[...grupos].flatMap(([nombre,filas])=>['## '+celda(nombre),'',...filas,''])]);
      } else quitarVista('Biblioteca.md');
    }
    if(errores.length) throw errores[0];
    return {regenerada:true,avisos};
  }

  // Localizador de un elemento a partir de sus datos: enlace tal cual, ruta absoluta, relativa a Memoria o a su colección.
  function localizarUso(raizC,el) {
    const u=el.ubicacion||(esEnlace(el.direccion)&&!esAbsoluta(el.direccion)?'enlace':esAbsoluta(el.direccion)?'absoluta':'relativa');
    if(u==='enlace'||u==='absoluta') return el.direccion;
    if(u==='mind') return join(raiz,el.direccion);
    const ur=raizC.ubicacion||(esEnlace(raizC.direccion)&&!esAbsoluta(raizC.direccion)?'enlace':esAbsoluta(raizC.direccion)?'local':'mind');
    if(ur==='enlace') return raizC.direccion+' · '+el.direccion;
    return join(ur==='mind'?join(raiz,raizC.direccion):raizC.direccion,...el.direccion.split(/[\\/]/));
  }
  // IDs de elementos que algún frente vigente usa: si cambian, su ficha se regenera aunque se escribiera solo una rama.
  function referenciados() {
    const ids=new Set();
    for(const f of leer('proyectos')) if(f.vigencia==='vigente'&&f.tipo==='frente'&&Array.isArray(f.elementosUsados)) for(const r of f.elementosUsados) { try { ids.add(referencia(r).elemento); } catch {} }
    return ids;
  }
  // Proyecta solo una rama: su CSV y su vista de consulta. Escribir en una rama no recorre las demás.
  function proyectarRama(t,rama) {
    const marca='<!-- mind:vista-derivada -->\n', avisos=[], filas=leer(t,{rama});
    atomico(seguro(join(raiz,'Tablas',t,rama+'.csv')),textoCsv(t,filas));
    const p=seguro(join(raiz,'Vistas',TITULOS[t],rama+'.md'));
    if(existsSync(p)&&!(lstatSync(p).isFile()&&readFileSync(p,'utf8').startsWith(marca))) avisos.push(`Colisión sin marca en Vistas/${TITULOS[t]}/${rama}.md; archivo ajeno conservado`);
    else atomico(p,marca+lineasTabla(TITULOS[t]+' · rama '+rama,t,filas).join('\n')+'\n');
    return {regenerada:true,avisos};
  }
  function avisoTamano(t,rama) {
    if(!RAMIFICABLES.includes(t)) return [];
    const n=leer(t,{rama}).filter(f=>f.vigencia==='vigente').length;
    return n>FILAS_POR_TABLA?[`${rama?'La rama '+rama+' de '+t:'La tabla '+t} tiene ${n} filas vigentes (más de ${FILAS_POR_TABLA}): conviene dividirla en ramas con abrirRama.`]:[];
  }
  const ramaReferida=(t,rama)=>[undefined,...ramas(t)].some(r=>leer(t,{rama:r}).some(f=>f.rama===rama&&f.vigencia==='vigente'));
  const autonomiaRamas=()=>leer('decisiones').some(d=>d.vigencia==='vigente'&&d.tipo==='autonomia'&&d.condicion==='ramas'&&['confirmada','corregida'].includes(d.estado)&&/^autom/i.test(d.decision||''));
  const clavePedido=(t,datos)=>createHash('sha256').update(JSON.stringify([t,Object.entries(datos??{}).filter(([k])=>!['id','fecha'].includes(k)).sort(([a],[b])=>a.localeCompare(b))])).digest('hex').slice(0,24);
  const igualCarga=(a,b)=>Object.entries(b??{}).filter(([k])=>!['id','fecha'].includes(k)).every(([k,v])=>{
    const normal=x=>k==='elementosUsados'&&Array.isArray(x)?x.map(referencia):x;
    return JSON.stringify(normal(a?.[k]))===JSON.stringify(normal(v));
  });
  function adjuntarRecibo(f,recibo) {
    Object.defineProperty(f,'recibo',{value:Object.freeze(recibo),enumerable:false,configurable:true});
    return f;
  }
  function errorConRecibo(e,recibo) {
    e.guardado=recibo.guardado; e.vistaPendiente=recibo.vistaPendiente; e.id=recibo.id??null;
    if(recibo.fila) e.fila=recibo.fila;
    e.recibo=Object.freeze(recibo);
    return e;
  }

  // Fila vigente que abrió una rama (en la tabla principal o en otra rama). Se recuerda durante la sesión de escritura.
  function padreDeRama(t,rama) {
    const k=t+'/'+rama;
    if(sesion?.padres.has(k)) return sesion.padres.get(k);
    const candidatos=[];
    for(const r of [undefined,...ramas(t)]) candidatos.push(...leer(t,{rama:r}).filter(x=>x.rama===rama&&x.vigencia==='vigente'));
    if(candidatos.length>1) throw new Error('Rama ambigua: más de un padre vigente en '+rama);
    const hallado=candidatos[0]??null;
    sesion?.padres.set(k,hallado);
    return hallado;
  }
  // Resuelve «coleccion/elemento»: la colección raíz vigente y un elemento vigente dentro de su árbol de ramas.
  function elementoDe(ref) {
    const {coleccion:c,elemento:e}=referencia(ref), col=leer('colecciones').find(x=>x.id===c);
    if(!col||col.clase!=='coleccion'||col.vigencia!=='vigente') throw new Error('Colección inexistente o retirada: '+c);
    // Cada rama se lee una sola vez por consulta; los padres de todas las ramas se reúnen en una pasada.
    const leidas=new Map(), leerR=r=>{ if(!leidas.has(r)) leidas.set(r,leer('colecciones',{rama:r})); return leidas.get(r); };
    let padres=null;
    const padreDe=r=>{
      if(sesion?.padres.has('colecciones/'+r)) return padreDeRama('colecciones',r);
      if(!padres) { padres=new Map(); for(const x of [undefined,...ramas('colecciones')]) for(const f of leerR(x)) if(f.rama&&f.vigencia==='vigente') padres.set(f.rama,[...(padres.get(f.rama)??[]),f]); }
      const lista=padres.get(r)??[]; if(lista.length>1) throw new Error('Rama ambigua: más de un padre vigente en '+r);
      return lista[0]??null;
    };
    // Un elemento movido de carpeta deja su versión retirada en la rama anterior: vale la vigente, esté donde esté.
    const vistas=new Set(), cola=col.rama?[{rama:col.rama,padre:col}]:[]; let retirado=false;
    while(cola.length) {
      const {rama:r,padre}=cola.shift(); if(vistas.has(r)) throw new Error('Ciclo entre ramas de la colección'); vistas.add(r);
      if(padreDe(r)?.id!==padre.id) throw new Error('Rama sin padre válido: '+r);
      for(const f of leerR(r)) {
        if(f.id===e&&f.vigencia!=='vigente') { retirado=true; continue; }
        if(f.id===e||f.rama&&f.vigencia==='vigente') {
          if(f.coleccion!==c||f.padre!==padre.id) throw new Error('Propiedad incompatible con la colección: '+c+'/'+f.id);
          if(f.id===e) return {coleccion:col,elemento:f,rama:r};
          cola.push({rama:f.rama,padre:f});
        }
      }
    }
    if(retirado) throw new Error('Elemento retirado: '+c+'/'+e);
    throw new Error('Elemento inexistente en su colección: '+ref);
  }
  // Propiedad y forma de las Colecciones: raíz en la tabla principal, hijos en la rama de su padre,
  // una sola colección raíz vigente por proyecto y ningún enlace combinado con rutas relativas.
  function reglasColeccion(f,anterior,rama,filas) {
    if(anterior?.clase && f.clase!==anterior.clase) throw new Error('No se puede cambiar la clase de un registro existente');
    if(f.rama&&f.vigencia==='vigente') {
      for(const r of [undefined,...ramas('colecciones')]) if(leer('colecciones',{rama:r}).some(x=>!(r===rama&&x.id===f.id)&&x.vigencia==='vigente'&&x.rama===f.rama)) throw new Error('La rama ya tiene un padre vigente: '+f.rama);
      let r=rama; const vistos=new Set();
      while(r) { if(r===f.rama||vistos.has(r)) throw new Error('Ciclo entre ramas de Colecciones'); vistos.add(r); const p=padreDeRama('colecciones',r); r=p?ramaDeFila(p):null; }
    }
    if(!rama) {
      if(f.clase!=='coleccion') throw new Error('Una subcolección o un elemento vive en la rama de su colección');
      if(f.padre||f.coleccion) throw new Error('Una colección raíz no tiene padre');
      if(f.proyecto && f.vigencia==='vigente' && (f.proyecto!==anterior?.proyecto || anterior?.vigencia!=='vigente')) {
        if(!leer('proyectos').some(p=>p.id===f.proyecto&&p.tipo==='proyecto'&&p.vigencia==='vigente')) throw new Error('Proyecto propietario inexistente o retirado');
        if(filas.some(x=>x.id!==f.id&&x.vigencia==='vigente'&&x.clase==='coleccion'&&x.proyecto===f.proyecto)) throw new Error('El proyecto ya tiene su colección raíz');
      }
      return;
    }
    if(f.clase==='coleccion') throw new Error('Una colección raíz vive en la tabla principal');
    if(f.proyecto) throw new Error('La propiedad es de la colección raíz; un elemento no la copia');
    const padre=padreDeRama('colecciones',rama);
    if(!padre) return; // Rama huérfana heredada: se conserva sin inventar su padre.
    if(f.padre && f.padre!==padre.id) throw new Error('El padre lo determina la rama');
    f.padre=padre.id; f.coleccion=padre.clase==='coleccion'?padre.id:(padre.coleccion||'');
    if(f.ubicacion==='relativa' && f.coleccion) {
      const raizCol=leer('colecciones').find(x=>x.id===f.coleccion);
      if(raizCol?.ubicacion==='enlace') throw new Error('Un enlace no se combina con rutas relativas: registra la URL del elemento');
    }
  }

  function ramaDeFila(fila) {
    for(const r of ramas('colecciones')) if(leer('colecciones',{rama:r}).some(x=>x.id===fila.id)) return r;
    return null;
  }

  function poner(t,datos,id,exigeNuevo=false,pedido=null,rama) {
    // Dentro de una operación compuesta la proyección se difiere: se proyecta una sola vez al terminar.
    const tk=rama?t+'/'+rama:t, proyectarTk=idEscrito=>{if(sesion?.diferir){sesion.tocadas.add(tk);return [];}const r=rama?proyectarRama(t,rama):proyectar();const fichas=rama&&t==='colecciones'&&referenciados().has(idEscrito)?proyectar().avisos:[];return [...r.avisos,...fichas,...avisoTamano(t,rama)];};
    try { ruta(t,rama); } catch(e) { throw errorConRecibo(e,{guardado:false,vistaPendiente:false,tabla:tk,id:id??null,error:e.message}); }
    return exclusivo(()=>{
      const pPendiente=seguro(join(raiz,'.vista-pendiente.json'));
      const registro=existsSync(pPendiente)?JSON.parse(readFileSync(pPendiente,'utf8')):null;
      const pendientes=registro?.pedidos??(registro?[registro]:[]);
      const pendiente=pendientes.find(p=>p.tabla===tk&&p.clave===pedido);
      const completarPedido=()=>{if(sesion?.diferir)return;const restantes=pendientes.filter(p=>p!==pendiente);if(restantes.length)atomico(pPendiente,JSON.stringify({pedidos:restantes})+'\n');else if(existsSync(pPendiente))unlinkSync(pPendiente);};
      let idFinal=id;
      if(exigeNuevo && !datos?.id && pendiente && pendiente.tabla===tk && pendiente.clave===pedido) idFinal=pendiente.id;
      let filas;
      try { filas=leer(t,{rama}); } catch(e) { throw errorConRecibo(e,{guardado:false,vistaPendiente:false,tabla:tk,id:idFinal??null,error:e.message}); }
      const anterior=filas.find(f=>f.id===idFinal);
      if(exigeNuevo && anterior) {
        if(((pendiente && pendiente.id===idFinal && pendiente.tabla===tk) || pedido?.startsWith('pedido:')) && igualCarga(anterior,{...datos,vigencia:datos?.vigencia??'vigente'})) {
          try {
            const avisos=proyectarTk(anterior.id);
            completarPedido();
            return adjuntarRecibo(anterior,{guardado:true,vistaPendiente:false,tabla:tk,id:anterior.id,reintentoIdempotente:true,avisos});
          } catch(causa) {
            const err=new Error(`Guardado (${anterior.id}), vista pendiente: ${causa.message}`);
            throw errorConRecibo(err,{guardado:true,vistaPendiente:true,tabla:tk,id:anterior.id,fila:anterior,reintentoIdempotente:true,errorVista:causa.message});
          }
        }
        throw errorConRecibo(new Error('ID duplicado'),{guardado:false,vistaPendiente:false,tabla:tk,id:idFinal,error:'ID duplicado'});
      }
      if (!exigeNuevo && !anterior) throw errorConRecibo(new Error('Fila inexistente'),{guardado:false,vistaPendiente:false,tabla:tk,id:idFinal,error:'Fila inexistente'});
      let f={...anterior,...datos,id:idFinal,fecha:new Date().toISOString(),vigencia:datos.vigencia ?? anterior?.vigencia ?? 'vigente'};
      if(t==='colecciones') f=completarColeccion(f,Boolean(rama));
      try {
        if(t==='proyectos'&&Array.isArray(f.elementosUsados)) f.elementosUsados=f.elementosUsados.map(referencia);
        if(t==='colecciones'&&anterior?.clase&&f.clase!==anterior.clase) throw new Error('No se puede cambiar la clase de un registro existente');
        validar(t,f);
        if(anterior && 'tipo' in anterior && f.tipo!==anterior.tipo) throw new Error('No se puede cambiar el tipo de un registro existente');
        if(t==='colecciones') reglasColeccion(f,anterior,rama,filas);
        // Cada referencia nueva debe existir y estar vigente al registrarse; las ya registradas se informan al leer la ficha.
        if(t==='proyectos' && Array.isArray(f.elementosUsados)) {
          const previas=new Set((anterior?.elementosUsados??[]).map(claveReferencia));
          if(f.elementosUsados.length>USOS.tope && f.elementosUsados.length>previas.size) throw Object.assign(new Error(`Un frente registra hasta ${USOS.tope} elementos usados`),{codigo:'DEMASIADOS_USOS',necesitaDecision:true,decision:'Referenciar una subcolección en lugar de sus elementos uno a uno, o retirar usos que ya no se necesitan.'});
          for(const r of f.elementosUsados) if(!previas.has(claveReferencia(r))) elementoDe(r);
        }
        if (t==='proyectos' && f.tipo==='frente' && !leer('proyectos').some(p=>p.id===f.proyecto && p.tipo==='proyecto' && p.vigencia==='vigente' && p.estado!=='terminado')) throw new Error('Proyecto obligatorio e inexistente/terminado');
        if(t==='proyectos') {
          if(f.tipo==='proyecto'&&f.proyecto) throw new Error('Un proyecto no puede pertenecer a otro proyecto');
          if(f.tipo==='proyecto'&&f.perteneceA) throw new Error('Solo un frente tiene frente padre');
          const candidatos=[...filas.filter(p=>p.id!==f.id),f];
          if(f.tipo==='frente'&&f.perteneceA&&f.vigencia==='vigente'&&f.estado!=='terminado') {
            const resolver=ref=>{
              const lista=candidatos.filter(p=>p.tipo==='frente'&&p.proyecto===f.proyecto&&p.vigencia==='vigente'&&p.estado!=='terminado'&&(p.id===ref||p.nombre===ref));
              const padre=lista.find(p=>p.id===ref)??(lista.length===1?lista[0]:undefined);
              if(!padre) throw new Error('Frente padre inexistente, ambiguo, retirado, terminado o de otro proyecto');
              return padre;
            };
            let padre=resolver(f.perteneceA);f.perteneceA=padre.id;
            const vistos=new Set([f.id]);
            while(padre){if(vistos.has(padre.id))throw new Error('Ciclo entre frentes');vistos.add(padre.id);padre=padre.perteneceA?resolver(padre.perteneceA):null;}
          }
          if(anterior&&f.proyecto!==anterior.proyecto&&filas.some(h=>h.tipo==='frente'&&h.vigencia==='vigente'&&h.estado!=='terminado'&&h.proyecto===anterior.proyecto&&(h.perteneceA===f.id||h.perteneceA===anterior.nombre))) throw new Error('No se puede cambiar de proyecto un padre con subfrentes vigentes');
        }
      } catch(e) { throw errorConRecibo(e,{guardado:false,vistaPendiente:false,tabla:tk,id:idFinal,error:e.message}); }
      const version=join(raiz,'version.json');
      if(!existsSync(version)) atomico(version,JSON.stringify({memoria:VERSION},null,2)+'\n');
      mkdirSync(seguro(join(raiz,'Tablas')),{recursive:true});
      if(rama&&exigeNuevo&&!existsSync(ruta(t,rama))&&!ramaReferida(t,rama)) throw errorConRecibo(new Error('Rama sin fila padre: créala antes con abrirRama'),{guardado:false,vistaPendiente:false,tabla:tk,id:idFinal,error:'Rama sin fila padre'});
      const p=ruta(t,rama), texto=existsSync(p)?readFileSync(p,'utf8'):'';
      mkdirSync(dirname(p),{recursive:true});
      const linea=(texto && !texto.endsWith('\n')?'\n':'')+JSON.stringify({operacion:'poner',fila:f})+'\n';
      const fd=openSync(p,'a'); try { writeSync(fd,linea,null,'utf8'); fsyncSync(fd); } finally { closeSync(fd); }
      sesion?.cache.get(p)?.set(f.id,f); if(rama) sesion?.ramas.delete(t);
      if(f.rama) sesion?.padres.delete(t+'/'+f.rama);
      if(anterior?.rama) sesion?.padres.delete(t+'/'+anterior.rama);
      sesion?.escritos?.push({tabla:tk,id:f.id,clave:pedido});
      // Si falla una vista, el evento ya es durable: se emite recibo con su ID y regenerar() o reintentar no duplica.
      try {
        const avisos=proyectarTk(f.id);
        completarPedido();
        return adjuntarRecibo(f,{guardado:true,vistaPendiente:false,tabla:tk,id:f.id,avisos});
      } catch(causa) {
        atomico(pPendiente,JSON.stringify({pedidos:[...pendientes.filter(p=>!(p.tabla===tk&&p.clave===pedido)),{tabla:tk,id:f.id,clave:pedido,fecha:f.fecha}]})+'\n');
        const err=new Error(`Guardado (${f.id}), vista pendiente: ${causa.message}`);
        throw errorConRecibo(err,{guardado:true,vistaPendiente:true,tabla:tk,id:f.id,fila:f,errorVista:causa.message});
      }
    });
  }
  // Lote de Colecciones dentro de una operación: valida cada cambio con las mismas reglas que poner,
  // y solo después agrega un bloque por archivo (una escritura y un fsync por rama). Si una validación falla,
  // no se escribe nada. Si se corta a mitad, lo escrito queda en el recibo de la operación para reanudarla.
  function ponerLote(t,cambios,{idPedido,confirmadoPorPersona=false,antesDeEscribir}) {
    if(t!=='colecciones') throw new Error('El lote admite solo Colecciones');
    if(!Array.isArray(cambios)) throw new Error('El lote necesita una lista de cambios');
    return exclusivo(()=>{
      if(!sesion.escritos) throw new Error('El lote se usa dentro de una operación compuesta');
      const buffers=new Map(); let autorizaRamas=confirmadoPorPersona===true?true:null, sinCambios=0;
      const olvidar=rutas=>{ for(const p of rutas) sesion.cache.delete(p); sesion.ramas.delete(t); sesion.padres.clear(); };
      try {
        for(const c of cambios) {
          const {rama,datos,nuevo=false,clave,id:idDado}=c??{};
          if(!datos||typeof datos!=='object'||Array.isArray(datos)) throw new Error('Cambio de lote sin datos');
          if('id' in datos||'fecha' in datos) throw new Error('ID y fecha son del Motor');
          const tk=rama?t+'/'+rama:t, p=ruta(t,rama);
          if(nuevo&&(typeof clave!=='string'||!PEDIDO.test(clave))) throw new Error('Cada alta del lote necesita su clave');
          const id=nuevo?(idDado??idDePedido(tk,idPedido+':'+clave)):idDado;
          if(typeof id!=='string'||!id) throw new Error('Cambio de lote sin ID');
          // Un ID explícito traslada un elemento a otra rama: antes debe quedar retirado en la anterior.
          const historicas=[];
          if(nuevo&&idDado!==undefined) for(const r of [undefined,...ramas(t)]) if((r??'')!==(rama??'')) {
            const otra=cargar(t,r).get(idDado);
            if(otra?.vigencia==='vigente') throw new Error('El ID sigue vigente en otra rama: '+idDado);
            if(otra) historicas.push(otra);
          }
          const mapa=cargar(t,rama);
          if(!buffers.has(p)) buffers.set(p,{tk,lineas:[],registros:[],nueva:!existsSync(p)});
          const b=buffers.get(p), anterior=mapa.get(id);
          if(nuevo&&anterior) {
            if(igualCarga(anterior,{...datos,vigencia:datos.vigencia??'vigente'})) { sinCambios++; continue; }
            // Volver a una rama anterior reactiva su versión histórica; nunca sustituye otra identidad vigente.
            if(!(idDado!==undefined&&anterior.vigencia==='reemplazada'&&anterior.clase==='elemento')) throw new Error('ID duplicado: '+id);
          }
          if(!nuevo&&!anterior) throw new Error('Fila inexistente: '+id);
          if(!nuevo&&igualCarga(anterior,datos)) { sinCambios++; continue; }
          const f=completarColeccion({...anterior,...datos,id,fecha:new Date().toISOString(),vigencia:datos.vigencia??(nuevo?'vigente':anterior?.vigencia??'vigente')},Boolean(rama));
          if(anterior?.clase&&f.clase!==anterior.clase) throw new Error('No se puede cambiar la clase de un registro existente');
          validar(t,f);
          if(f.rama&&f.rama!==anterior?.rama) {
            if(autorizaRamas===null) autorizaRamas=autonomiaRamas();
            if(!autorizaRamas) throw Object.assign(new Error('Crear una rama requiere confirmadoPorPersona: true, salvo que la persona haya confirmado autonomía para ramas'),{codigo:'CONFIRMAR_RAMAS',necesitaDecision:true,decision:'Confirmar con la persona que el índice abra ramas nuevas (confirmadoPorPersona: true).'});
          }
          if(nuevo&&rama&&b.nueva&&!b.lineas.length&&!ramaReferida(t,rama)) throw new Error('Rama sin fila padre: créala antes con abrirRama');
          reglasColeccion(f,anterior,rama,rama?[]:[...mapa.values()]);
          if(nuevo&&[...(anterior?[anterior]:[]),...historicas].some(x=>x.coleccion!==f.coleccion||x.clase!==f.clase)) throw new Error('No se reactiva un ID en otra colección o clase: '+id);
          b.lineas.push(JSON.stringify({operacion:'poner',fila:f})); b.registros.push({tabla:tk,id,clave:nuevo?'pedido:'+idPedido+':'+clave:null});
          mapa.set(id,f);
          if(rama&&b.nueva&&!ramas(t).includes(rama)) sesion.ramas.set(t,[...ramas(t),rama].sort());
          if(f.rama) sesion.padres.delete(t+'/'+f.rama);
          if(anterior?.rama) sesion.padres.delete(t+'/'+anterior.rama);
        }
      } catch(e) { olvidar(buffers.keys()); throw errorConRecibo(e,{guardado:false,vistaPendiente:false,tabla:t,id:null,error:e.message}); }
      // Guarda el lote ya validado antes del primer efecto durable. El reintento lo completa antes de volver al llamador.
      try { antesDeEscribir?.(); } catch(e) { olvidar(buffers.keys()); throw e; }
      const version=join(raiz,'version.json');
      if(!existsSync(version)) atomico(version,JSON.stringify({memoria:VERSION},null,2)+'\n');
      mkdirSync(seguro(join(raiz,'Tablas')),{recursive:true});
      let escritos=0;
      const porEscribir=[...buffers].filter(([,b])=>b.lineas.length);
      for(let i=0;i<porEscribir.length;i++) {
        const [p,b]=porEscribir[i];
        try {
          mkdirSync(dirname(p),{recursive:true});
          const fd=openSync(p,'a+');
          try {
            const tamano=fstatSync(fd).size, ultimo=Buffer.alloc(1);
            if(tamano) readSync(fd,ultimo,0,1,tamano-1);
            writeSync(fd,(tamano&&ultimo[0]!==10?'\n':'')+b.lineas.join('\n')+'\n',null,'utf8'); fsyncSync(fd);
          } finally { closeSync(fd); }
        } catch(e) {
          olvidar(porEscribir.slice(i).map(([x])=>x));
          throw errorConRecibo(e,{guardado:escritos>0,vistaPendiente:false,tabla:b.tk,id:null,error:e.message});
        }
        sesion.tocadas.add(b.tk); sesion.escritos.push(...b.registros); escritos+=b.registros.length;
      }
      sesion.ramas.delete(t);
      return {escritos,sinCambios};
    });
  }
  // Diario de operaciones compuestas: la intención se escribe antes de cualquier efecto y se borra al completarse.
  const pOperaciones=()=>seguro(join(raiz,'.operaciones.json'));
  const leerOperaciones=()=>{const p=pOperaciones();return existsSync(p)?(JSON.parse(readFileSync(p,'utf8')).operaciones??[]):[];};
  const guardarOperaciones=lista=>{const p=pOperaciones();if(lista.length)atomico(p,JSON.stringify({operaciones:lista},null,2)+'\n');else if(existsSync(p))unlinkSync(p);};
  function proyectarTocadas(tocadas,escritos=[]) {
    const avisos=[], raices=[...tocadas].filter(k=>!k.includes('/'));
    // Un elemento usado por un frente que cambia en su rama también actualiza las fichas.
    const usados=escritos.some(e=>e.tabla.startsWith('colecciones/'))?referenciados():null;
    if(raices.length||usados&&escritos.some(e=>e.tabla.startsWith('colecciones/')&&usados.has(e.id))) avisos.push(...proyectar().avisos);
    for(const k of tocadas) if(k.includes('/')) { const [t,r]=k.split('/'); avisos.push(...proyectarRama(t,r).avisos,...avisoTamano(t,r)); }
    for(const t of raices) avisos.push(...avisoTamano(t));
    return avisos;
  }
  const api={
    raiz, leer, exclusivo, idDePedido,
    inicializar(){ return exclusivo(()=>{ mkdirSync(raiz,{recursive:true}); proyectar({ramas:true}); return api; }); },
    alta(t,datos,opciones={}){
      const rama=opciones?.rama, tk=rama?t+'/'+rama:t;
      const pedido=opciones?.idPedido?`pedido:${opciones.idPedido}`:clavePedido(tk,datos);
      const id=datos?.id ?? (opciones?.idPedido?idDePedido(tk,opciones.idPedido):randomUUID());
      return poner(t,datos,id,true,pedido,rama);
    },
    elemento: ref=>elementoDe(ref),
    // Igual que elemento, más el localizador que sale de los datos; no consulta el disco.
    localizar: ref=>{ const r=elementoDe(ref); return {...r,localizador:localizarUso(r.coleccion,r.elemento)}; },
    operacionesPendientes: ()=>leerOperaciones(),
    // Operación compuesta recuperable (por ejemplo, proyecto + carpeta + colección). Todo ocurre bajo un solo candado:
    // el diario guarda la intención y los pasos del sistema de archivos; cada alta deriva su ID de idPedido + clave,
    // así un reintento o una reanudación tras una caída no duplica nada. Las vistas se proyectan una vez al final.
    operacion({idPedido,tipo,datos={}},fn){
      if(typeof idPedido!=='string'||!PEDIDO.test(idPedido)) throw new Error('Operación sin idPedido válido (letras, números, . _ : -)');
      if(typeof tipo!=='string'||!tipo) throw new Error('Operación sin tipo');
      return exclusivo(()=>{
        if(sesion.escritos) throw new Error('No se anidan operaciones compuestas');
        const lista=leerOperaciones();
        let op=lista.find(o=>o.idPedido===idPedido);
        if(op&&op.tipo!==tipo) throw new Error('Ese idPedido pertenece a otra operación');
        if(!op) { op={idPedido,tipo,datos,estado:'en-curso',inicio:new Date().toISOString(),pasos:{}}; lista.push(op); }
        else { op.estado='en-curso'; op.reanudaciones=(op.reanudaciones??0)+1; }
        guardarOperaciones(lista);
        const persistir=()=>guardarOperaciones(lista);
        sesion.diferir=true; sesion.escritos=[];
        // Un retorno idempotente puede no escribir nada: aun así debe recuperar sus derivados pendientes.
        const pVista=seguro(join(raiz,'.vista-pendiente.json'));
        const registroVista=existsSync(pVista)?JSON.parse(readFileSync(pVista,'utf8')):null;
        const pendientesVista=registroVista?.pedidos??(registroVista?[registroVista]:[]);
        const delPedido=p=>p.operacion===idPedido||p.clave?.startsWith('pedido:'+idPedido+':')||op.escritos?.includes(p.tabla+':'+p.id);
        const idsPendientes=new Set(pendientesVista.filter(delPedido).map(p=>p.tabla+':'+p.id));
        for(const p of pendientesVista) if(delPedido(p)||idsPendientes.has(p.tabla+':'+p.id)) sesion.tocadas.add(p.tabla);
        const aplicarLote=(t,cambios,{confirmadoPorPersona=false}={})=>{
          const r=ponerLote(t,cambios,{idPedido,confirmadoPorPersona,antesDeEscribir:()=>{
            op.lotePendiente={tabla:t,cambios,confirmadoPorPersona};persistir();
          }});
          // Conservar también los escritos anteriores si el siguiente paso vuelve a fallar o se corta el proceso.
          op.escritos=[...new Set([...(op.escritos??[]),...sesion.escritos.map(e=>e.tabla+':'+e.id)])];
          delete op.lotePendiente;persistir();return r;
        };
        const ctx=Object.freeze({
          idPedido, datos:op.datos, leer,
          paso:n=>op.pasos[n],
          marcar(n,v){ op.pasos[n]=v; persistir(); },
          alta(t,fila,{rama,clave}={}){ if(typeof clave!=='string'||!PEDIDO.test(clave)) throw new Error('Cada alta de una operación necesita su clave'); return api.alta(t,fila,{rama,idPedido:idPedido+':'+clave}); },
          actualizar(t,id,cambios,{rama}={}){ const a=leer(t,{rama}).find(f=>f.id===id); return a&&igualCarga(a,cambios)?a:api.actualizar(t,id,cambios,{rama}); },
          abrirRama:(t,id,o)=>api.abrirRama(t,id,o),
          lote:aplicarLote,
          elemento:ref=>elementoDe(ref),
        });
        let resultado, fallo=null;
        try {
          if(op.lotePendiente) {
            const l=op.lotePendiente;
            aplicarLote(l.tabla,l.cambios,{confirmadoPorPersona:l.confirmadoPorPersona});
          }
          resultado=fn(ctx);
        } catch(e) { fallo=e; }
        const escritos=sesion.escritos, tocadas=sesion.tocadas;
        sesion.diferir=false; sesion.escritos=null; sesion.tocadas=new Set();
        // Aunque falle a mitad, las vistas deben reflejar lo que ya es durable.
        let avisos=[], errorVista=null;
        if(tocadas.size) try { avisos=proyectarTocadas(tocadas,escritos); } catch(c) { errorVista=c; }
        if(errorVista && escritos.length) {
          const pPendiente=seguro(join(raiz,'.vista-pendiente.json')), previo=existsSync(pPendiente)?JSON.parse(readFileSync(pPendiente,'utf8')):null;
          const anteriores=(previo?.pedidos??(previo?[previo]:[])).filter(p=>!escritos.some(e=>e.tabla===p.tabla&&e.clave===p.clave));
          atomico(pPendiente,JSON.stringify({pedidos:[...anteriores,...escritos.map(e=>({...e,operacion:idPedido,fecha:new Date().toISOString()}))]})+'\n');
        }
        if(!errorVista&&tocadas.size&&existsSync(pVista)) {
          const reg=JSON.parse(readFileSync(pVista,'utf8')), todas=reg.pedidos??[reg], raices=[...tocadas].some(t=>!t.includes('/'));
          const restantes=todas.filter(p=>!tocadas.has(p.tabla)&&!(raices&&!p.tabla.includes('/')));
          if(restantes.length) atomico(pVista,JSON.stringify({pedidos:restantes})+'\n'); else unlinkSync(pVista);
        }
        const recibo={operacion:idPedido,tipo,escritos,avisos,vistaPendiente:Boolean(errorVista),...(errorVista?{errorVista:errorVista.message}:{})};
        if(fallo) {
          const guardado=escritos.length>0||Boolean(op.escritos?.length);
          const durable=guardado||Boolean(op.lotePendiente)||Object.keys(op.pasos).length>0;
          if(durable) { op.estado='interrumpida'; op.error=fallo.message; op.escritos=[...new Set([...(op.escritos??[]),...escritos.map(e=>e.tabla+':'+e.id)])]; persistir(); }
          else guardarOperaciones(lista.filter(o=>o!==op)); // Nada durable: se descarta la intención.
          throw errorConRecibo(fallo,{...recibo,guardado,pendiente:durable,error:fallo.message});
        }
        guardarOperaciones(lista.filter(o=>o!==op));
        if(errorVista) throw errorConRecibo(new Error('Operación guardada, vista pendiente: '+errorVista.message),{...recibo,guardado:true,pendiente:false,resultado});
        return {resultado,recibo:Object.freeze({...recibo,guardado:true,pendiente:false})};
      });
    },
    // Abandona una operación pendiente sin escrituras de tablas registradas. No deshace pasos físicos: los informa.
    descartarOperacion({idPedido,confirmadoPorPersona=false}={}){
      if(confirmadoPorPersona!==true) throw new Error('Descartar una operación pendiente requiere confirmadoPorPersona: true');
      return exclusivo(()=>{
        const lista=leerOperaciones(), op=lista.find(o=>o.idPedido===idPedido);
        if(!op) return {descartada:false,motivo:'No hay operación pendiente con ese idPedido'};
        if(op.escritos?.length||op.lotePendiente) throw new Error('La operación ya tiene escrituras duraderas o un lote preparado; reanúdala para completarla');
        guardarOperaciones(lista.filter(o=>o!==op));
        return {descartada:true,idPedido,tipo:op.tipo,pasos:op.pasos};
      });
    },
    // Retira un candado solo si su proceso ya no existe en esta computadora y la persona lo confirma.
    liberarCandado({confirmadoPorPersona=false}={}){
      if(confirmadoPorPersona!==true) throw new Error('Liberar el candado requiere confirmadoPorPersona: true');
      if(!existsSync(pCandado())) return {liberado:false,motivo:'No hay candado'};
      const h=candadoHuerfano();
      if(!h) throw new Error('El candado pertenece a un proceso vivo o no se puede comprobar; no se retira');
      unlinkSync(pCandado());
      return {liberado:true,pid:h.pid,desde:h.inicio,operacionesPendientes:leerOperaciones().map(o=>o.idPedido)};
    },
    actualizar(t,id,cambios,opciones={}){ if('id' in cambios || 'fecha' in cambios) throw new Error('ID y fecha son del Motor'); return poner(t,cambios,id,false,null,opciones?.rama); },
    retirar(t,id,opciones={}){ return poner(t,{vigencia:'reemplazada'},id,false,null,opciones?.rama); },
    regenerar(){ return exclusivo(()=>proyectar({ramas:true})); },
    ramas,
    // Abre una rama bajo una fila: con confirmación de la persona o con su autonomía confirmada para ramas.
    abrirRama(t,idPadre,{rama:ramaPadre,nombre,confirmadoPorPersona=false}={}){
      if(!RAMIFICABLES.includes(t)) throw new Error('La tabla '+t+' no admite ramas');
      if(confirmadoPorPersona!==true && !autonomiaRamas()) throw new Error('Crear una rama requiere confirmadoPorPersona: true, salvo que la persona haya confirmado autonomía para ramas');
      const padre=leer(t,{rama:ramaPadre}).find(f=>f.id===idPadre&&f.vigencia==='vigente');
      if(!padre) throw new Error('Fila padre inexistente o retirada');
      if(padre.rama) return {rama:padre.rama,existente:true,fila:padre};
      const slug=nombreRama(t,ramaPadre,idPadre,nombre||padre.nombre||padre.concepto);
      return {rama:slug,existente:false,fila:poner(t,{rama:slug},idPadre,false,null,ramaPadre)};
    },
  };
  return api;
}

// El anfitrión entrega esta API limitada, nunca el objeto completo ni rutas de Memoria.
// Es un contrato de API, no una caja de aislamiento para JavaScript hostil.
export function puertaExtension(tablas, permiso) {
  if (!permiso || permiso.autorizado!==true || typeof permiso.comprobar!=='function' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(permiso.nombre)) throw new Error('Extensión no autorizada');
  function acceso(t,accion) {
    permiso.comprobar();
    if(!permiso.permisos?.[accion]?.includes(t)) throw new Error('Permiso no declarado');
  }
  const bajoExclusion=fn=>typeof tablas.exclusivo==='function'?tablas.exclusivo(fn):fn();
  return Object.freeze({
    leer(t,opciones){ acceso(t,'leer'); return tablas.leer(t,opciones); },
    alta(t,f,op){ acceso(t,'escribir'); return tablas.alta(t,f,op); },
    actualizar(t,id,f){ acceso(t,'escribir'); return tablas.actualizar(t,id,f); },
    guardarPropia(fila){
      acceso('propia','escribir');
      if (!fila || typeof fila!=='object' || Array.isArray(fila)) throw new Error('Fila inválida');
      return bajoExclusion(()=>{
        const version=join(tablas.raiz,'version.json');
        if(!existsSync(version)) atomico(version,JSON.stringify({memoria:VERSION},null,2)+'\n');
        const p=seguro(join(tablas.raiz,'Tablas','Extensiones',permiso.nombre+'.jsonl'));
        mkdirSync(dirname(p),{recursive:true}); const lock=p+'.lock', fd=openSync(lock,'wx');
        try {
          const anteriores=existsSync(p)?readFileSync(p,'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l)):[];
          const f={...fila,id:randomUUID(),fecha:new Date().toISOString()};
          const bytes=JSON.stringify(f)+'\n', log=openSync(p,'a');
          try { writeSync(log,bytes,null,'utf8'); fsyncSync(log); } finally { closeSync(log); }
          const filas=[...anteriores,f], columnas=[...new Set(filas.flatMap(Object.keys))];
          atomico(p.replace(/\.jsonl$/,'.csv'),'\ufeff'+[columnas.map(csv).join(','),...filas.map(r=>columnas.map(k=>csv(typeof r[k]==='object'?JSON.stringify(r[k]):r[k])).join(','))].join('\r\n')+'\r\n');
          return f;
        } finally { closeSync(fd); unlinkSync(lock); }
      });
    },
  });
}
