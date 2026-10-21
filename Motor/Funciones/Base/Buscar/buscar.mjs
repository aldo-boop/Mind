import { palabrasImportantes, parecido } from '../Recordar/recordar.mjs';
export function avisosCrecimiento(tablas,{tabla}={}) {
  if(!['perfil','conceptos'].includes(tabla))return [];
  const filas=tablas.leer(tabla),campo=tabla==='perfil'?'faceta':'tema',conteos=new Map();
  const facetas=tabla==='perfil'?new Map(filas.filter(f=>f.vigencia==='vigente'&&f.tipo==='faceta').map(f=>[f.id,f.faceta||f.id])):null;
  for(const f of filas)if(f.vigencia==='vigente' && (tabla!=='perfil'||f.tipo==='entrada')){
    const grupo=tabla==='perfil'?(facetas.get(f.faceta)??f.faceta):f[campo];
    conteos.set(grupo,(conteos.get(grupo)||0)+1);
  }
  return [...conteos].filter(([,n])=>n>100).map(([grupo,filas])=>({grupo,filas,mensaje:`${grupo} tiene ${filas} filas vigentes. Proponer subdivisión a la persona, sin crearla automáticamente.`}));
}
// Orden común de resultados: puntuación; ante empate, primero la fila cuyo nombre contiene el texto tal cual
// («logo-v2» antes que «logo-v1» o «logo-v3»); después, la más reciente. Colecciones lo usa al juntar ramas.
export function compararResultados(texto='') {
  const buscado=String(texto??'').trim().toLocaleLowerCase(), literal=f=>buscado&&String(f.nombre??f.concepto??f.afirmacion??f.condicion??'').toLocaleLowerCase().includes(buscado)?1:0;
  return (a,b)=>b.puntuacion-a.puntuacion || literal(b.fila)-literal(a.fila) || String(b.fila.fecha??'').localeCompare(String(a.fila.fecha??''));
}
export function buscar(tablas,{tabla,rama,texto='',limite=10,vigente=true,perteneceA,conectadoA,faceta,tema,proyecto,alAvisar=()=>{}}={}) {
  if(!Number.isInteger(limite) || limite<1 || limite>50) throw new Error('Límite permitido: 1–50');
  // Busca en una sola tabla: la raíz o la rama indicada. Las filas que traen «rama» indican dónde seguir bajando.
  const filas=tablas.leer(tabla,rama?{rama}:{}), claves=palabrasImportantes(texto);
  for(const aviso of avisosCrecimiento({leer:()=>filas},{tabla}))alAvisar(aviso);
  // Descendientes de una faceta/tema/padre: resuelve nombres e IDs a una identidad común sin recursión infinita.
  const raiz=faceta ?? tema ?? perteneceA, ramas=new Set(raiz?[raiz]:[]);
  const clavesFila=f=>tabla==='perfil'?(f.tipo==='faceta'?[f.id,f.faceta]:[f.id]):tabla==='conceptos'?[f.id,f.concepto,...(ramas.has(f.tema)||(f.perteneceA&&ramas.has(f.perteneceA))?[f.tema]:[])]:[f.id,f.nombre];
  const perteneceRama=f=>ramas.has(f.id)||ramas.has(tabla==='perfil'?f.faceta:tabla==='conceptos'?f.tema:f.nombre)||(tabla==='conceptos'&&ramas.has(f.concepto))||(Boolean(f.perteneceA)&&ramas.has(f.perteneceA));
  if(raiz){ let crece=true; while(crece){ crece=false; for(const f of filas){ if(perteneceRama(f)){ for(const k of clavesFila(f))if(k&&!ramas.has(k)){ramas.add(k);crece=true;} } } } }
  return filas.filter(f=>!vigente || (f.vigencia==='vigente' && (tabla!=='proyectos' || f.estado==='activo')))
    .filter(f=>!raiz || perteneceRama(f))
    .filter(f=>!proyecto || f.proyecto===proyecto || f.id===proyecto)
    .filter(f=>!conectadoA || (Array.isArray(f.conectadoA)?f.conectadoA:[f.conectadoA]).includes(conectadoA))
    .map(f=>{ const contenido=Object.values(f).join(' '), palabras=palabrasImportantes(contenido); const cobertura=claves.size?[...claves].filter(x=>palabras.has(x)).length/claves.size:0; return {fila:f,puntuacion:texto?Math.max(parecido(texto,contenido),cobertura):1}; })
    .filter(r=>r.puntuacion>0).sort(compararResultados(texto)).slice(0,limite);
}

