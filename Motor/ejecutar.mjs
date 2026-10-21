import { readFileSync } from 'node:fs';
import { resolve,dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirTablas } from './Funciones/Base/Tablas/tablas.mjs';
import { abrirFrentes } from './Funciones/Base/Frentes/frentes.mjs';
import { ejecutarColeccion } from './Funciones/Base/Colecciones/colecciones.mjs';
import { buscar,avisosCrecimiento } from './Funciones/Base/Buscar/buscar.mjs';
import { adaptarEsqueleto } from './Funciones/Base/Adaptar/migrar.mjs';
import { sembrarConceptosMind } from './Funciones/Base/Tablas/semilla-mind.mjs';
import { abrirDecisionesEnTablas } from './Funciones/Base/Recordar/tablas.mjs';
import { escanear,autorizarExtension } from './Funciones/Base/Seguridad/escanear.mjs';
const motor=dirname(fileURLToPath(import.meta.url));
// PowerShell 5.1 borra las comillas internas de un argumento; la forma escapada (\") funciona ahí.
// Si el JSON no se lee tal cual, se reintenta quitando esas barras: así la misma forma sirve en bash y PowerShell 7.
function leerJSON(texto){try{return JSON.parse(texto);}catch(e){try{return JSON.parse(texto.replace(/\\"/g,'"'));}catch{throw e;}}}
const [accion,carpeta,...resto]=process.argv.slice(2);
try {
  if(!carpeta)throw new Error('Uso: node Motor/ejecutar.mjs inicializar|adaptar|buscar|alta|actualizar|retirar|rama|recordar|seguridad|frente|proyecto|cambiar|uso|operaciones|liberar|coleccion <Memoria> [JSON]');
  // «-» lee el JSON de la entrada estándar, sin límite de longitud de la línea de comandos (lo usa Mind.cmd).
  const memoria=resolve(carpeta),t=abrirTablas(memoria),texto=resto.length===1&&resto[0]==='-'?readFileSync(0,'utf8').replace(/^﻿/,''):resto.join(' '),op=texto.trim()?leerJSON(texto):{};
  if(!op||typeof op!=='object'||Array.isArray(op))throw new Error('El argumento JSON debe ser un objeto');
  // Si otro escritor (otro agente) tiene la Memoria, se espera hasta ~10 s.
  // El candado se rechaza antes de escribir nada, así que reintentar no duplica.
  const pausa=new Int32Array(new SharedArrayBuffer(4));
  let r;
  for(let intento=0;;intento++){try{r=ejecutar();break;}catch(e){if(!/Memoria ocupada|Memoria en adaptación/.test(e.message)||/ya no existe/.test(e.message)||e.recibo?.guardado||intento>=60)throw e;Atomics.wait(pausa,0,0,Math.min(20*2**intento,250));}}
  console.log(JSON.stringify(r?.recibo?{...r,recibo:r.recibo}:r,null,2));
  function ejecutar(){
  let r;
  switch(accion){
    case 'inicializar':t.inicializar();r={estado:'inicializada',memoria,semilla:op.sembrar===true?sembrarConceptosMind(t):{agregados:0,conceptosBase:0}};break;
    case 'adaptar':if(op.confirmadoPorPersona!==true)throw new Error('Adaptar la Memoria requiere confirmación explícita de la persona');r=adaptarEsqueleto(motor,memoria,op);break;
    case 'buscar':r={filas:buscar(t,op),avisos:avisosCrecimiento(t,op)};break;
    case 'alta':r=t.alta(op.tabla,op.fila,op);break;
    case 'actualizar':r=t.actualizar(op.tabla,op.id,op.cambios,op);break;
    case 'retirar':r=t.retirar(op.tabla,op.id,op);break;
    case 'rama':r=t.abrirRama(op.tabla,op.id,op);break;
    case 'recordar':{
      const d=abrirDecisionesEnTablas(t);
      switch(op.operacion){
        case 'guardar':r={id:d.guardar(op)};break;
        case 'confirmar':r=d.confirmar(op.id,op);break;
        case 'corregir':r=d.corregir(op.id,op.respuesta,op);break;
        case 'recordar':r=d.recordar(op,op);break;
        default:throw new Error('Operación de Recordar desconocida');
      }
      break;
    }
    case 'seguridad':{
      switch(op.operacion){
        case 'escanear':r=escanear(op.carpeta,op);if(r.recomendacion!=='SAFE')process.exitCode=2;break;
        case 'autorizar':r=autorizarExtension(op.carpeta,op);break;
        default:throw new Error('Operación de Seguridad desconocida');
      }
      break;
    }
    case 'frente':r=abrirFrentes(t).altaFrente(op.fila,op);break;
    case 'coleccion':r=ejecutarColeccion(t,op);break;
    case 'proyecto':r=abrirFrentes(t).altaProyecto(op.nombre,op.descripcion,op);break;
    case 'cambiar':r=abrirFrentes(t).cambiar(op.id,op.cambios);break;
    case 'uso':r=abrirFrentes(t).uso(op);break;
    case 'operaciones':r={pendientes:t.operacionesPendientes()};break;
    case 'liberar':r=t.liberarCandado(op);break;
    default:throw new Error('Acción desconocida');
  }
  return r;
  }
}catch(e){if(e.codigo)console.log(JSON.stringify({codigo:e.codigo,error:e.message,...(e.necesitaDecision?{necesitaDecision:true,decision:e.decision}:{}),...(e.bloque?{bloque:e.bloque}:{}),...(e.detalle?{detalle:e.detalle}:{}),...(e.recibo?{recibo:e.recibo}:{})},null,2));else if(e.recibo?.guardado||e.recibo?.pendiente)console.log(JSON.stringify(e.recibo,null,2));console.error(e.message);process.exitCode=2;}
