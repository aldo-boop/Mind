import * as fs from 'node:fs';
import {join,resolve,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
const TIPO='ubicacion-colecciones';
export function preferenciaDeNube(tablas){
 const reglas=tablas.leer('decisiones').filter(d=>d.vigencia==='vigente'&&d.tipo===TIPO&&d.proyecto==='General'&&d.condicion==='base'&&['confirmada','corregida'].includes(d.estado));
 if(reglas.length>1)throw Error('Hay varias ubicaciones de nube confirmadas; resolver antes de crear colecciones');
 return reglas[0]?{ubicacion:'sincronizada',base:join(reglas[0].decision,'Proyectos')}:null;
}
function carpetaSegura(path){if(typeof path!=='string'||!isAbsolute(path))throw Error('Indica la ruta absoluta de la carpeta que sincroniza tu nube');for(let p=resolve(path);;){const stat=fs.lstatSync(p);if(stat.isSymbolicLink())throw Error('La carpeta no puede atravesar enlaces o junctions');const parent=resolve(p,'..');if(parent===p)break;p=parent;}if(!fs.statSync(path).isDirectory())throw Error('La ubicación elegida no es una carpeta');fs.accessSync(path,fs.constants.R_OK|fs.constants.W_OK);return resolve(path);}
export function ejecutarNube(tablas,op={}){
 if(op.operacion==='estado'){
  const preferencia=preferenciaDeNube(tablas);
  if(!preferencia)return {estado:'sin-configurar',siguiente:'Indica la carpeta que ya sincroniza tu nube.'};
  try{carpetaSegura(preferencia.base);return {estado:'carpeta-disponible',base:preferencia.base,verificacion:{local:true,remota:false},nota:'El proveedor sincroniza la carpeta; Mind no acredita el servidor solo por verla localmente.'};}catch(e){return {estado:'sin-acceso',base:preferencia.base,motivo:e.message};}
 }
 if(op.operacion!=='conectar')throw Error('Operación de nube: conectar o estado');
 if(op.confirmadoPorPersona!==true)throw Error('Conectar la carpeta requiere la elección explícita de la persona');
 const carpeta=carpetaSegura(op.carpeta),base=join(carpeta,'Proyectos');
 const reglas=tablas.leer('decisiones').filter(d=>d.vigencia==='vigente'&&d.tipo===TIPO&&d.proyecto==='General'&&d.condicion==='base');
 if(reglas.length>1)throw Error('Varias ubicaciones registradas; resolver antes de cambiar la conexión');
 const existentes=tablas.leer('colecciones').filter(c=>c.vigencia==='vigente'&&c.clase==='coleccion'&&c.nombre==='Biblioteca'&&!c.proyecto);
 if(existentes.length>1)throw Error('Biblioteca ambigua; indica cuál conservar antes de conectar');
 if(existentes[0]&&resolve(existentes[0].direccion)!==carpeta)throw Error('Biblioteca ya apunta a otra carpeta; cambiarla requiere reubicar sus archivos, no sustituir su dirección');
 const idPedido=op.idPedido||'nube-'+createHash('sha256').update(process.platform==='win32'?carpeta.toLowerCase():carpeta).digest('hex').slice(0,24);
 const r=tablas.operacion({idPedido,tipo:'nube',datos:{carpeta}},ctx=>{
  ctx.marcar('destino',carpeta);fs.mkdirSync(base,{recursive:true});carpetaSegura(base);
  const c=existentes[0]||ctx.alta('colecciones',{clase:'coleccion',nombre:'Biblioteca',ubicacion:'sincronizada',direccion:carpeta,dueno:'propia',disponibilidad:'disponible',comprobado:new Date().toISOString(),patron:'Base elegida para documentos y recursos externos.'},{clave:'biblioteca'});
  const fila={tipo:TIPO,proyecto:'General',condicion:'base',decision:carpeta,alcance:'Colecciones nuevas; las existentes conservan su ubicación hasta reubicarlas explícitamente.',origen:'Elección explícita de la persona',estado:'confirmada'};
  const d=reglas[0]?ctx.actualizar('decisiones',reglas[0].id,fila):ctx.alta('decisiones',fila,{clave:'preferencia'});
  return {estado:'conectada',biblioteca:c.id,carpeta,base,decision:d.id,verificacion:{local:true,remota:false},existentesConservadas:true,nota:'Los proyectos nuevos usarán esta carpeta. Para trasladar los existentes: coleccion reubicar conserva IDs, coteja la copia y deja el original.'};
 });return {...r.resultado,recibo:r.recibo};
}
