// Ejemplo oficial del producto: describe Mind, nunca a una persona.
export const CONCEPTOS_MIND = Object.freeze([
  ['c-mind','Mind','Mind','','Segundo cerebro local que une tu Memoria personal con un Motor actualizable para trabajar con agentes sin perder información.'],
  ['c-memoria','Memoria','Memoria','Mind','Capa que guarda todo lo que pertenece a la persona (Tablas, Colecciones y Vistas); crece con el uso y ninguna actualización del Motor la sobrescribe.'],
  ['c-motor','Motor','Motor','Mind','Capa con las Reglas base y el código base de Mind, más las Funciones y Capacidades; al actualizar solo se renueva lo base sin tocar lo creado por la persona.'],
  ['c-tablas','Tablas','Memoria','Mind','Las cinco bases de datos fijas de la Memoria (Perfil, Proyectos, Decisiones, Colecciones y Conceptos) guardadas en JSONL con copia CSV para Excel o Sheets.'],
  ['c-colecciones','Colecciones','Memoria','Mind','Carpetas de archivos reales que la persona organiza a su gusto y conecta al Perfil o a uno o varios proyectos mediante su ficha.'],
  ['c-vistas','Vistas','Memoria','Mind','Documentos que el Motor regenera solo desde las tablas; Inicio.md reúne las Reglas del usuario, el Resumen del Perfil y el Controlador para que el agente arranque rápido.'],
  ['c-perfil','Perfil','Memoria','Mind','Tabla que registra lo que describe a la persona (lo que dijo, lo que hizo y lo que Mind interpreta) organizado en facetas divisibles.'],
  ['c-faceta','Faceta','Memoria','Mind','Área libre del Perfil que la persona crea y puede subdividir en los niveles que quiera usando el campo «Pertenece a».'],
  ['c-proyectos','Proyectos','Memoria','Mind','Tabla que guarda los proyectos (de qué trata cada área o negocio) y sus frentes activos, pausados o terminados.'],
  ['c-frente','Frente','Memoria','Mind','Línea de trabajo concreta dentro de un proyecto (o en «General»), con su responsable en turno y el siguiente paso.'],
  ['c-controlador','Controlador','Memoria','Mind','Sección de Inicio.md que lista todos los frentes activos agrupados por proyecto con su turno y lo que sigue.'],
  ['c-decisiones','Decisiones','Memoria','Mind','Tabla de acuerdos y reglas confirmadas por la persona, con su condición, alcance y límite para no volver a preguntar lo ya decidido.'],
  ['c-reglas-usuario','Reglas del usuario','Memoria','Mind','Instrucciones generales confirmadas por la persona para sus agentes; viven en la tabla Decisiones y se proyectan como vista de arranque.'],
  ['c-conceptos','Conceptos','Memoria','Mind','Tabla de conocimientos que la persona aprende al estudiar, trabajar o conversar, organizados por temas divisibles sin ensuciar el Perfil.'],
  ['c-reglas-base','Reglas base','Motor','Mind','Guías estándar que vienen con el Motor (reglas de cada pieza; lo esencial va en Bienvenida) y definen cómo lee, escribe y protege el agente.'],
  ['c-nucleo','Núcleo','Motor','Mind','Lo esencial que todo agente lee al arrancar, dentro de Bienvenida: qué leer, cómo trabajar y las protecciones intocables.'],
  ['c-funciones','Funciones','Motor','Mind','Módulos en código dentro del Motor divididos en Base (las siete funciones directas de Mind, no editables por la persona) y Del usuario (las funciones propias que la persona crea o suma).'],
  ['c-capacidades','Capacidades','Motor','Mind','Habilidades especializadas dentro del Motor divididas en Base (directas de Mind, no editables por la persona) y Del usuario (las que la persona crea o incorpora tras pasar por Seguridad).'],
].map(([id,concepto,tema,perteneceA,sintesis])=>Object.freeze({id,concepto,tema,perteneceA,sintesis,fuente:'Motor/Reglas base'})));

export function sembrarConceptosMind(tablas) {
  const anteriores=new Set(tablas.leer('conceptos',{historia:true}).map(f=>f.id));let agregados=0;
  for(const fila of CONCEPTOS_MIND){
    if(anteriores.has(fila.id))continue;
    try{tablas.alta('conceptos',fila);agregados++;}
    catch(e){if(!e.message.includes('ID duplicado')||!tablas.leer('conceptos',{historia:true}).some(f=>f.id===fila.id))throw e;}
  }
  // No sobrescribe correcciones ni revive conceptos que la persona retiró.
  return {agregados,conceptosBase:CONCEPTOS_MIND.length};
}
