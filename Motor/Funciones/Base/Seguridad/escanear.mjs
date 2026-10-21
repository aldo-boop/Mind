import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { VERSION } from '../Tablas/tablas.mjs';

export function huella(carpeta) {
  const h=createHash('sha256'); let cantidad=0;
  function recorrer(p,rel='') {
    if(lstatSync(p).isSymbolicLink()) throw new Error('Enlace no permitido');
    for(const e of readdirSync(p,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
      const ruta=join(p,e.name), nombre=rel+'/'+e.name;
      if(e.isSymbolicLink()) throw new Error('Enlace no permitido');
      if(e.isDirectory()) recorrer(ruta,nombre);
      else if(e.isFile()){ h.update(JSON.stringify(nombre));h.update(createHash('sha256').update(readFileSync(ruta)).digest());cantidad++; }
      else throw new Error('Archivo especial no permitido');
    }
  }
  recorrer(resolve(carpeta)); return {sha256:h.digest('hex'),archivos:cantidad};
}
// Puerto de SkillSpector de v1: ejecutable explícito, sin rutas personales,
// sin instalar dependencias y sin descargar ni ejecutar el objetivo.
export function escanear(carpeta,{ejecutable=process.env.MIND_SKILLSPECTOR,transporte=spawnSync}={}) {
  const objetivo=resolve(carpeta), antes=huella(objetivo);
  if(!antes.archivos || !ejecutable) return {recomendacion:'BLOCKED',motivo:'Se necesita SkillSpector configurado y una carpeta no vacía'};
  const r=transporte(ejecutable,['scan',objetivo,'--format','json','--no-llm'],{encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:16*1024*1024,env:{...process.env,PYTHONIOENCODING:'utf-8'}});
  let informe; try { informe=JSON.parse(r.stdout); } catch { return {recomendacion:'BLOCKED',motivo:'Informe inválido'}; }
  const despues=huella(objetivo);
  const c=informe.analysis_completeness;
  const completa=c?.coverage_percent===100 && c.is_complete===true && c.execution_successful===true;
  const seguro=r.status===0 && !r.error && informe.risk_assessment?.recommendation==='SAFE' && completa && antes.sha256===despues.sha256;
  return {recomendacion:seguro?'SAFE':'BLOCKED',objetivo,huella:despues.sha256,informe,motivo:seguro?'Análisis estático completo':'Escaneo fallido, incompleto, no SAFE o archivos cambiados'};
}
const permisosValidos=p=>p && Object.keys(p).every(k=>['leer','escribir'].includes(k)) && Object.values(p).every(v=>Array.isArray(v) && v.every(t=>['perfil','proyectos','decisiones','colecciones','conceptos','propia'].includes(t)));
export function autorizarExtension(carpeta,{confirmadoPorPersona=false,...opciones}={}) {
  if(confirmadoPorPersona!==true) throw new Error('Falta confirmación explícita de la persona');
  const r=escanear(carpeta,opciones); if(r.recomendacion!=='SAFE') throw new Error('Extensión bloqueada: '+r.motivo);
  const m=JSON.parse(readFileSync(join(r.objetivo,'manifiesto.json'),'utf8'));
  if(!/^[a-z0-9][a-z0-9-]{0,63}$/.test(m.nombre) || m.versionMemoria!==VERSION || !permisosValidos(m.permisos)) throw new Error('Manifiesto inválido o versión de Memoria incompatible');
  const permisos=Object.freeze(Object.fromEntries(Object.entries(m.permisos).map(([k,v])=>[k,Object.freeze([...v])])));
  return Object.freeze({nombre:m.nombre,permisos,autorizado:true,huella:r.huella,comprobar(){ if(huella(r.objetivo).sha256!==r.huella) throw new Error('La extensión cambió; repetir escaneo y autorización'); }});
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href){ try { const r=escanear(process.argv[2]);console.log(JSON.stringify(r,null,2));process.exitCode=r.recomendacion==='SAFE'?0:2; } catch(e){console.error(e.message);process.exitCode=2;} }
