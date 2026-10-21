# Reglas del Perfil

Estas reglas vienen con Mind y son iguales para todos. El Perfil de cada persona vive en su Memoria y se llena trabajando con ella.

## Qué entra al Perfil

Entra lo que describe a la persona, por ejemplo sus intereses, valores, metas personales, capacidades, experiencias, circunstancias y su forma de aprender, decidir, trabajar y comunicarse.

No entra:
- una instrucción a los agentes: va a las Reglas del usuario;
- el estado o las ideas de un producto: van a su frente o a su proyecto;
- lo que cuenta de otras personas.

Una meta personal se resume en el Perfil y enlaza a su frente o a su proyecto.

## Facetas

Cada persona guarda las facetas de información que crea pertinentes. No hay una estructura definida: ninguna faceta viene creada y se pueden guardar las que se quiera.

Una faceta se puede dividir en otras (por ejemplo, Artística en Musical y Visual), en los niveles que la persona quiera. El agente pregunta antes de crear una faceta y nunca limita las divisiones.

## Entrada

Cada dato del Perfil es una entrada dentro de una faceta. Lleva:

- **Afirmación:** el dato, en una frase.
- **Origen:** de dónde salió.
  - **Dijo:** lo declaró la persona.
  - **Hizo:** se observó en lo que hizo, con su fuente.
  - **Interpreta:** hipótesis de Mind; puede fallar y lleva su evidencia.
- **Fecha:** cuándo se registró.
- **Vigencia:**
  - **Vigente:** lo que el agente lee por defecto.
  - **Reemplazada:** cuando la persona dice algo nuevo que la contradice. No se borra: queda como historia y se consulta solo cuando la persona pide ver su evolución.

Lo que la persona dijo o hizo pesa como hecho. Lo que Mind interpreta se trata como hipótesis.

**Confirmación:** una entrada con origen «interpreta» solo cambia a «dijo» cuando la persona la confirma con su palabra. Repetirse en los hechos aumenta su evidencia, pero no la confirma por sí sola. Si la persona la rechaza, queda como reemplazada.

**Fuentes de «hizo»:**
- Encendidas desde el inicio: conversaciones con los agentes, obras terminadas y aprobadas por la persona (videos exportados, textos publicados, código en uso) y resultados de sus proyectos (acciones que pasaron a Avances).
- Apagadas hasta que la persona las autorice, una por una: calendario, tareas y aplicaciones.
- Lo que hizo un agente no prueba algo de la persona.
- Observar una acción no prueba su motivo: el motivo solo lo da la palabra de la persona o una interpretación marcada como tal.

## Cómo se guarda

Todo el Perfil se guarda mediante Tablas en `Memoria/Tablas/perfil.jsonl`, con su exportación CSV: ID, Tipo (faceta o entrada), Faceta, Pertenece a, Afirmación, Origen, Fuente, Evidencia, Límites, Contradicciones, Fecha y Vigencia. Cada faceta tiene su fila con «pertenece a» si es parte de otra. El Resumen lista una línea por faceta raíz; ver una faceta o sus descendientes es una consulta de Buscar, no una copia. Los archivos que usa viven en las colecciones conectadas a él.

## Quién corrige

La persona puede corregir o quitar cualquier entrada de su Perfil cuando quiera. Quitar no borra: la entrada pasa a reemplazada y queda como historia.

## Cuándo se escribe

El agente pide a Tablas que anote lo nuevo cuando aparece. No espera al cierre: así, si se corta, no se pierde nada. Una corrección agrega un evento al registro; nunca borra la historia.

## Cómo se lee el Perfil

El agente siempre lee el Resumen, con una línea sobre lo vigente de cada faceta raíz. Abre una faceta solo cuando la tarea lo necesita; Buscar consulta la tabla y entrega hasta diez filas vigentes de la faceta y sus descendientes, sin bajar nivel por nivel. No infiere un rasgo confirmado a partir de una repetición.
