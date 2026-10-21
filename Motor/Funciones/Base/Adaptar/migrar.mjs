import { cpSync, existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, lstatSync, openSync, closeSync, unlinkSync, renameSync, mkdtempSync } from 'node:fs';
import { resolve, join, relative, isAbsolute, dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { abrirTablas, ESQUEMA, VERSION, RAMIFICABLES, atomico } from '../Tablas/tablas.mjs';
import { adaptarColeccionesV2, comprobarSoloAgrega } from './esquema2.mjs';
const MARCA='<!-- mind:vista-derivada -->';
const filasDe=p=>readFileSync(p,'utf8').split('\n').filter(l=>l.trim()).map(l=>JSON.parse(l).fila);
const ramasEn=(raiz,t)=>{const d=join(raiz,'Tablas',t);return existsSync(d)?readdirSync(d).filter(n=>n.endsWith('.jsonl')).map(n=>n.slice(0,-6)).sort():[];};

// Esqueleto: prepara copia y candidato; NO promueve ni cambia la Memoria original.
// Una migración concreta requiere su transformador y validación específica.
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
function inventario(p,base=p,resultado={},omitir=new Set()) {
  if(lstatSync(p).isSymbolicLink()) throw new Error('No se migran enlaces');
  for(const e of readdirSync(p,{withFileTypes:true})) {
    const f=join(p,e.name);if(omitir.has(relative(base,f)))continue;if(e.isSymbolicLink())throw new Error('No se migran enlaces');
    if(e.name.endsWith('.lock'))throw new Error('Memoria ocupada');
    if(e.isDirectory()) inventario(f,base,resultado,omitir);else if(e.isFile())resultado[relative(base,f)]=sha(f);else throw new Error('Archivo especial');
  } return resultado;
}

// Adaptación estructural determinista. El plan viene del Motor, nunca de una extensión.
// Renombra columnas preservando sus valores; no interpreta ni clasifica texto.
// Sin un plan compatible, se conserva la Memoria y se devuelve el error.
export function adaptarEsqueleto(motor,memoria,{renombrar={},valoresPredeterminados={}}={}) {
  memoria=resolve(memoria);
  let padre=memoria;
  while(true){if(existsSync(padre)&&lstatSync(padre).isSymbolicLink())throw Error('No se adaptan enlaces');const p=dirname(padre);if(p===padre)break;padre=p;}
  const version=detectarVersion(motor,memoria);
  if(version.nueva!==VERSION || (version.anterior!==null && (!Number.isInteger(version.anterior)||version.anterior<0||version.anterior>version.nueva)))throw Error('Versión no soportada; requiere instrucciones de adaptación del Motor');
  if(!version.requiereAdaptacion)return {estado:'sin-cambios',...version};
  const token=randomUUID(),raizLock=join(memoria,'.adaptacion.lock'),tablaLock=join(memoria,'Tablas','.escritura.lock');
    const omitir=new Set(['.adaptacion.lock','.escritura.lock',join('Tablas','.escritura.lock')]);
    const tomados=[];
    function tomar(p){let fd;try{fd=openSync(p,'wx');}catch{throw Error('Memoria ocupada; adaptación aplazada');}try{writeFileSync(fd,token);}finally{closeSync(fd);}tomados.push(p);}
    function soltar(p){if(existsSync(p)&&readFileSync(p,'utf8')===token)unlinkSync(p);}
    let taller,candidato,anteriorMovido=false,nuevaActiva=false,respaldo;
    try {
      mkdirSync(memoria,{recursive:true});
      tomar(raizLock);
      tomar(join(memoria,'.escritura.lock'));
      if(existsSync(join(memoria,'Tablas')))tomar(tablaLock);
      // Una operación compuesta a medias deja datos sin cerrar: primero se completa, después se adapta.
      const pOps=join(memoria,'.operaciones.json');
      if(existsSync(pOps)&&(JSON.parse(readFileSync(pOps,'utf8')).operaciones??[]).length)throw Error('Hay operaciones pendientes; complétalas antes de adaptar');
      const antes=inventario(memoria,memoria,{},omitir);
      taller=mkdtempSync(join(dirname(memoria),'.mind-adaptar-'));
      candidato=join(taller,'candidato');
      cpSync(memoria,candidato,{recursive:true,force:false,errorOnExist:true,filter:src=>!omitir.has(relative(memoria,src))});
      const copia=inventario(candidato);
      if(JSON.stringify(copia)!==JSON.stringify(antes))throw Error('Copia previa no coincide por contenido');
      const esperadas=new Map();let total=0;
      for(const t of Object.keys(ESQUEMA)){
        const archivo=join(candidato,'Tablas',t+'.jsonl');
        if(!existsSync(archivo)){esperadas.set(t,[]);continue;}
        const lineas=readFileSync(archivo,'utf8').split('\n').filter(l=>l.trim());
        const eventos=lineas.map((l,i)=>{
          let e;try{e=JSON.parse(l);}catch{throw Error(`Registro truncado: ${t}, línea ${i+1}`);}
          if(e.operacion!=='poner'||!e.fila)throw Error('Evento no soportado; requiere clasificación con instrucciones del Motor');
          const f={};
          for(const [k,v] of Object.entries(e.fila)){
            const nueva=renombrar[t]?.[k]??k;
            if(!ESQUEMA[t].includes(nueva))throw Error(`Columna ${t}.${k} sin adaptación; requiere instrucciones del Motor`);
            if(Object.hasOwn(f,nueva)&&JSON.stringify(f[nueva])!==JSON.stringify(v))throw Error('Renombrar perdería datos');
            f[nueva]=v;
          }
          for(const [k,v] of Object.entries(valoresPredeterminados[t]??{}))if(!Object.hasOwn(f,k))f[k]=v;
          return {operacion:'poner',fila:f};
        });
        esperadas.set(t,eventos.map(e=>e.fila));total+=eventos.length;
        atomico(archivo,eventos.map(e=>JSON.stringify(e)+'\n').join(''));
      }
      // Ramas: también cuentan y se comprueban; antes de esta versión se copiaban sin revisar.
      const ramasEsperadas=new Map();
      for(const t of RAMIFICABLES)for(const r of ramasEn(candidato,t)){let filas;try{filas=filasDe(join(candidato,'Tablas',t,r+'.jsonl'));}catch{throw Error(`Registro truncado: ${t}/${r}`);}ramasEsperadas.set(t+'/'+r,filas);total+=filas.length;}
      // Esquema 1 → 2: Colecciones (tabla principal y todas sus ramas) recibe clase, propiedad, padre y ubicación.
      let pendientes=[];
      if(version.anterior===null||version.anterior<2){
        const previo=new Map([['',esperadas.get('colecciones')??[]],...[...ramasEsperadas].filter(([k])=>k.startsWith('colecciones/')).map(([k,v])=>[k.slice(12),v])]);
        const v2=adaptarColeccionesV2(candidato);
        for(const [r,filas] of v2.archivos){comprobarSoloAgrega(previo.get(r)??[],filas,r?'colecciones/'+r:'colecciones');if(r)ramasEsperadas.set('colecciones/'+r,filas);else esperadas.set('colecciones',filas);}
        pendientes=v2.pendientes;
      }
      atomico(join(candidato,'version.json'),JSON.stringify({memoria:VERSION},null,2)+'\n');
      const tablas=abrirTablas(candidato).inicializar();
      for(const [t,filas] of esperadas)if(JSON.stringify(tablas.leer(t,{historia:true}))!==JSON.stringify(filas))throw Error('No se conserva el 100 % de las filas');
      for(const [k,filas] of ramasEsperadas){const [t,r]=k.split('/');if(JSON.stringify(tablas.leer(t,{rama:r,historia:true}))!==JSON.stringify(filas))throw Error('No se conserva el 100 % de las filas de la rama '+k);}
      const derivados=new Set(['version.json','.vista-pendiente.json',...Object.keys(ESQUEMA).flatMap(t=>[join('Tablas',t+'.jsonl'),join('Tablas',t+'.csv')]),...['Inicio.md','Controlador.md','Resumen del Perfil.md','Reglas del usuario.md','Decisiones.md','Colecciones.md','Conceptos.md'].map(n=>join('Vistas',n))]);
      // Las ramas de Colecciones se comprobaron evento por evento; los CSV de ramas y toda vista con la marca del Motor se regeneran.
      for(const r of ramasEn(memoria,'colecciones'))derivados.add(join('Tablas','colecciones',r+'.jsonl'));
      for(const t of RAMIFICABLES)for(const r of ramasEn(memoria,t))derivados.add(join('Tablas',t,r+'.csv'));
      for(const p of Object.keys(antes))if(p.startsWith('Vistas'+(p.includes('\\')?'\\':'/'))&&p.endsWith('.md')&&readFileSync(join(memoria,p),'utf8').startsWith(MARCA))derivados.add(p);
      // Vistas de consulta anteriores: se limpian al adaptar; originales íntegros en el respaldo.
      const vistasConsulta=[join('Tablas','Tablas de la Memoria.md'),...['Perfil','Proyectos','Decisiones','Colecciones','Conceptos'].map(n=>join('Tablas',n+'.md'))];
      for(const p of vistasConsulta) if(existsSync(join(memoria,p)) && readFileSync(join(memoria,p),'utf8').startsWith('<!-- mind:vista-derivada -->')) derivados.add(p);
      let archivosConservados=0;
      for(const [p,h] of Object.entries(antes))if(!derivados.has(p)){if(!existsSync(join(candidato,p))||sha(join(candidato,p))!==h)throw Error('Archivo del usuario no conservado: '+p);archivosConservados++;}
      if(JSON.stringify(inventario(memoria,memoria,{},omitir))!==JSON.stringify(antes))throw Error('El origen cambió; no activar');
      // Mantener puertas cerradas durante el intercambio de directorios.
      writeFileSync(join(candidato,'.adaptacion.lock'),token,{flag:'wx'});
      writeFileSync(join(candidato,'.escritura.lock'),token,{flag:'wx'});
      if(existsSync(join(candidato,'Tablas')))writeFileSync(join(candidato,'Tablas','.escritura.lock'),token,{flag:'wx'});
      const anterior=join(taller,'original');
      renameSync(memoria,anterior);anteriorMovido=true;
      try{renameSync(candidato,memoria);nuevaActiva=true;}catch(e){renameSync(anterior,memoria);anteriorMovido=false;throw e;}
      respaldo=join(memoria,`.respaldo-${version.anterior??'sin-version'}-${token}`);
      renameSync(anterior,respaldo);anteriorMovido=false;
      for(const p of omitir)soltar(join(respaldo,p));
      const resultado={estado:'adaptada',anterior:version.anterior,nueva:VERSION,filasConservadas:total,archivosConservados,respaldo,promovido:true,taller,pendientes};
      writeFileSync(join(respaldo,`adaptacion-comprobada-${token}.json`),JSON.stringify(resultado,null,2)+'\n',{flag:'wx'});
      return resultado;
    }catch(e){
      if(anteriorMovido && nuevaActiva)e.message+=`; Memoria nueva activa; originales seguros en ${join(taller,'original')}`;
      else if(taller)e.message+=`; taller conservado en ${taller}`;
      throw e;
    }finally{
      // No se eliminan respaldos ni candidatos; solo nuestros candados identificados.
      for(const p of tomados)soltar(p);
      if(nuevaActiva){for(const p of omitir)soltar(join(memoria,p));}
    }
}
export function detectarVersion(motor,memoria) {
  const nueva=JSON.parse(readFileSync(join(motor,'version.json'),'utf8')).memoria;
  const p=join(memoria,'version.json');
  if(!existsSync(p)) {
    const tablasDir=join(memoria,'Tablas');
    const tieneDatos=existsSync(tablasDir)&&readdirSync(tablasDir).some(n=>n.endsWith('.jsonl'));
    return {anterior:tieneDatos?null:nueva,nueva,requiereAdaptacion:tieneDatos};
  }
  const anterior=JSON.parse(readFileSync(p,'utf8')).memoria;
  return {anterior,nueva,requiereAdaptacion:anterior!==nueva};
}
export function prepararMigracion(origen,destino,{versionDestino=VERSION}={}) {
  origen=resolve(origen);destino=resolve(destino);
  const rel=relative(origen,destino), inversa=relative(destino,origen);
  if(!rel || (!rel.startsWith('..')&&!isAbsolute(rel)) || (!inversa.startsWith('..')&&!isAbsolute(inversa))) throw new Error('El taller debe estar separado del origen');
  if(existsSync(destino)) throw new Error('Destino existente');
  const antes=inventario(origen); mkdirSync(destino,{recursive:true});
  const copia=join(destino,'respaldo'),candidato=join(destino,'candidato');
  cpSync(origen,copia,{recursive:true,errorOnExist:true,force:false});
  if(JSON.stringify(inventario(copia))!==JSON.stringify(antes) || JSON.stringify(inventario(origen))!==JSON.stringify(antes)) throw new Error('El origen cambió o la copia no coincide');
  cpSync(copia,candidato,{recursive:true,errorOnExist:true,force:false});
  const a=abrirTablas(copia),b=abrirTablas(candidato);let filas=0;
  for(const t of Object.keys(ESQUEMA)) { const x=a.leer(t,{historia:true}),y=b.leer(t,{historia:true});if(JSON.stringify(x)!==JSON.stringify(y))throw new Error('Filas no conservadas');filas+=x.length; }
  const informe={estado:'preparado',versionDestino,filasConservadas:filas,archivosComprobados:Object.keys(antes).length,copia,candidato,promovido:false,pendiente:'Aplicar transformador de versión, validar contenidos y promover con recuperación; no implementado en este esqueleto.'};
  writeFileSync(join(destino,'resultado.json'),JSON.stringify(informe,null,2));return informe;
}
