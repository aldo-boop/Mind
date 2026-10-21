import * as fs from 'node:fs';
import {join,dirname,resolve,isAbsolute,basename,relative,extname,posix} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {UBICACIONES,esAbsoluta,esEnlace,esRelativaSegura,nombreRama} from '../Tablas/tablas.mjs';
import {buscar,compararResultados} from '../Buscar/buscar.mjs';

export function decidirUbicacion(mensaje) {
  return Object.assign(new Error(mensaje),{codigo:'DECISION_UBICACION',necesitaDecision:true,decision:'Elegir una carpeta accesible o un enlace explícito para la colección.'});
}
const decidir=(codigo,mensaje,decision,detalle)=>Object.assign(new Error(mensaje),{codigo,necesitaDecision:true,decision,...(detalle?{detalle}:{})});
// Errores de lectura que solo prueban que esa carpeta no se pudo observar; cualquier otro fallo detiene la operación.
const PARCIALES=new Set(['EACCES','EPERM','EBUSY','ENOENT','ENOTDIR','ELOOP','EIO','UNKNOWN']);
const PROFUNDIDAD_MAXIMA=64, ENTRADAS_MAXIMAS=50000, MUESTRA=10, LISTA=50;
const ESQUEMAS_PROHIBIDOS=new Set(['file','javascript','data','vbscript']);
// En Windows los nombres no distinguen mayúsculas: comparar así evita duplicar un archivo que solo cambió de grafía.
const claveRuta=r=>process.platform==='win32'?r.toLowerCase():r;
const normal=d=>String(d).replace(/\\/g,'/').replace(/^\.\//,'').replace(/\/+$/,'');
const carpetaDe=d=>{const p=posix.dirname(d);return p==='.'?'':p;};
const acotar=(lista,n=LISTA)=>({lista:lista.slice(0,n),total:lista.length});
const ubicacionRaiz=c=>c.ubicacion||(esEnlace(c.direccion)&&!esAbsoluta(c.direccion)?'enlace':esAbsoluta(c.direccion)?'local':'mind');
const ubicacionHijo=f=>f.ubicacion||(esEnlace(f.direccion)&&!esAbsoluta(f.direccion)?'enlace':esAbsoluta(f.direccion)?'absoluta':'relativa');
const dentroDe=(hijo,padre)=>{const r=relative(padre,hijo);return r!==''&&!r.startsWith('..')&&!isAbsolute(r);};
const mismaRuta=(a,b)=>claveRuta(resolve(a))===claveRuta(resolve(b));

// Windows resuelve su carpeta conocida: incluye la redirección del Escritorio. No deducimos una ruta del perfil.
export function escritorioWindows() {
  if(process.platform!=='win32') throw decidirUbicacion('No se puede consultar el Escritorio de Windows en este sistema; elige una base explícita');
  const sistema=process.env.SystemRoot;
  if(!sistema||!isAbsolute(sistema)) throw decidirUbicacion('Windows no informó su directorio de sistema; elige una base explícita');
  const comando='[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; [Console]::Write([Environment]::GetFolderPath([Environment+SpecialFolder]::DesktopDirectory))';
  let ruta;
  try { ruta=execFileSync(join(sistema,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-Command',comando],{encoding:'utf8',windowsHide:true,timeout:10000}).replace(/^\uFEFF/,'').trim(); }
  catch { throw decidirUbicacion('No se pudo consultar la carpeta conocida del Escritorio; elige una base explícita'); }
  if(!ruta||!esAbsoluta(ruta)) throw decidirUbicacion('Windows no devolvió un Escritorio físico válido; elige una base explícita');
  return ruta;
}

export function nombreCarpeta(nombre,idPedido) {
  const legible=String(nombre).normalize('NFKC').replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').replace(/\s+/g,' ').trim().replace(/[. ]+$/g,'').slice(0,60).trim()||'Proyecto';
  return legible+' ('+createHash('sha256').update(idPedido).digest('hex').slice(0,6)+')';
}

export function abrirColecciones(tablas,{escritorio=escritorioWindows,archivos=fs}={}) {
  const memoria=tablas.raiz;
  function proteger(dir) {
    let p=resolve(dir);
    while(true) {
      let estado;try { estado=archivos.lstatSync(p,{throwIfNoEntry:false}); } catch { throw decidirUbicacion('Sin permiso para comprobar la ubicación: '+dir); }
      if(estado?.isSymbolicLink()) throw decidirUbicacion('No se permiten enlaces simbólicos ni junctions en la ubicación: '+dir);
      const padre=dirname(p);if(padre===p)break;p=padre;
    }
    return dir;
  }
  function local(ubicacion,direccion) {
    if(typeof direccion!=='string'||direccion.includes('\0')||!(ubicacion==='mind'?esRelativaSegura(direccion):esAbsoluta(direccion)&&isAbsolute(direccion))) throw decidirUbicacion('Dirección incompatible con la ubicación '+ubicacion);
    return proteger(ubicacion==='mind'?join(memoria,direccion):direccion);
  }
  function carpeta(dir) {
    try {
      proteger(dir);
      if(!archivos.existsSync(dir)||!archivos.statSync(dir).isDirectory()) throw decidirUbicacion('La carpeta no existe o no es una carpeta: '+dir);
      archivos.readdirSync(dir);
    } catch(e) { if(e.necesitaDecision)throw e;throw decidirUbicacion('Sin permiso o sin acceso para leer la carpeta: '+dir); }
  }
  function comprobarUbicacion(u) {
    if(u.ubicacion==='enlace') {
      if(!esEnlace(u.direccion)||esAbsoluta(u.direccion))throw decidirUbicacion('Un enlace necesita URL o identificador «esquema:valor»');
    } else carpeta(local(u.ubicacion,u.direccion));
    return u;
  }
  function comprobarSolicitud(u,col) {
    if(!col||typeof col!=='object'||Array.isArray(col))throw decidirUbicacion('coleccion debe ser un objeto con la ubicación elegida');
    if(col.base&&col.direccion)throw decidirUbicacion('Se indicaron base y dirección a la vez; elige una ubicación');
    if(col.ubicacion&&col.ubicacion!==u.ubicacion)throw decidirUbicacion('La colección ya tiene otra ubicación; para cambiarla usa coleccion reubicar');
    if(col.direccion&&(u.ubicacion==='enlace'?col.direccion!==u.direccion:local(u.ubicacion,col.direccion)!==local(u.ubicacion,u.direccion)))throw decidirUbicacion('La colección ya tiene otra dirección; no se cambia su raíz al reintentar');
    if(col.base&&(u.ubicacion==='mind'||u.ubicacion==='enlace'||local(u.ubicacion,col.base)!==dirname(local(u.ubicacion,u.direccion))))throw decidirUbicacion('La colección ya está en otra base; no se cambia su raíz al reintentar');
  }
  function prepararUbicacion(ctx,col,nombre) {
    if(!col||typeof col!=='object'||Array.isArray(col)) throw decidirUbicacion('coleccion debe ser un objeto con la ubicación elegida');
    const hecha=ctx.paso('ubicacion');
    if(hecha)comprobarSolicitud(hecha,col);
    if(hecha?.estado==='lista')return comprobarUbicacion(hecha);
    const ubicacion=col.ubicacion??hecha?.ubicacion??'local';
    if(!UBICACIONES.coleccion.includes(ubicacion)) throw decidirUbicacion('Ubicación inválida: '+ubicacion+'; elige local, sincronizada, enlace o mind');
    if(col.base&&col.direccion) throw decidirUbicacion('Se indicaron base y dirección a la vez; elige crear en una base o vincular una carpeta');
    const ahora=new Date().toISOString();
    if(ubicacion==='enlace') {
      if(col.base||col.modo&&col.modo!=='vincular')throw decidirUbicacion('Un enlace se registra con dirección explícita, sin crear carpetas');
      const u={estado:'lista',modo:'enlace',ubicacion,direccion:col.direccion,disponibilidad:'no-comprobada',comprobado:''};
      comprobarUbicacion(u);ctx.marcar('ubicacion',u);return u;
    }
    const modo=col.modo??hecha?.modo??(col.direccion?'vincular':'crear');
    if(modo==='vincular') {
      if(col.base)throw decidirUbicacion('Vincular necesita dirección, no base');
      const dir=local(ubicacion,col.direccion);carpeta(dir);
      const u={estado:'lista',modo,ubicacion,direccion:col.direccion,disponibilidad:'disponible',comprobado:ahora};
      ctx.marcar('ubicacion',u);return u;
    }
    if(modo!=='crear'||col.direccion)throw decidirUbicacion('Para crear indica base; para una dirección existente utiliza vincular');
    if(ubicacion==='mind'&&col.base)throw decidirUbicacion('Dentro de Mind no se indica base externa');
    if(ubicacion==='sincronizada'&&!col.base)throw decidirUbicacion('Elige la carpeta sincronizada; Mind no selecciona proveedor ni carpeta por ti');
    // La ubicación planificada se conserva al reanudar, aunque Windows haya redirigido después el Escritorio.
    const base=ubicacion==='mind'?proteger(join(memoria,'Colecciones')):hecha?.direccion?dirname(hecha.direccion):local(ubicacion,col.base??escritorio());
    if(ubicacion==='mind')try { archivos.mkdirSync(base,{recursive:true}); } catch { throw decidirUbicacion('Sin permiso para preparar la base dentro de Mind: '+base); }
    carpeta(base);
    const direccion=hecha?.direccion??(ubicacion==='mind'?'Colecciones/'+nombreCarpeta(nombre,ctx.idPedido):join(base,nombreCarpeta(nombre,ctx.idPedido)));
    const dir=local(ubicacion,direccion);
    if(archivos.existsSync(dir)&&hecha?.estado!=='creando')throw decidirUbicacion('Destino ocupado: '+dir+'; elige otra base o vincula esa carpeta');
    if(hecha?.estado!=='creando')ctx.marcar('ubicacion',{estado:'creando',modo,ubicacion,direccion});
    try { if(!archivos.existsSync(dir))archivos.mkdirSync(dir); }
    catch { throw decidirUbicacion('Sin permiso o no se pudo crear la carpeta en '+base); }
    carpeta(dir);
    const u={estado:'lista',modo,ubicacion,direccion,disponibilidad:'disponible',comprobado:ahora};
    ctx.marcar('ubicacion',u);return u;
  }
  function registrarEnOperacion(ctx,p,col,u) {
    const c=ctx.alta('colecciones',{clase:'coleccion',nombre:col.nombre||p.nombre,proyecto:p.id,ubicacion:u.ubicacion,direccion:u.direccion,disponibilidad:u.disponibilidad,...(u.comprobado?{comprobado:u.comprobado}:{}),dueno:'propia',...(col.descripcion?{descripcion:col.descripcion}:{})},{clave:'coleccion'});
    const {rama}=ctx.abrirRama('colecciones',c.id,{confirmadoPorPersona:true});
    return {...c,rama};
  }
  function raiz(ref) {
    const candidatas=tablas.leer('colecciones').filter(c=>c.clase==='coleccion'&&c.vigencia==='vigente'&&(c.id===ref||c.nombre===ref));
    const c=candidatas.find(c=>c.id===ref)??(candidatas.length===1?candidatas[0]:null);
    if(!c)throw new Error('Colección inexistente o ambigua');return c;
  }
  const dirColeccion=c=>{const u=ubicacionRaiz(c);return u==='enlace'?null:local(u,c.direccion);};
  // Recorre solo la carpeta pedida, con metadatos: nombres y tipos del directorio, y lstat cuando el tipo no es claro.
  // No abre archivos ni sigue symlinks o junctions; los informa. Una carpeta ilegible queda como error, no como vacía.
  // Con «metadatos», cada archivo aporta tamaño y fecha de modificación de su lstat; tampoco se abre.
  function recorrer(dir,{rel='',profundidad=PROFUNDIDAD_MAXIMA,maximo=ENTRADAS_MAXIMAS,metadatos=false}={}) {
    const entradas=new Map(), listadas=new Set(), presentes=new Set(), omitidos=[], errores=[], vistas=new Set(), cola=[{rel,ruta:dir,nivel:0}];
    while(cola.length) {
      const {rel:r,ruta,nivel}=cola.shift(), k=claveRuta(resolve(ruta));
      if(vistas.has(k)) { omitidos.push({direccion:r,motivo:'ciclo'}); continue; }
      vistas.add(k);
      let lista;
      try { lista=archivos.readdirSync(ruta,{withFileTypes:true}); }
      catch(e) { if(PARCIALES.has(e.code)) { errores.push({direccion:r||'.',codigo:e.code}); continue; } throw e; }
      listadas.add(r);
      for(const d of lista) {
        const nombre=String(d.name), hijo=r?r+'/'+nombre:nombre, p=join(ruta,nombre);
        presentes.add(hijo);
        if(/[\\/]/.test(nombre)||!esRelativaSegura(hijo)) { omitidos.push({direccion:hijo,motivo:'nombre-no-valido'}); continue; }
        let tipo=d.isSymbolicLink()?null:d.isDirectory()?'carpeta':d.isFile()?'archivo':null, estado=null;
        // Un marcador de nube puede figurar como punto de reanálisis: lstat lo clasifica sin abrirlo ni descargarlo.
        if(!tipo) {
          try { estado=archivos.lstatSync(p); } catch(x) { errores.push({direccion:hijo,codigo:x.code||'ERROR'}); continue; }
          if(estado.isSymbolicLink()) { omitidos.push({direccion:hijo,motivo:'enlace-simbolico'}); continue; }
          tipo=estado.isDirectory()?'carpeta':estado.isFile()?'archivo':null;
          if(!tipo) { omitidos.push({direccion:hijo,motivo:'tipo-no-soportado'}); continue; }
        }
        // Sin tamaño ni fecha el archivo sigue presente: solo no se puede comparar.
        if(metadatos&&tipo==='archivo'&&!estado) try { estado=archivos.lstatSync(p); } catch(x) { errores.push({direccion:hijo,codigo:x.code||'ERROR'}); }
        entradas.set(hijo,{rel:hijo,nombre,tipo,padre:r,...(metadatos&&tipo==='archivo'&&estado?{tamano:String(estado.size),modificado:new Date(estado.mtimeMs).toISOString()}:{})});
        if(entradas.size>maximo) throw decidir('AMBITO_GRANDE','El ámbito supera '+maximo+' entradas; no se escribió nada','Acotar el inventario con elemento, rama o profundidad.');
        if(tipo==='carpeta') { if(nivel+1<profundidad) cola.push({rel:hijo,ruta:p,nivel:nivel+1}); else if(profundidad===PROFUNDIDAD_MAXIMA) omitidos.push({direccion:hijo,motivo:'profundidad-maxima'}); }
      }
    }
    return {entradas,listadas,presentes,omitidos,errores};
  }
  // Observa un localizador con metadatos (lstat): no abre el archivo, así una carpeta sincronizada no lo descarga.
  function observar(ruta,esperado,limite) {
    const fecha=new Date().toISOString();
    try {
      for(let p=resolve(ruta);;) {
        const e=archivos.lstatSync(p,{throwIfNoEntry:false});
        if(e?.isSymbolicLink()) return {disponibilidad:'sin-acceso',motivo:'enlace-simbolico',fecha};
        if(limite&&mismaRuta(p,limite)) break;
        const padre=dirname(p); if(padre===p) break; p=padre;
      }
      const e=archivos.lstatSync(ruta,{throwIfNoEntry:false});
      if(!e) return {disponibilidad:'ausente',fecha};
      const tipo=e.isDirectory()?'carpeta':e.isFile()?'archivo':'otro';
      if(esperado&&tipo!==esperado) return {disponibilidad:'ausente',motivo:'tipo-distinto',tipo,fecha};
      return {disponibilidad:'disponible',tipo,fecha};
    } catch(e) { return ['ENOENT','ENOTDIR'].includes(e.code)?{disponibilidad:'ausente',fecha}:{disponibilidad:'sin-acceso',codigo:e.code||'ERROR',fecha}; }
  }
  // Solo reubicar lee contenido: para comparar la copia con su original.
  function hashArchivo(ruta) {
    const h=createHash('sha256'), fd=archivos.openSync(ruta,'r'), b=Buffer.alloc(1<<20); let bytes=0;
    try { for(let n;(n=archivos.readSync(fd,b,0,b.length,null))>0;) { h.update(b.subarray(0,n)); bytes+=n; } } finally { archivos.closeSync(fd); }
    return {sha256:h.digest('hex'),bytes};
  }
  // Ramas de la colección o de una subcolección: el índice baja por niveles sin leer otras colecciones.
  function filasDelAmbito(leerT,ramaInicio) {
    const porRama=new Map(), cola=ramaInicio?[ramaInicio]:[];
    while(cola.length) { const r=cola.shift(); if(porRama.has(r)) continue; const filas=leerT('colecciones',{rama:r}); porRama.set(r,filas); for(const f of filas) if(f.rama&&f.vigencia==='vigente') cola.push(f.rama); }
    return porRama;
  }
  function ambitoDe(c,{elemento,rama}) {
    if(!elemento&&!rama) return {fila:c,rel:'',rama:c.rama||undefined,ramaFila:undefined,raiz:true};
    let ref=elemento;
    if(!ref) { const hallado=[...filasDelAmbito(tablas.leer,c.rama)].flatMap(([,filas])=>filas).find(f=>f.rama===rama&&f.vigencia==='vigente'); if(!hallado) throw new Error('La rama no pertenece a la colección'); ref=hallado.id; }
    const r=tablas.elemento({coleccion:c.id,elemento:ref});
    if(r.elemento.clase!=='subcoleccion'||ubicacionHijo(r.elemento)!=='relativa') throw new Error('El ámbito debe ser una subcolección relativa a la raíz de su colección');
    return {fila:r.elemento,rel:normal(r.elemento.direccion),rama:r.elemento.rama||undefined,ramaFila:r.rama,raiz:false};
  }
  function localizador(c,f) {
    const u=f===c?ubicacionRaiz(c):ubicacionHijo(f);
    if(u==='enlace') return {tipo:'enlace',valor:f.direccion};
    if(f===c||u!=='relativa') return {tipo:'ruta',valor:local(u==='absoluta'?'local':u,f.direccion)};
    const base=dirColeccion(c); if(!base) throw new Error('Un elemento relativo no se resuelve bajo un enlace');
    return {tipo:'ruta',valor:join(base,...normal(f.direccion).split('/')),base};
  }
  return {
    prepararUbicacion,comprobarUbicacion,comprobarSolicitud,registrarEnOperacion,
    preparar({proyecto:ref,coleccion={},idPedido,confirmadoPorPersona=false}={}) {
      if(confirmadoPorPersona!==true)throw new Error('Preparar una colección requiere confirmadoPorPersona: true');
      return tablas.exclusivo(()=>{
        const ps=tablas.leer('proyectos').filter(p=>p.tipo==='proyecto'&&p.vigencia==='vigente'&&p.estado!=='terminado'&&(p.id===ref||p.nombre===ref));
        const p=ps.find(p=>p.id===ref)??(ps.length===1?ps[0]:null);
        if(!p)throw new Error('Proyecto inexistente, terminado o ambiguo');
        const pendiente=tablas.operacionesPendientes().find(o=>o.tipo==='coleccion'&&o.datos?.proyecto===p.id);
        const pedido=idPedido??pendiente?.idPedido??'coleccion-'+randomUUID();
        const r=tablas.operacion({idPedido:pedido,tipo:'coleccion',datos:{proyecto:p.id,coleccion}},ctx=>{
          const existentes=ctx.leer('colecciones').filter(c=>c.clase==='coleccion'&&c.proyecto===p.id&&c.vigencia==='vigente');
          if(existentes.length>1)throw new Error('Proyecto con varias colecciones raíz; resolver la asignación');
          const existente=existentes[0];
          if(existente) { comprobarSolicitud(existente,coleccion);comprobarUbicacion(existente);const ubicacion={modo:'existente',ubicacion:existente.ubicacion,direccion:existente.direccion,disponibilidad:existente.disponibilidad};if(!existente.rama){const {rama}=ctx.abrirRama('colecciones',existente.id,{confirmadoPorPersona:true});return {proyecto:p,coleccion:{...existente,rama},ubicacion,repetido:true};}return {proyecto:p,coleccion:existente,ubicacion,repetido:true}; }
          const u=prepararUbicacion(ctx,coleccion,p.nombre),c=registrarEnOperacion(ctx,p,coleccion,u);
          return {proyecto:p,coleccion:c,ubicacion:u};
        });return {...r.resultado,recibo:r.recibo};
      });
    },
    buscar({coleccion:ref,rama,texto='',limite=10,vigente=true}={}) {
      const c=raiz(ref),permitidas=new Set(),cola=c.rama?[c.rama]:[];
      // Solo consulta las ramas de esta colección; no lee archivos físicos ni otras colecciones.
      while(cola.length) { const r=cola.shift();if(permitidas.has(r))continue;permitidas.add(r);for(const f of tablas.leer('colecciones',{rama:r}))if(f.rama&&f.vigencia==='vigente')cola.push(f.rama); }
      if(rama&&!permitidas.has(rama))throw new Error('La rama no pertenece a la colección');
      const ambitos=rama?[rama]:[...permitidas];
      if(!Number.isInteger(limite)||limite<1||limite>50)throw new Error('Límite permitido: 1–50');
      const filas=ambitos.flatMap(r=>buscar({leer:()=>tablas.leer('colecciones',{rama:r}).filter(f=>f.coleccion===c.id)},{tabla:'colecciones',texto,limite,vigente}).map(f=>({...f,rama:r})));
      // Al juntar ramas se usa el mismo orden que Buscar, para no perder el desempate por nombre literal.
      return {coleccion:c.id,filas:filas.sort(compararResultados(texto)).slice(0,limite)};
    },
    // Inventario por metadatos de la colección o de una subcolección. Conserva IDs por dirección relativa,
    // marca ausente solo lo que falta en una carpeta leída completa y propone revincular, sin fusionar por parecido.
    indexar({coleccion:ref,elemento,rama,profundidad,maximo=ENTRADAS_MAXIMAS,revincular=[],confirmadoPorPersona=false,idPedido}={}) {
      if(profundidad!==undefined&&(!Number.isInteger(profundidad)||profundidad<1||profundidad>PROFUNDIDAD_MAXIMA)) throw new Error('profundidad permitida: 1–'+PROFUNDIDAD_MAXIMA);
      if(!Number.isInteger(maximo)||maximo<1||maximo>200000) throw new Error('maximo permitido: 1–200000');
      if(!Array.isArray(revincular)) throw new Error('revincular debe ser una lista {elemento, direccion}');
      if(revincular.length&&confirmadoPorPersona!==true) throw new Error('Revincular requiere confirmadoPorPersona: true');
      const origenes=new Set(),destinos=new Set();
      for(const v of revincular) {
        if(!v||typeof v.elemento!=='string'||typeof v.direccion!=='string') throw new Error('revincular debe ser una lista {elemento, direccion} válidos');
        if(!esRelativaSegura(v.direccion)) throw new Error('La nueva dirección no es un archivo observado del ámbito: '+v.direccion);
        const destino=claveRuta(normal(v.direccion));
        if(origenes.has(v.elemento)||destinos.has(destino)) throw decidir('REVINCULAR_AMBIGUO','Revincular necesita elementos y destinos únicos; no se escribió nada','Corregir las referencias repetidas antes de repetir el pedido.');
        origenes.add(v.elemento);destinos.add(destino);
      }
      return tablas.exclusivo(()=>{
        const c=raiz(ref);
        if(ubicacionRaiz(c)==='enlace') throw decidir('INDEXAR_ENLACE','Una colección por enlace no se inventaría: Mind no accede al proveedor remoto','Registrar sus elementos con registrarEnlace, o vincular una carpeta local o sincronizada.');
        const pendientes=tablas.operacionesPendientes().filter(o=>o.datos?.coleccion===c.id);
        if(pendientes.some(o=>o.tipo==='reubicar')) throw decidir('REUBICACION_PENDIENTE','La colección tiene una reubicación pendiente','Reanudar o resolver la reubicación antes de inventariar.');
        const datos={coleccion:c.id,elemento:elemento??null,rama:rama??null,profundidad:profundidad??null};
        const pedido=idPedido??pendientes.find(o=>o.tipo==='indexar'&&JSON.stringify(o.datos)===JSON.stringify(datos))?.idPedido??'indexar-'+randomUUID();
        const r=tablas.operacion({idPedido:pedido,tipo:'indexar',datos},ctx=>{
          const base=dirColeccion(c), ambito=ambitoDe(c,{elemento,rama}), ahora=new Date().toISOString();
          const dir=ambito.rel?join(base,...ambito.rel.split('/')):base, vista=observar(dir,'carpeta',base);
          if(vista.disponibilidad!=='disponible') throw decidir('AMBITO_INACCESIBLE','La carpeta del ámbito no está disponible ('+vista.disponibilidad+'): '+dir,'Comprobar la carpeta, vincularla o reubicar la colección. No se marcó nada como ausente.',{observada:vista});
          const fisico=recorrer(dir,{rel:ambito.rel,profundidad:profundidad??PROFUNDIDAD_MAXIMA,maximo,metadatos:true});
          const entradas=new Map([...fisico.entradas.values()].map(e=>[claveRuta(e.rel),e]));
          const omitidosK=new Set(fisico.omitidos.map(o=>claveRuta(o.direccion))), presentesK=new Set([...fisico.presentes].map(claveRuta)), listadasK=new Set([...fisico.listadas].map(claveRuta));
          // Índice vigente del ámbito, por dirección relativa y clase.
          const indice=new Map(), porId=new Map();
          for(const [rx,filas] of filasDelAmbito(ctx.leer,ambito.rama)) for(const f of filas) {
            if(f.vigencia!=='vigente') continue; porId.set(f.id,{fila:f,rama:rx});
            if(!['subcoleccion','elemento'].includes(f.clase)||ubicacionHijo(f)!=='relativa') continue;
            const k=claveRuta(normal(f.direccion))+'|'+f.clase; if(!indice.has(k)) indice.set(k,[]); indice.get(k).push({fila:f,rama:rx});
          }
          const cambios=[], resumen={nuevos:0,actualizados:0,modificados:0,completados:0,reaparecidos:0,ausentes:0,sinAcceso:0,sinCambios:0,ramasNuevas:0,revinculados:0,movidos:0}, nuevosLista=[], ausentesLista=[], modificadosLista=[], avisos=[], tratados=new Set(), ambiguos=new Set();
          // Qué fila representa cada archivo observado y qué archivos disponibles comparten tamaño y fecha.
          const filaDeEntrada=new Map(), porFirma=new Map(), firma=(t,m)=>t&&m?t+'|'+m:null;
          const anotarFirma=(k,dato)=>{ if(!k) return; if(!porFirma.has(k)) porFirma.set(k,[]); porFirma.get(k).push(dato); };
          // El ámbito se registra como comprobado; si no tenía rama, la abre para sus hijos.
          const carpetas=new Map([[claveRuta(ambito.rel),{id:ambito.fila.id,nombre:ambito.fila.nombre,ramaFila:ambito.ramaFila,rama:ambito.rama,cambio:null}]]);
          cambios.unshift({id:ambito.fila.id,rama:ambito.ramaFila,datos:{disponibilidad:'disponible',comprobado:ahora}});
          const ocupadas=new Set(tablas.ramas('colecciones'));
          const ramaPara=info=>{
            if(info.rama) return info.rama;
            let slug; for(const largo of [6,10,16,24]) { slug=nombreRama('colecciones',info.ramaFila,info.id,info.nombre,largo); if(!ocupadas.has(slug)) break; }
            ocupadas.add(slug); info.rama=slug; resumen.ramasNuevas++;
            if(info.cambio) info.cambio.datos.rama=slug; else cambios.push({id:info.id,rama:info.ramaFila,datos:{rama:slug}});
            return slug;
          };
          for(const e of fisico.entradas.values()) {
            const padre=carpetas.get(claveRuta(e.padre));
            if(!padre) continue; // Su carpeta es ambigua en el índice: se informa abajo y no se adivina.
            const clase=e.tipo==='carpeta'?'subcoleccion':'elemento', k=claveRuta(e.rel)+'|'+clase, hallados=indice.get(k)??[];
            if(hallados.length>1) { ambiguos.add(k); avisos.push('Varias filas vigentes con la dirección '+e.rel+'; requiere decisión'); continue; }
            let info;
            const metadatos=e.tamano!==undefined?{tamano:e.tamano,modificado:e.modificado}:{};
            if(hallados.length===1) {
              const {fila:x,rama:rx}=hallados[0], d={};
              tratados.add(x.id);
              if(x.disponibilidad!=='disponible') { d.disponibilidad='disponible'; d.comprobado=ahora; resumen.reaparecidos++; }
              if(normal(x.direccion)!==e.rel) { d.direccion=e.rel; if(x.nombre===basename(normal(x.direccion))) d.nombre=e.nombre; resumen.actualizados++; }
              // Tamaño o fecha distintos: el contenido cambió. Si la fila aún no los tenía, solo se completan.
              if(clase==='elemento'&&metadatos.tamano!==undefined) {
                if(!x.tamano&&!x.modificado) { Object.assign(d,metadatos); resumen.completados++; }
                else if(x.tamano!==metadatos.tamano||x.modificado!==metadatos.modificado) { Object.assign(d,metadatos,{comprobado:ahora}); resumen.modificados++; modificadosLista.push({id:x.id,direccion:e.rel,antes:{tamano:x.tamano||null,modificado:x.modificado||null},ahora:metadatos}); }
              }
              if(Object.keys(d).length) cambios.push({id:x.id,rama:rx,datos:d}); else resumen.sinCambios++;
              info={id:x.id,nombre:x.nombre,ramaFila:rx,rama:x.rama||undefined,cambio:null};
            } else {
              const ramaDestino=ramaPara(padre), clave='i-'+createHash('sha256').update(ramaDestino+'|'+claveRuta(e.rel)+'|'+clase).digest('hex').slice(0,24);
              const cambio={nuevo:true,clave,id:tablas.idDePedido('colecciones/'+ramaDestino,ctx.idPedido+':'+clave),rama:ramaDestino,datos:{clase,nombre:e.nombre,direccion:e.rel,ubicacion:'relativa',disponibilidad:'disponible',comprobado:ahora,...metadatos}};
              cambios.push(cambio); resumen.nuevos++; nuevosLista.push({id:cambio.id,clase,nombre:e.nombre,direccion:e.rel});
              info={id:cambio.id,nombre:e.nombre,ramaFila:ramaDestino,rama:undefined,cambio};
            }
            filaDeEntrada.set(k,{id:info.id,rama:info.ramaFila,cambio:info.cambio});
            if(clase==='elemento') anotarFirma(firma(metadatos.tamano,metadatos.modificado),{id:info.id,direccion:e.rel});
            if(clase==='subcoleccion') carpetas.set(claveRuta(e.rel),info);
          }
          // Revincular, por decisión de la persona: el elemento ausente conserva su ID en la nueva dirección.
          // Si está en otra carpeta, su fila pasa a la rama de esa carpeta y la anterior queda retirada en el historial.
          const usados=revincular.length?new Set(tablas.leer('proyectos').filter(p=>p.vigencia==='vigente').flatMap(p=>(p.elementosUsados??[]).map(u=>typeof u==='string'?u:u.coleccion+'/'+u.elemento))):new Set();
          for(const v of revincular) {
            const x=porId.get(v?.elemento), nueva=normal(v?.direccion??'');
            if(!x||x.fila.clase!=='elemento'||ubicacionHijo(x.fila)!=='relativa') throw new Error('Revincular admite elementos relativos vigentes del ámbito: '+v?.elemento);
            const e=entradas.get(claveRuta(nueva)), anterior=normal(x.fila.direccion);
            if(!esRelativaSegura(nueva)||!e||e.tipo!=='archivo') throw new Error('La nueva dirección no es un archivo observado del ámbito: '+nueva);
            // El lote pudo completarse durante la recuperación: repetir la misma referencia ya aplicada es inocuo.
            if(claveRuta(anterior)===claveRuta(nueva)) { tratados.add(x.fila.id); continue; }
            if(entradas.get(claveRuta(anterior))?.tipo==='archivo') throw new Error('El archivo original sigue presente; no es un renombre');
            const destino=filaDeEntrada.get(claveRuta(nueva)+'|elemento');
            if(!destino) throw new Error('La carpeta de la nueva dirección no está en el índice: inventaríala antes de revincular');
            if(destino.id===x.fila.id) { tratados.add(x.fila.id); continue; }
            if(destino.cambio) { cambios.splice(cambios.indexOf(destino.cambio),1); resumen.nuevos--; nuevosLista.splice(nuevosLista.findIndex(n=>n.id===destino.id),1); }
            else {
              if(usados.has(c.id+'/'+destino.id)) throw decidir('REVINCULAR_REFERENCIADO','La fila que ocupa '+nueva+' ya la usa un frente: '+destino.id,'Decidir con la persona cuál identidad conservar; no se retira una referencia en uso.');
              cambios.push({id:destino.id,rama:destino.rama,datos:{vigencia:'reemplazada'}});
            }
            const datos={direccion:e.rel,disponibilidad:'disponible',comprobado:ahora,...(e.tamano!==undefined?{tamano:e.tamano,modificado:e.modificado}:{}),...(x.fila.nombre===basename(anterior)?{nombre:e.nombre}:{})};
            if(destino.rama===x.rama) cambios.push({id:x.fila.id,rama:x.rama,datos});
            else {
              const {id,fecha,padre,coleccion,vigencia,rama:_rama,...resto}=x.fila;
              cambios.push({id,rama:x.rama,datos:{vigencia:'reemplazada'}});
              cambios.push({nuevo:true,id,clave:'m-'+createHash('sha256').update(id+'|'+destino.rama).digest('hex').slice(0,24),rama:destino.rama,datos:{...resto,...datos}});
              resumen.movidos++;
            }
            filaDeEntrada.set(claveRuta(nueva)+'|elemento',{id:x.fila.id,rama:destino.rama,cambio:null});
            tratados.add(x.fila.id); resumen.revinculados++;
          }
          // Ausencias: solo en carpetas leídas completas. Lo presente como enlace u otro tipo no se da por desaparecido.
          for(const [k,lista] of indice) for(const {fila:x,rama:rx} of lista) {
            if(tratados.has(x.id)||ambiguos.has(k)) continue;
            const d=normal(x.direccion); if(!listadasK.has(claveRuta(carpetaDe(d)))) continue;
            if(entradas.get(claveRuta(d))?.tipo===(x.clase==='elemento'?'archivo':'carpeta')) continue; // Presente, aunque su carpeta sea ambigua.
            let disp='ausente';
            if(presentesK.has(claveRuta(d))) { if(omitidosK.has(claveRuta(d))) disp='sin-acceso'; else if(!entradas.has(claveRuta(d))) continue; }
            if(x.disponibilidad===disp) continue;
            cambios.push({id:x.id,rama:rx,datos:{disponibilidad:disp,comprobado:ahora}});
            if(disp==='ausente') { resumen.ausentes++; ausentesLista.push({id:x.id,clase:x.clase,nombre:x.nombre,direccion:x.direccion}); } else resumen.sinAcceso++;
          }
          // Posibles renombres o movimientos externos: se proponen, nunca se fusionan.
          // Fuerte: otro archivo del ámbito con el mismo tamaño y la misma fecha. Débil: archivo nuevo de su carpeta con su extensión.
          const propuestas=[];
          for(const [k,lista] of indice) for(const {fila:x} of lista) {
            if(tratados.has(x.id)||ambiguos.has(k)||x.clase!=='elemento') continue;
            const d=normal(x.direccion), carpeta=claveRuta(carpetaDe(d));
            if(!listadasK.has(carpeta)||entradas.has(claveRuta(d))) continue;
            const fuertes=(porFirma.get(firma(x.tamano,x.modificado))??[]).filter(n=>n.id!==x.id);
            const candidatos=fuertes.length?fuertes:nuevosLista.filter(n=>n.clase==='elemento'&&claveRuta(carpetaDe(n.direccion))===carpeta&&extname(n.direccion).toLowerCase()===extname(d).toLowerCase());
            const coincidencia=fuertes.length?'fuerte':'debil';
            if(candidatos.length) propuestas.push({elemento:x.id,direccion:x.direccion,coincidencia,candidatos:candidatos.slice(0,5).map(n=>({id:n.id,direccion:n.direccion,coincidencia})),total:candidatos.length});
          }
          const escrito=ctx.lote('colecciones',cambios,{confirmadoPorPersona});
          return {
            coleccion:c.id,ambito:{elemento:ambito.raiz?null:ambito.fila.id,direccion:ambito.rel||'.',ruta:dir,profundidad:profundidad??null},comprobado:ahora,
            observados:{carpetas:[...fisico.entradas.values()].filter(e=>e.tipo==='carpeta').length,archivos:[...fisico.entradas.values()].filter(e=>e.tipo==='archivo').length,carpetasLeidas:fisico.listadas.size},
            ...resumen,escritos:escrito.escritos,
            nuevosMuestra:nuevosLista.slice(0,MUESTRA),ausentesMuestra:ausentesLista.slice(0,MUESTRA),modificadosMuestra:modificadosLista.slice(0,MUESTRA),
            errores:acotar(fisico.errores),omitidos:acotar(fisico.omitidos),avisos:acotar(avisos),
            ...(propuestas.length?{revincular:{necesitaDecision:true,decision:'Posible renombre o movimiento externo: confirmar con la persona y repetir indexar con revincular [{elemento, direccion}]. Una coincidencia fuerte (mismo tamaño y fecha) no es una certeza. No se fusionó nada.',propuestas:propuestas.slice(0,MUESTRA),total:propuestas.length}}:{}),
            contenido:'No se abrió ni copió contenido: solo nombres, tipos, tamaño y fecha del sistema de archivos.',
          };
        });
        return {...r.resultado,recibo:reciboBreve(r.recibo)};
      });
    },
    // Localizador efectivo y disponibilidad observada ahora mismo, sin escribir en el índice ni abrir contenido.
    resolver({coleccion:ref,elemento}={}) {
      const c=raiz(ref), r=elemento?tablas.elemento({coleccion:c.id,elemento}):{coleccion:c,elemento:c,rama:undefined}, f=r.elemento;
      const u=f===c?ubicacionRaiz(c):ubicacionHijo(f), sincronizada=ubicacionRaiz(c)==='sincronizada'&&(f===c||u==='relativa');
      const salida={coleccion:c.id,elemento:f===c?null:f.id,clase:f.clase||'coleccion',nombre:f.nombre,ubicacion:u,registrada:{disponibilidad:f.disponibilidad||'no-comprobada',comprobado:f.comprobado||null}};
      let loc;
      try { loc=localizador(c,f); } catch(e) { return {...salida,localizador:null,observada:{disponibilidad:'sin-acceso',motivo:e.message,fecha:new Date().toISOString()},necesitaDecision:Boolean(e.necesitaDecision),...(e.decision?{decision:e.decision}:{})}; }
      if(loc.tipo==='enlace') return {...salida,localizador:{tipo:'enlace',valor:loc.valor},observada:{disponibilidad:'no-comprobada',motivo:'Mind no accedió al recurso remoto: no comprueba existencia, permisos ni sincronización.',fecha:new Date().toISOString()},comprobacion:'sin-acceso-remoto',apertura:'requiere-acceso-remoto'};
      const esperado=f.clase==='elemento'?'archivo':'carpeta', obs=observar(loc.valor,esperado,loc.base??null);
      const resultado={...salida,localizador:{tipo:'ruta',valor:loc.valor},observada:obs,comprobacion:'metadatos-locales',
        apertura:sincronizada?'puede-requerir-descarga':'local',...(sincronizada?{nota:'Carpeta sincronizada: se comprobó la entrada local; abrir el contenido puede requerir que el proveedor lo descargue.'}:{}),
        indiceDesactualizado:obs.disponibilidad!==(f.disponibilidad||'no-comprobada')};
      // Un elemento ausente con archivos sin indexar en su carpeta pide revincular; no se elige uno por parecido.
      // Mismo tamaño y fecha: coincidencia fuerte, y solo se proponen esos. Si no, los de su misma extensión.
      if(obs.disponibilidad==='ausente'&&f.clase==='elemento'&&u==='relativa'&&r.rama) {
        const carpeta=dirname(loc.valor), prefijo=carpetaDe(normal(f.direccion))?carpetaDe(normal(f.direccion))+'/':'';
        const conocidos=new Set(tablas.leer('colecciones',{rama:r.rama}).filter(x=>x.vigencia==='vigente').map(x=>claveRuta(basename(normal(x.direccion)))));
        let lista=[]; try { lista=archivos.readdirSync(carpeta,{withFileTypes:true}); } catch {}
        const libres=lista.filter(d=>(d.isFile()||d.isSymbolicLink())&&!conocidos.has(claveRuta(d.name)));
        // Una coincidencia fuerte cuenta aunque ese archivo ya tenga su propia fila (un inventario posterior al renombre).
        const fuertes=f.tamano&&f.modificado?lista.filter(d=>(d.isFile()||d.isSymbolicLink())&&claveRuta(d.name)!==claveRuta(basename(normal(f.direccion)))).filter(d=>{ try { const e=archivos.lstatSync(join(carpeta,d.name)); return e.isFile()&&String(e.size)===f.tamano&&new Date(e.mtimeMs).toISOString()===f.modificado; } catch { return false; } }):[];
        const debiles=libres.filter(d=>d.isFile()&&extname(d.name).toLowerCase()===extname(f.direccion).toLowerCase());
        const coincidencia=fuertes.length?'fuerte':'debil', candidatos=(fuertes.length?fuertes:debiles).slice(0,5).map(d=>({direccion:prefijo+d.name,coincidencia}));
        if(candidatos.length) resultado.revincular={necesitaDecision:true,coincidencia,candidatos,decision:'Posible renombre externo: confirmar con la persona y usar indexar con revincular. Una coincidencia fuerte no es una certeza; no se fusionó nada.'};
      }
      return resultado;
    },
    // Guarda metadatos y URL o identificador. No descarga, no conecta proveedores y no afirma existencia ni acceso.
    registrarEnlace({coleccion:ref,dentroDe,nombre,direccion,descripcion,confirmadoPorPersona=false,idPedido}={}) {
      if(typeof nombre!=='string'||!nombre.trim()) throw new Error('El enlace necesita nombre');
      if(descripcion!==undefined&&typeof descripcion!=='string') throw new Error('Descripción inválida');
      if(typeof direccion!=='string'||!esEnlace(direccion)||esAbsoluta(direccion)) throw decidirUbicacion('Un enlace necesita URL o identificador «esquema:valor»');
      if(ESQUEMAS_PROHIBIDOS.has(direccion.slice(0,direccion.indexOf(':')).toLowerCase())) throw decidirUbicacion('Ese esquema no se registra como enlace; una ruta local se indexa desde su carpeta');
      return tablas.exclusivo(()=>{
        const c=raiz(ref); let padre=c, ramaFila;
        if(dentroDe) { const r=tablas.elemento({coleccion:c.id,elemento:dentroDe}); if(r.elemento.clase!=='subcoleccion') throw new Error('dentroDe debe ser una subcolección'); padre=r.elemento; ramaFila=r.rama; }
        const estado={disponibilidad:'no-comprobada',nota:'Registrar un enlace no comprueba existencia, acceso ni sincronización; Mind no descargó nada.'};
        const ya=padre.rama?tablas.leer('colecciones',{rama:padre.rama}).find(f=>f.vigencia==='vigente'&&f.clase==='elemento'&&f.ubicacion==='enlace'&&f.direccion===direccion):null;
        if(ya) return {coleccion:c.id,elemento:ya,rama:padre.rama,repetido:true,estado};
        const r=tablas.operacion({idPedido:idPedido??'enlace-'+randomUUID(),tipo:'registrarEnlace',datos:{coleccion:c.id,dentroDe:dentroDe??null,direccion}},ctx=>{
          const rama=padre.rama||ctx.abrirRama('colecciones',padre.id,{rama:ramaFila,confirmadoPorPersona}).rama;
          const e=ctx.alta('colecciones',{clase:'elemento',nombre,direccion,ubicacion:'enlace',disponibilidad:'no-comprobada',...(descripcion?{descripcion}:{})},{rama,clave:'enlace'});
          return {coleccion:c.id,elemento:e,rama};
        });
        return {...r.resultado,estado,recibo:r.recibo};
      });
    },
    reubicar(op={}) { return reubicar(op); },
  };
  function reciboBreve(recibo) {
    const escritos=recibo.escritos??[];
    return {...recibo,escritos:escritos.slice(0,MUESTRA),escritosTotal:escritos.length};
  }
  // Reubicar: plan → destino → copia (temporal y renombre) → verificación SHA-256 → nueva raíz con los mismos IDs.
  // Cada etapa queda en el diario de la operación; el original no se toca y no se adopta un destino ajeno.
  function reubicar({coleccion:ref,destino,modo,confirmadoPorPersona=false,permitirDescarga=false,idPedido,cancelar=false}={}) {
    if(confirmadoPorPersona!==true) throw new Error('Reubicar una colección requiere confirmadoPorPersona: true');
    // Abandonar una reubicación pendiente: la raíz sigue en el original; la copia parcial se conserva para que la persona decida.
    if(cancelar===true) return tablas.exclusivo(()=>{
      const c=raiz(ref), pendiente=tablas.operacionesPendientes().find(o=>o.tipo==='reubicar'&&o.datos?.coleccion===c.id);
      if(!pendiente) return {coleccion:c.id,cancelada:false,motivo:'No hay reubicación pendiente'};
      const plan=pendiente.pasos?.plan;
      if(plan&&c.direccion===plan.destino.direccion&&ubicacionRaiz(c)===plan.destino.ubicacion) throw decidir('REUBICACION_APLICADA','La raíz ya apunta al destino verificado; no se cancela','Reanudar la reubicación para cerrarla.');
      const r=tablas.descartarOperacion({idPedido:pendiente.idPedido,confirmadoPorPersona:true});
      return {coleccion:c.id,cancelada:r.descartada,raiz:{ubicacion:ubicacionRaiz(c),direccion:c.direccion},...(plan?{destinoConservado:plan.destino,nota:'Mind no borra la copia parcial; la persona decide qué hacer con ella.'}:{})};
    });
    if(!destino||typeof destino!=='object'||Array.isArray(destino)) throw decidirUbicacion('destino debe ser un objeto con la nueva ubicación');
    if(modo!==undefined&&!['copiar','vincular'].includes(modo)) throw new Error('modo permitido: copiar o vincular');
    return tablas.exclusivo(()=>{
      const c=raiz(ref), uO=ubicacionRaiz(c);
      const pendiente=tablas.operacionesPendientes().find(o=>o.tipo==='reubicar'&&o.datos?.coleccion===c.id);
      if(pendiente&&(idPedido&&idPedido!==pendiente.idPedido||JSON.stringify(pendiente.datos.destino)!==JSON.stringify(destino)||(pendiente.datos.modo??null)!==(modo??null))) throw decidir('REUBICACION_PENDIENTE','La colección tiene una reubicación pendiente hacia otro destino','Reanudarla con el mismo destino y modo, o resolverla antes de pedir otra.',{pendiente:{idPedido:pendiente.idPedido,destino:pendiente.datos.destino,modo:pendiente.datos.modo}});
      const r=tablas.operacion({idPedido:idPedido??pendiente?.idPedido??'reubicar-'+randomUUID(),tipo:'reubicar',datos:{coleccion:c.id,destino,modo:modo??null}},ctx=>{
        // El plan se guarda en el diario justo antes del primer efecto: un rechazo previo no deja operación pendiente.
        const plan=ctx.paso('plan')??planificar(c,uO,destino,modo);
        if(!ctx.paso('plan')&&plan.repetido) return {coleccion:c.id,repetido:true,destino:{ubicacion:uO,direccion:c.direccion},idsConservados:true};
        const avisos=absolutosDentro(c,plan);
        if(plan.modo==='vincular') return vincular(ctx,c,plan,avisos);
        return copiar(ctx,c,plan,avisos,permitirDescarga);
      });
      return {...r.resultado,recibo:r.recibo};
    });
  }
  function planificar(c,uO,destino,modo) {
    const uD=destino.ubicacion??'local';
    if(!UBICACIONES.coleccion.includes(uD)) throw decidirUbicacion('Ubicación inválida: '+uD+'; elige local, sincronizada, enlace o mind');
    if(destino.base&&destino.direccion) throw decidirUbicacion('Se indicaron base y dirección a la vez; elige una ubicación');
    const m=modo??(uD==='enlace'||uO==='enlace'?'vincular':'copiar'), origen={ubicacion:uO,direccion:c.direccion};
    if(uD==='enlace') {
      if(uO!=='enlace') throw decidir('REUBICAR_A_ENLACE','Mind no sube archivos ni comprueba un proveedor remoto; los elementos relativos no se resolverían bajo un enlace','Conservar la colección local o sincronizada y registrar enlaces por elemento con registrarEnlace.');
      if(m!=='vincular'||typeof destino.direccion!=='string'||!esEnlace(destino.direccion)||esAbsoluta(destino.direccion)) throw decidirUbicacion('Un enlace se vincula con modo vincular y una URL o identificador');
      return {modo:'vincular',origen,destino:{ubicacion:'enlace',direccion:destino.direccion},repetido:destino.direccion===c.direccion};
    }
    if(uO==='enlace'&&m==='copiar') throw decidir('ORIGEN_REMOTO','Copiar desde un enlace exigiría descargar del proveedor; Mind no descarga ni conecta cuentas','Descargar la carpeta con el proveedor y vincularla con modo vincular.');
    const dirO=uO==='enlace'?null:dirColeccion(c), nombre=dirO?basename(dirO):nombreCarpeta(c.nombre,c.id);
    let direccion;
    if(m==='vincular') { if(!destino.direccion||destino.base) throw decidirUbicacion('Vincular necesita la dirección de la carpeta existente'); direccion=destino.direccion; }
    else if(uD==='mind') { if(destino.base) throw decidirUbicacion('Dentro de Mind no se indica base externa'); direccion=destino.direccion??'Colecciones/'+nombre; }
    else if(destino.direccion) direccion=destino.direccion;
    else if(destino.base) { carpeta(local(uD,destino.base)); direccion=join(destino.base,nombre); }
    else throw decidirUbicacion('Indica base o dirección de destino');
    const dirD=local(uD,direccion);
    if(dirO&&mismaRuta(dirD,dirO)) return {modo:m,origen,destino:{ubicacion:uD,direccion},repetido:true};
    if(dirO&&m==='copiar'&&(dentroDe(dirD,dirO)||dentroDe(dirO,dirD))) throw decidirUbicacion('El destino no puede estar dentro del origen ni contenerlo');
    return {modo:m,origen,destino:{ubicacion:uD,direccion}};
  }
  // Localizadores absolutos o de Mind no cambian con la raíz: se informan para que nadie crea que se movieron.
  function absolutosDentro(c,plan) {
    const dirO=plan.origen.ubicacion==='enlace'?null:local(plan.origen.ubicacion,plan.origen.direccion), avisos=[];
    if(!dirO) return avisos;
    for(const [,filas] of filasDelAmbito(tablas.leer,c.rama)) for(const f of filas) {
      if(f.vigencia!=='vigente'||!['absoluta','mind'].includes(ubicacionHijo(f))) continue;
      const p=ubicacionHijo(f)==='mind'?join(memoria,f.direccion):f.direccion;
      if(dentroDe(p,dirO)) avisos.push('El elemento '+f.id+' tiene localizador '+ubicacionHijo(f)+' y sigue apuntando al original: '+f.direccion);
    }
    return avisos;
  }
  function nuevaRaiz(ctx,c,plan,disponibilidad,comprobado) {
    if(!ctx.paso('plan')) ctx.marcar('plan',plan);
    const fila=ctx.actualizar('colecciones',c.id,{ubicacion:plan.destino.ubicacion,direccion:plan.destino.direccion,disponibilidad,comprobado});
    return {id:fila.id,nombre:fila.nombre,proyecto:fila.proyecto,ubicacion:fila.ubicacion,direccion:fila.direccion,disponibilidad:fila.disponibilidad,comprobado:fila.comprobado,rama:fila.rama};
  }
  function vincular(ctx,c,plan,avisos) {
    if(plan.destino.ubicacion==='enlace') {
      const raizNueva=nuevaRaiz(ctx,c,plan,'no-comprobada','');
      return {coleccion:raizNueva,modo:'vincular',origen:{...plan.origen,conservado:true},destino:plan.destino,verificacion:{contenido:'no-comprobado',motivo:'Mind no accede al proveedor remoto'},idsConservados:true,avisos};
    }
    const dirD=local(plan.destino.ubicacion,plan.destino.direccion); carpeta(dirD);
    const dirO=plan.origen.ubicacion==='enlace'?null:local(plan.origen.ubicacion,plan.origen.direccion);
    const origenLocal=dirO&&observar(dirO,'carpeta').disponibilidad==='disponible';
    // Cada elemento relativo disponible debe estar en el destino con su tipo; si el original sigue y nada es sincronizado, se comparan contenidos.
    const comparar=origenLocal&&plan.origen.ubicacion!=='sincronizada'&&plan.destino.ubicacion!=='sincronizada', faltantes=[], distintos=[]; let revisados=0;
    for(const [,filas] of filasDelAmbito(tablas.leer,c.rama)) for(const f of filas) {
      if(f.vigencia!=='vigente'||ubicacionHijo(f)!=='relativa'||f.disponibilidad==='ausente'||!['subcoleccion','elemento'].includes(f.clase)) continue;
      const partes=normal(f.direccion).split('/'), obs=observar(join(dirD,...partes),f.clase==='elemento'?'archivo':'carpeta',dirD); revisados++;
      if(obs.disponibilidad!=='disponible') { faltantes.push(f.direccion); continue; }
      if(comparar&&f.clase==='elemento'&&observar(join(dirO,...partes),'archivo',dirO).disponibilidad==='disponible'&&hashArchivo(join(dirO,...partes)).sha256!==hashArchivo(join(dirD,...partes)).sha256) distintos.push(f.direccion);
    }
    if(faltantes.length||distintos.length) throw decidir('VINCULAR_INCOMPLETO','El destino no contiene igual todos los elementos indexados; la raíz no cambió','Completar la carpeta de destino o elegir otra; el original no se modificó.',{faltantes:acotar(faltantes),distintos:acotar(distintos)});
    const raizNueva=nuevaRaiz(ctx,c,plan,'disponible',new Date().toISOString());
    return {coleccion:raizNueva,modo:'vincular',origen:{...plan.origen,conservado:true},destino:plan.destino,verificacion:{elementos:revisados,contenido:comparar?'SHA-256 coincidente con el original':'no comparado (original ausente, remoto o sincronizado)'},idsConservados:true,avisos};
  }
  function copiar(ctx,c,plan,avisos,permitirDescarga) {
    if(plan.origen.ubicacion==='sincronizada'&&permitirDescarga!==true) throw decidir('DESCARGA_NO_AUTORIZADA','Copiar desde una carpeta sincronizada lee su contenido y puede hacer que el proveedor descargue archivos solo en línea','Confirmar permitirDescarga: true con la persona, o mover la carpeta por su cuenta y usar modo vincular.');
    const dirO=local(plan.origen.ubicacion,plan.origen.direccion), dirD=local(plan.destino.ubicacion,plan.destino.direccion);
    if(observar(dirO,'carpeta').disponibilidad!=='disponible') throw decidir('ORIGEN_INACCESIBLE','La carpeta de origen no está disponible: '+dirO,'Comprobar el original o vincular una copia existente con modo vincular.');
    const fuente=recorrer(dirO,{maximo:200000});
    if(fuente.errores.length||fuente.omitidos.length) throw decidir('ORIGEN_INCOMPLETO','El origen tiene partes que no se pueden copiar completas; no se cambió la raíz','Resolver los accesos o enlaces indicados; el original no se modificó.',{errores:acotar(fuente.errores),omitidos:acotar(fuente.omitidos)});
    const lista=[...fuente.entradas.values()], partes=rel=>rel.split('/'), temporal='.mind-'+createHash('sha256').update(ctx.idPedido).digest('hex').slice(0,8)+'.tmp';
    let paso=ctx.paso('destino');
    if(!paso) {
      const e=archivos.lstatSync(dirD,{throwIfNoEntry:false});
      if(e&&(!e.isDirectory()||archivos.readdirSync(dirD).length)) throw decidir('DESTINO_OCUPADO','El destino ya existe con contenido: '+dirD,'Elegir una carpeta nueva o vacía; Mind no mezcla ni sobrescribe archivos ajenos.');
      if(!e&&plan.destino.ubicacion==='mind') try { archivos.mkdirSync(dirname(dirD),{recursive:true}); } catch { throw decidirUbicacion('Sin permiso para preparar la base dentro de Mind'); }
      if(!e) carpeta(dirname(dirD));
      ctx.marcar('plan',plan); paso={estado:'copiando',creada:!e}; ctx.marcar('destino',paso);
      if(!e) try { archivos.mkdirSync(dirD); } catch { throw decidirUbicacion('Sin permiso o no se pudo crear el destino: '+dirD); }
    } else if(!archivos.existsSync(dirD)) archivos.mkdirSync(dirD);
    if(paso.estado==='copiando') {
      for(const e of lista) {
        const d=join(dirD,...partes(e.rel)), estado=archivos.lstatSync(d,{throwIfNoEntry:false});
        if(e.tipo==='carpeta') { if(!estado) archivos.mkdirSync(d); else if(!estado.isDirectory()||estado.isSymbolicLink()) throw decidir('DESTINO_OCUPADO','El destino tiene otra entrada en '+e.rel,'Elegir otro destino; Mind no sobrescribe archivos ajenos.'); continue; }
        const o=join(dirO,...partes(e.rel));
        if(estado) { if(!estado.isFile()||hashArchivo(o).sha256!==hashArchivo(d).sha256) throw decidir('DESTINO_OCUPADO','El destino tiene un archivo distinto que Mind no terminó de copiar: '+e.rel,'Elegir otro destino; Mind no sobrescribe archivos ajenos.'); continue; }
        // Se copia a un temporal propio y se renombra: un nombre final en el destino siempre es una copia completa.
        archivos.copyFileSync(o,d+temporal); archivos.renameSync(d+temporal,d);
      }
      paso={...paso,estado:'copiado'}; ctx.marcar('destino',paso);
    }
    // Una comprobación anterior no acredita el estado tras una interrupción: comparar de nuevo antes de activar.
    let verificacion;
    {
      const copia=recorrer(dirD,{maximo:200000}), esperadas=new Set(lista.map(e=>claveRuta(e.rel)+'|'+e.tipo));
      const extra=[...copia.entradas.values()].filter(e=>!esperadas.has(claveRuta(e.rel)+'|'+e.tipo)).map(e=>e.rel), halladas=new Set([...copia.entradas.values()].map(e=>claveRuta(e.rel)+'|'+e.tipo));
      const faltan=lista.filter(e=>!halladas.has(claveRuta(e.rel)+'|'+e.tipo)).map(e=>e.rel), distintos=[]; let bytes=0;
      for(const e of lista) if(e.tipo==='archivo'&&halladas.has(claveRuta(e.rel)+'|archivo')) { const a=hashArchivo(join(dirO,...partes(e.rel))), b=hashArchivo(join(dirD,...partes(e.rel))); if(a.sha256!==b.sha256||a.bytes!==b.bytes) distintos.push(e.rel); bytes+=a.bytes; }
      if(extra.length||faltan.length||distintos.length||copia.errores.length||copia.omitidos.length) throw decidir('VERIFICACION_FALLIDA','La copia no coincide con el original; la raíz no cambió','Revisar el destino indicado; el original no se modificó y la operación queda pendiente.',{extra:acotar(extra),faltan:acotar(faltan),distintos:acotar(distintos),errores:acotar(copia.errores)});
      verificacion={archivos:lista.filter(e=>e.tipo==='archivo').length,carpetas:lista.filter(e=>e.tipo==='carpeta').length,bytes,contenido:'SHA-256 coincidente archivo por archivo',fecha:new Date().toISOString()};
      ctx.marcar('verificacion',verificacion);
    }
    const raizNueva=nuevaRaiz(ctx,c,plan,'disponible',verificacion.fecha);
    return {coleccion:raizNueva,modo:'copiar',origen:{...plan.origen,conservado:true,nota:'El original queda intacto; Mind no lo borra.'},destino:plan.destino,verificacion,idsConservados:true,avisos};
  }
}

export function ejecutarColeccion(tablas,op,dependencias) {
  const c=abrirColecciones(tablas,dependencias);
  if(op.operacion==='preparar')return c.preparar(op);
  if(op.operacion==='buscar')return c.buscar(op);
  if(op.operacion==='indexar')return c.indexar(op);
  if(op.operacion==='resolver')return c.resolver(op);
  if(op.operacion==='registrarEnlace')return c.registrarEnlace(op);
  if(op.operacion==='reubicar')return c.reubicar(op);
  throw new Error('Operación de Colecciones desconocida');
}
