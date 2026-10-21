import * as fs from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {atomico,sinEnlaces} from '../../../Distribucion/contrato.mjs';
export const FILTRO='path:"Memoria/Vistas/" -path:"Memoria/Vistas/Colecciones/" -path:"Memoria/Vistas/Conceptos/" -file:"Decisiones" -file:"Colecciones" -file:"Conceptos" -file:"Índice"';
export function prepararObsidian(raiz){
 const dir=sinEnlaces(join(raiz,'.obsidian'));fs.mkdirSync(dir,{recursive:true});
 const lock=sinEnlaces(join(dir,'.mind-config.lock'));let fd;
 try{fd=fs.openSync(lock,'wx');}catch(e){if(e.code==='EEXIST')return {estado:'aplazada',motivo:'Otra configuración está activa'};throw e;}
 try{
  const leer=n=>{const p=sinEnlaces(join(dir,n));if(!fs.existsSync(p))return {dato:{},texto:null};if(!fs.lstatSync(p).isFile())throw Error('Configuración ajena conservada: '+n);const texto=fs.readFileSync(p,'utf8');const dato=JSON.parse(texto.replace(/^\ufeff/,''));if(!dato||typeof dato!=='object'||Array.isArray(dato))throw Error('Configuración inválida: '+n);return {dato,texto};};
  const old=Object.fromEntries(['graph.json','app.json','bookmarks.json','mind.json'].map(n=>[n,leer(n)]));
  const graph=structuredClone(old['graph.json'].dato),app=structuredClone(old['app.json'].dato),book=structuredClone(old['bookmarks.json'].dato),marker=old['mind.json'].dato;
  const defaults={search:FILTRO,showOrphans:false,hideUnresolved:true};
  // Solo se sustituyen los valores iniciales de un gráfico sin filtro, o valores previamente gestionados.
  if(marker.perfil?(marker.grafico&&Object.entries(marker.grafico).every(([k,v])=>graph[k]===v)):!graph.search)Object.assign(graph,defaults);
  if(app.userIgnoreFilters!==undefined&&!Array.isArray(app.userIgnoreFilters))throw Error('Lista de exclusión inválida; configuración conservada');
  app.userIgnoreFilters=[...new Set([...(app.userIgnoreFilters||[]),'Motor/','Memoria/Colecciones/','Memoria/Vistas/Colecciones/','Memoria/Vistas/Conceptos/'])];
  if(book.items!==undefined&&!Array.isArray(book.items))throw Error('Marcadores inválidos; configuración conservada');
  book.items??=[];
  for(const nombre of ['Inicio','Perfil','Proyectos','Biblioteca']){const path='Memoria/Vistas/'+nombre+'.md';if(fs.existsSync(join(raiz,path))&&!book.items.some(x=>x.type==='file'&&x.path===path))book.items.push({type:'file',ctime:Date.now(),path,title:nombre});}
  const candidatos={'graph.json':graph,'app.json':app,'bookmarks.json':book};
  const cambios=Object.entries(candidatos).filter(([n,d])=>JSON.stringify(d)!==JSON.stringify(old[n].dato));
  for(const [n]of cambios){const texto=old[n].texto;if(texto!==null){const hash=createHash('sha256').update(texto).digest('hex');const copia=sinEnlaces(join(dir,'.respaldos-mind',hash+'-'+n));if(!fs.existsSync(copia))atomico(copia,texto);}}
  for(const [n,d]of cambios)atomico(join(dir,n),d);
  const managed={formato:1,perfil:1,...(graph.search===FILTRO?{grafico:defaults}:{})};
  if(JSON.stringify(marker)!==JSON.stringify(managed))atomico(join(dir,'mind.json'),managed);
  return {estado:cambios.length?'preparada':'sin-cambios',archivos:cambios.map(([n])=>n),graficoPersonalConservado:graph.search!==FILTRO};
 }finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}
