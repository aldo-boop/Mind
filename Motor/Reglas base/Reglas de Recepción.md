# Reglas de Recepción

Se abren cuando la persona trae un sistema anterior para adaptarlo a este Mind: otra carpeta con su propia arquitectura, notas, proyectos o instrucciones, ordenada o no. La persona no necesita convertir nada antes: la IA interpreta y propone; el Motor escribe, indexa y valida.

## Qué hace cada uno

- **La IA** lee el sistema anterior, entiende su arquitectura, propone la correspondencia con Mind, pregunta lo ambiguo y, con el visto de la persona, llama a las funciones.
- **El Motor** guarda filas en las cinco tablas, crea o vincula colecciones, inventaría archivos por metadatos y registra referencias. No interpreta texto ni decide la correspondencia.

Si el sistema anterior ya es un Mind con tablas de un esquema conocido, se usa Adaptar (Reglas de la Memoria). Estas reglas cubren el caso general: cualquier otra organización.

## Recorrido

1. **Inspeccionar sin cambiar.** Leer la carpeta anterior solo para entenderla: estructura, tipos de archivo, notas, listas, instrucciones. No ejecutar scripts, macros ni programas que contenga, ni mover o renombrar nada. Antes de empezar, anotar el inventario con tamaño y fecha (o hash) de los archivos que se van a usar, para comprobar al final que el origen quedó intacto.
2. **Proponer la correspondencia.** Presentar a la persona un plan breve, con una línea por pieza: qué es en el sistema anterior → dónde va en Mind.
   - Datos de la persona, gustos y forma de trabajar → **Perfil**.
   - Negocios y áreas → **Proyectos**; líneas de trabajo con pendientes → **Frentes** (con turno y «lo que sigue»).
   - Elecciones tomadas → **Decisiones** (entran como propuesta; se confirman solo con la persona).
   - Lo que estudia o investiga → **Conceptos**.
   - Carpetas de archivos → **Colecciones**.
   - Instrucciones antiguas para la IA → **Decisiones** de tipo `regla-usuario` con proyecto `General` (Reglas de Decisiones); al confirmarlas la persona, aparecen en las Reglas del usuario de Inicio. No van al Perfil y nunca reemplazan las Reglas base.
   - Scripts, macros o habilidades que la persona quiera conservar como herramienta propia → `Motor/Capacidades/Del usuario/`, solo tras escaneo SAFE y su autorización (Reglas de la Memoria). Si no, quedan solo como archivos del sistema anterior.
3. **Preguntar lo ambiguo.** Contradicciones, duplicados, fechas en conflicto o piezas sin destino claro se consultan agrupados en una sola tanda. No se pide clasificar todo de antemano. Lo que la persona no decide queda fuera, anotado en el plan.
4. **Escribir con el Motor.** Solo después del visto de la persona:
   - Abrir proyectos y frentes con `confirmadoPorPersona: true`.
   - Vincular como colección la carpeta del proyecto anterior (`coleccion: {ubicacion:"local", direccion}`), sin copiarla; o, si la persona prefiere traerla a otra ubicación, usar `reubicar`, que copia, verifica y conserva el original. Al proponer vincular, avisar que esa carpeta debe seguir existiendo: si después se borra, sus elementos quedan ausentes.
   - Inventariar con `indexar` y registrar con `uso` los elementos que cada frente necesita.
   - Guardar Perfil, Conceptos y Decisiones citando la procedencia en `fuente` u `origen` (archivo y sección del sistema anterior).
5. **Distinguir original y producido.** Lo copiado o citado del sistema anterior conserva su texto. Un resumen, una clasificación o una síntesis hecha por la IA se marca como tal (Perfil: origen «interpreta» con su evidencia; Conceptos: síntesis con su fuente).
6. **Comprobar antes de entregar.** Contrastar el plan con lo escrito:
   - Cada pieza aceptada tiene su fila.
   - Buscar devuelve los proyectos y frentes; Recordar responde las decisiones confirmadas; `resolver` encuentra los archivos.
   - El origen conserva los mismos tamaños, fechas o hashes.
   
   Informar qué se trajo, qué quedó fuera y por qué, y qué falta decidir. Copiar archivos no cuenta como adaptación si el Perfil, las decisiones, los proyectos y su historial no quedaron consultables.

## Límites

- La recepción no tiene una operación automática de importación: es este recorrido, hecho por la IA con las funciones existentes.
- Sistemas muy grandes se adaptan por partes, un proyecto o un área por vez, con su plan.
- Nada del sistema anterior se borra ni se modifica.
- Datos de otras personas o cuentas en la nube solo entran con autorización explícita y con su ubicación indicada por la persona.
