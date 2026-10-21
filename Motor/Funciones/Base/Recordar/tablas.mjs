import { parecido, UMBRAL } from './recordar.mjs';
// Adaptador v2: una sola fuente de Decisiones, sin un segundo archivo de casos.
export function abrirDecisionesEnTablas(tablas) {
  const fila=id=>{const f=tablas.leer('decisiones').find(x=>x.id===id && x.vigencia==='vigente');if(!f)throw new Error('Decisión inexistente');return f;};
  return {
    guardar({tipo='decision',texto,respuesta,proyecto='General',alcance='',origen='',limite=''}) {
      if(typeof respuesta!=='string' || !respuesta.trim() || !texto)throw new Error('Falta condición o decisión textual');
      return tablas.alta('decisiones',{tipo,proyecto,condicion:texto,decision:respuesta,alcance,origen,limite,estado:'propuesta'}).id;
    },
    confirmar(id,{confirmadoPorPersona=false}={}) {fila(id);if(confirmadoPorPersona!==true)throw new Error('Falta confirmación de la persona');return tablas.actualizar('decisiones',id,{estado:'confirmada'});},
    corregir(id,respuesta,{confirmadoPorPersona=false}={}) {fila(id);if(confirmadoPorPersona!==true)throw new Error('Falta confirmación de la persona');return tablas.actualizar('decisiones',id,{decision:respuesta,estado:'corregida'});},
    recordar({tipo='decision',proyecto='General',texto},{condicionesComprobadas=false,umbral=UMBRAL}={}) {
      // La similitud no comprueba alcance, límites ni caducidad: los comprueba el llamador.
      if(condicionesComprobadas!==true)return null;
      const casos=tablas.leer('decisiones').filter(f=>f.vigencia==='vigente' && f.tipo===tipo && f.proyecto===proyecto && ['confirmada','corregida'].includes(f.estado)).map(f=>({...f,parecido:parecido(texto,f.condicion)})).filter(f=>f.parecido>=umbral);
      if(!casos.length || new Set(casos.map(f=>f.decision)).size!==1)return null;
      return {respuesta:casos[0].decision,casos:casos.map(f=>f.id),parecido:Math.max(...casos.map(f=>f.parecido)),costo:'0 tokens'};
    },
  };
}
