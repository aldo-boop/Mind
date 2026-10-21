import {randomUUID} from 'node:crypto';
import {USOS} from '../Tablas/tablas.mjs';
import {abrirColecciones} from '../Colecciones/colecciones.mjs';
export {nombreCarpeta} from '../Colecciones/colecciones.mjs';

export function abrirFrentes(tablas,dependencias={}) {
  const colecciones=abrirColecciones(tablas,dependencias);
  const proyecto = id => tablas.leer('proyectos').find(f=>f.tipo==='proyecto' && (f.id===id || f.nombre===id) && f.vigencia==='vigente');
  const exigePersona = o => { if(o?.confirmadoPorPersona!==true) throw new Error('La persona debe abrir o confirmar'); };
  const api={
    // El proyecto nace siempre con su colección raíz en una sola operación recuperable:
    // carpeta (o enlace) → fila del proyecto → fila de la colección → rama para su índice.
    altaProyecto(nombre,descripcion='',opciones={}) {
      exigePersona(opciones);
      if(typeof nombre!=='string'||!nombre.trim()||typeof descripcion!=='string')throw new Error('Proyecto sin nombre o descripción válida');
      const col=opciones.coleccion===undefined?{}:opciones.coleccion;
      // Sin idPedido, se reanuda la operación pendiente del mismo nombre si existe. Se decide con el candado tomado.
      const {resultado,recibo}=tablas.exclusivo(()=>{
      const pendiente=tablas.operacionesPendientes().find(o=>o.tipo==='proyecto'&&o.datos?.nombre===nombre);
      const idPedido=opciones.idPedido??pendiente?.idPedido??'proyecto-'+randomUUID();
      return tablas.operacion({idPedido,tipo:'proyecto',datos:{nombre,descripcion,coleccion:col}},ctx=>{
        const idP=tablas.idDePedido('proyectos',idPedido+':proyecto'), idC=tablas.idDePedido('colecciones',idPedido+':coleccion');
        const previo=proyecto(nombre);
        if(previo&&previo.id!==idP) throw new Error('Proyecto duplicado');
        // Reintento de una operación ya completada: devuelve lo existente sin tocar la carpeta.
        const hechoC=ctx.leer('colecciones').find(f=>f.id===idC);
        if(previo&&hechoC?.rama) { colecciones.comprobarSolicitud(hechoC,col);colecciones.comprobarUbicacion(hechoC); return {proyecto:previo,coleccion:hechoC,ubicacion:{modo:'existente',ubicacion:hechoC.ubicacion,direccion:hechoC.direccion,disponibilidad:hechoC.disponibilidad},repetido:true}; }
        const u=colecciones.prepararUbicacion(ctx,col,nombre);
        const p=ctx.alta('proyectos',{tipo:'proyecto',nombre,descripcion,estado:'activo'},{clave:'proyecto'});
        const c=colecciones.registrarEnOperacion(ctx,p,col,u);
        return {proyecto:p,coleccion:c,ubicacion:{modo:u.modo,ubicacion:u.ubicacion,direccion:u.direccion,disponibilidad:u.disponibilidad}};
      });
      });
      return {...resultado.proyecto,...resultado,recibo};
    },
    altaFrente({nombre,proyecto:ref='General',turno='',loQueSigue='',perteneceA=''},opciones={}) {
      exigePersona(opciones); let p=proyecto(ref);
      if(!p && ref==='General') p=api.altaProyecto('General','Trabajo general',opciones).proyecto;
      if(!p) throw new Error('Proyecto inexistente');
      return tablas.alta('proyectos',{tipo:'frente',nombre,proyecto:p.id,perteneceA,turno,loQueSigue,estado:'activo'});
    },
    cambiar(id,cambios) {
      if(!tablas.leer('proyectos').some(f=>f.id===id && f.vigencia==='vigente')) throw new Error('Proyecto/frente inexistente');
      const permitidos=['turno','loQueSigue','estado','proyecto','descripcion','nombre','perteneceA'];
      if(Object.keys(cambios).some(k=>!permitidos.includes(k))) throw new Error('Campo no permitido');
      if('proyecto' in cambios){ const p=proyecto(cambios.proyecto); if(!p) throw new Error('Proyecto inexistente'); cambios={...cambios,proyecto:p.id}; }
      return tablas.actualizar('proyectos',id,cambios);
    },
    // Elementos que usa un frente: solo referencias {coleccion, elemento}. Registrar no copia el archivo;
    // retirar no lo borra. Usar uno de otra colección pide confirmación y no cambia su dueño.
    uso({operacion,frente:refFrente,elementos=[],confirmadoPorPersona=false,desde=0,limite=10,comprobar=false}={}) {
      if(!['registrar','retirar','consultar'].includes(operacion)) throw new Error('Operación de uso: registrar, retirar o consultar');
      const buscarFrente=()=>{
        const lista=tablas.leer('proyectos').filter(f=>f.tipo==='frente'&&f.vigencia==='vigente'&&(f.id===refFrente||f.nombre===refFrente));
        const f=lista.find(f=>f.id===refFrente)??(lista.length===1?lista[0]:null);
        if(!f) throw new Error('Frente inexistente o ambiguo'); return f;
      };
      const clave=r=>r.coleccion+'/'+r.elemento;
      const normalizar=lista=>{ if(!Array.isArray(lista)||!lista.length) throw new Error('elementos debe ser una lista de {coleccion, elemento}'); return lista.map(r=>{ if(!r||typeof r!=='object'||typeof r.coleccion!=='string'||typeof r.elemento!=='string') throw new Error('Referencia inválida: se requiere {coleccion, elemento}'); return {coleccion:r.coleccion,elemento:r.elemento}; }); };
      const actuales=f=>(f.elementosUsados??[]).map(r=>typeof r==='string'?{coleccion:r.split('/')[0],elemento:r.split('/')[1]}:{coleccion:r.coleccion,elemento:r.elemento});
      if(operacion==='consultar') {
        if(!Number.isInteger(limite)||limite<1||limite>50) throw new Error('Límite permitido: 1–50');
        if(!Number.isInteger(desde)||desde<0) throw new Error('desde debe ser un entero desde 0');
        const f=buscarFrente(), todos=actuales(f);
        const elementos=todos.slice(desde,desde+limite).map(r=>{
          let dato;
          try { const x=tablas.localizar(r); dato={...r,estado:'vigente',nombre:x.elemento.nombre,clase:x.elemento.clase,coleccionNombre:x.coleccion.nombre,propia:x.coleccion.proyecto===f.proyecto,localizador:x.localizador,disponibilidad:x.elemento.disponibilidad||'no-comprobada',comprobado:x.elemento.comprobado||null}; }
          catch(e) { return {...r,estado:/retirado/.test(e.message)?'retirado':'no-disponible',motivo:e.message}; }
          if(comprobar) { const o=colecciones.resolver(r); dato.observada=o.observada; dato.apertura=o.apertura; if(o.revincular) dato.revincular=o.revincular; }
          return dato;
        });
        return {frente:f.id,total:todos.length,desde,limite,elementos,siguiente:desde+limite<todos.length?desde+limite:null,comprobacion:comprobar?'metadatos-locales':'datos-registrados'};
      }
      const pedidos=normalizar(elementos);
      return tablas.exclusivo(()=>{
        const f=buscarFrente(), previos=actuales(f), claves=new Set(previos.map(clave));
        if(operacion==='retirar') {
          const quitar=new Set(pedidos.map(clave)), quedan=previos.filter(r=>!quitar.has(clave(r)));
          if(quedan.length===previos.length) return {frente:f.id,retirados:0,total:previos.length,sinCambios:true};
          const fila=tablas.actualizar('proyectos',f.id,{elementosUsados:quedan});
          return {frente:f.id,retirados:previos.length-quedan.length,total:quedan.length,nota:'Solo se retiró la referencia; el archivo y su índice no cambian.',recibo:fila.recibo};
        }
        const nuevos=[], ajenos=[];
        for(const r of pedidos) {
          if(claves.has(clave(r))||nuevos.some(n=>clave(n)===clave(r))) continue;
          const x=tablas.elemento(r);
          if(x.coleccion.proyecto!==f.proyecto) ajenos.push({...r,coleccionNombre:x.coleccion.nombre,proyecto:x.coleccion.proyecto||null});
          nuevos.push(r);
        }
        if(ajenos.length&&confirmadoPorPersona!==true) throw Object.assign(new Error('Usar elementos de otra colección requiere confirmadoPorPersona: true'),{codigo:'CONFIRMAR_REUTILIZACION',necesitaDecision:true,decision:'Confirmar con la persona que este frente use elementos de una colección que no es la de su proyecto. No cambia su dueño.',detalle:{ajenos}});
        if(!nuevos.length) return {frente:f.id,registrados:0,total:previos.length,repetido:true};
        const lista=[...previos,...nuevos];
        const fila=tablas.actualizar('proyectos',f.id,{elementosUsados:lista});
        return {frente:f.id,registrados:nuevos.length,total:lista.length,...(ajenos.length?{reutilizados:ajenos.length}:{}),...(lista.length>USOS.aviso?{aviso:`El frente usa ${lista.length} elementos (más de ${USOS.aviso}); conviene referenciar una subcolección. Tope: ${USOS.tope}.`}:{}),nota:'Se registró la referencia; no se copió ningún archivo.',recibo:fila.recibo};
      });
    },
  };
  return api;
}
