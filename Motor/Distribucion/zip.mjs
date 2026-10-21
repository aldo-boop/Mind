import * as fs from 'node:fs';
import {join,dirname} from 'node:path';
import {deflateRawSync,inflateRawSync} from 'node:zlib';
import {rutaSegura,sinEnlaces,error} from './contrato.mjs';
const tabla=Uint32Array.from({length:256},(_,i)=>{for(let j=0;j<8;j++)i=(i>>>1)^((i&1)?0xedb88320:0);return i>>>0;});
export function crc32(b){let c=0xffffffff;for(const x of b)c=(c>>>8)^tabla[(c^x)&255];return (c^0xffffffff)>>>0;}
export function crearZip(archivos) {
 const piezas=[],centrales=[];let offset=0;const vistos=new Set();
 for(const [ruta,datos] of [...archivos].sort(([a],[b])=>a.localeCompare(b,'en'))){rutaSegura(ruta);if(vistos.has(ruta.toLowerCase()))throw error('ZIP_INVALIDO','Ruta duplicada');vistos.add(ruta.toLowerCase());
  const nombre=Buffer.from(ruta),raw=Buffer.from(datos),comprimido=deflateRawSync(raw,{level:9}),crc=crc32(raw),local=Buffer.alloc(30),central=Buffer.alloc(46);
  local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(8,8);local.writeUInt16LE(33,12);local.writeUInt32LE(crc,14);local.writeUInt32LE(comprimido.length,18);local.writeUInt32LE(raw.length,22);local.writeUInt16LE(nombre.length,26);
  central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);central.writeUInt16LE(8,10);central.writeUInt16LE(33,14);central.writeUInt32LE(crc,16);central.writeUInt32LE(comprimido.length,20);central.writeUInt32LE(raw.length,24);central.writeUInt16LE(nombre.length,28);central.writeUInt32LE(offset,42);
  piezas.push(local,nombre,comprimido);centrales.push(central,nombre);offset+=local.length+nombre.length+comprimido.length;
 }
 const cd=Buffer.concat(centrales),fin=Buffer.alloc(22);fin.writeUInt32LE(0x06054b50);fin.writeUInt16LE(archivos.size,8);fin.writeUInt16LE(archivos.size,10);fin.writeUInt32LE(cd.length,12);fin.writeUInt32LE(offset,16);return Buffer.concat([...piezas,cd,fin]);
}
export function leerZip(b,{maximo=700*1024*1024}={}) {
 if(!Buffer.isBuffer(b)||b.length<22||b.length>maximo)throw error('ZIP_INVALIDO','ZIP fuera de tamaño');let fin=-1;
 for(let i=b.length-22;i>=Math.max(0,b.length-65557);i--)if(b.readUInt32LE(i)===0x06054b50&&i+22+b.readUInt16LE(i+20)===b.length){fin=i;break;}
 if(fin<0||b.readUInt16LE(fin+4)||b.readUInt16LE(fin+6)||b.readUInt16LE(fin+8)!==b.readUInt16LE(fin+10))throw error('ZIP_INVALIDO','ZIP fragmentado o sin directorio');
 const n=b.readUInt16LE(fin+10),inicio=b.readUInt32LE(fin+16),longitud=b.readUInt32LE(fin+12);if(n>5000||inicio+longitud!==fin)throw error('ZIP_INVALIDO','Directorio ZIP inválido');
 let cursor=inicio,total=0;const out=new Map(),vistos=new Set(),intervalos=[];
 for(let i=0;i<n;i++){
  if(cursor+46>fin||b.readUInt32LE(cursor)!==0x02014b50)throw error('ZIP_INVALIDO','Cabecera ZIP inválida');
  const flags=b.readUInt16LE(cursor+8),metodo=b.readUInt16LE(cursor+10),crc=b.readUInt32LE(cursor+16),comprimido=b.readUInt32LE(cursor+20),bytes=b.readUInt32LE(cursor+24),nl=b.readUInt16LE(cursor+28),el=b.readUInt16LE(cursor+30),cl=b.readUInt16LE(cursor+32),local=b.readUInt32LE(cursor+42),atributos=b.readUInt32LE(cursor+38);
  if(cursor+46+nl+el+cl>fin||flags&0x9||![0,8].includes(metodo)||((atributos>>>16)&0xf000)===0xa000||bytes>maximo||(total+=bytes)>maximo)throw error('ZIP_INVALIDO','ZIP cifrado, enlace o tamaño no admitido');
  const nombre=b.subarray(cursor+46,cursor+46+nl).toString('utf8');rutaSegura(nombre);if(vistos.has(nombre.toLowerCase()))throw error('ZIP_INVALIDO','Ruta ZIP duplicada');vistos.add(nombre.toLowerCase());
  if(local+30>inicio||b.readUInt32LE(local)!==0x04034b50||b.readUInt16LE(local+6)!==flags||b.readUInt16LE(local+8)!==metodo||b.readUInt32LE(local+14)!==crc||b.readUInt32LE(local+18)!==comprimido||b.readUInt32LE(local+22)!==bytes)throw error('ZIP_INVALIDO','Cabeceras ZIP contradictorias');
  const lnl=b.readUInt16LE(local+26),lel=b.readUInt16LE(local+28),start=local+30+lnl+lel,end=start+comprimido;
  if(end>inicio||b.subarray(local+30,local+30+lnl).toString('utf8')!==nombre||intervalos.some(([a,z])=>local<z&&end>a))throw error('ZIP_INVALIDO','Entradas ZIP solapadas o fuera de límites');intervalos.push([local,end]);
  let datos;try{datos=metodo===0?Buffer.from(b.subarray(start,end)):inflateRawSync(b.subarray(start,end),{maxOutputLength:Math.max(1,bytes)});}catch{throw error('ZIP_INVALIDO','Contenido comprimido inválido');}
  if(datos.length!==bytes||crc32(datos)!==crc)throw error('ZIP_INVALIDO','CRC o longitud incorrectos');out.set(nombre,datos);cursor+=46+nl+el+cl;
 }
 if(cursor!==fin)throw error('ZIP_INVALIDO','Directorio ZIP no consumido');return out;
}
export function extraerZip(b,destino,permitidas){const entradas=leerZip(b);for(const r of entradas.keys())if(!permitidas.has(r))throw error('ARCHIVO_NO_OFICIAL','Archivo inesperado en el paquete: '+r);for(const [r,datos]of entradas){const p=sinEnlaces(join(destino,r));fs.mkdirSync(dirname(p),{recursive:true});fs.writeFileSync(p,datos,{flag:'wx'});}return entradas.size;}
