# Reglas de Proyectos

Estas reglas vienen con Mind y son iguales para todos. Los Proyectos de cada persona viven en su Memoria y se llenan trabajando con ella.

## Proyectos y frentes

Un **proyecto** es de qué cosa se habla: un negocio, un producto o un área continua. Un área que no termina es un proyecto que no termina.

Un **frente** es una línea de trabajo dentro de un proyecto: el sitio web, una campaña, el correo.

Un frente puede dividirse en **subfrentes** en los niveles que la persona quiera. `perteneceA` guarda el ID del frente padre; también se puede indicar su nombre dentro del mismo proyecto. El padre debe estar vigente y sin terminar; no puede formar ciclos.

La prueba: si se puede decir «en esto estoy trabajando hoy», es un frente; si se dice «de esto trata», es el proyecto.

Todo frente tiene proyecto. Si no es de ninguno, va a «General», que se crea al abrir el primer frente general, no como dato de relleno al iniciar. Los demás los crea cada persona, y no hay estructura definida: se pueden guardar los que se quiera.

## Qué guarda cada uno

- **El proyecto** guarda lo común a todos sus frentes: qué es, para qué existe y lo que todos necesitan saber. No tiene pendientes propios: los suyos son los de sus frentes.
- **El frente** guarda la información de esa línea de trabajo y lo que falta por hacer, con su vigencia.

Los dos viven como filas en `Memoria/Tablas/proyectos.jsonl`, con su CSV. Sus archivos viven en las colecciones conectadas. Campos: ID, Tipo, Nombre, Proyecto, Pertenece a, Descripción, Turno, Lo que sigue, Estado, Fecha y Vigencia. Ningún proyecto tiene un documento de Control aparte. Estado distingue activo, pausado y terminado; Vigencia distingue vigente y reemplazada. El frente guarda además elementosUsados: referencias {coleccion, elemento}, nunca los archivos físicos.

## Cómo se abre

La persona abre un frente o un proyecto cuando quiera, con solo decirlo. Si no lo dijo, el agente propone y la persona confirma. El agente puede proponer, pero no abrir. En los dos casos, el código escribe la fila.

El Controlador es una vista generada de los frentes activos. No decide ni ejecuta trabajo. La Función **Frentes** escribe proyectos, frentes y referencias de uso mediante Tablas; es independiente de Recordar. La IA interpreta el pedido y escoge las funciones necesarias.

- **Frente nuevo:** el agente lo propone cuando el trabajo no termina en la conversación. El agente deduce el proyecto de lo que se dijo; si es ambiguo, pregunta una sola vez.
- **Proyecto nuevo:** se propone cuando el trabajo no es de ninguno. Pide solo el nombre y una frase de qué es.
- **Corregir:** cambiar un frente de proyecto cambia su fila; no se copia.

## Tareas rápidas

Una tarea que se resuelve en la conversación no crea frente ni aparece en ninguna lista.

## Vigencia

Cada proyecto y cada frente está activo, pausado o terminado. El agente lee por defecto solo lo activo. Lo terminado queda como historia y se consulta cuando la persona lo pide. Terminar no pierde nada: la información del frente queda en su colección y referenciada en las tablas.

## Cómo llega el agente

Como en el Perfil: de lo ligero a lo pesado, y baja un nivel solo cuando la tarea lo pide.

1. **Controlador:** la lista de los frentes vigentes de todos los proyectos, cada uno con su proyecto y lo que sigue. Se lee primero. Lo arma el código; nadie lo escribe a mano.
2. **El frente y su proyecto:** se abren cuando la tarea es de ese frente, con lo común de su proyecto. Son ligeros a propósito: caben en unas 500 palabras. Lo que no cabe es una fila, no un párrafo.
3. **Colecciones:** nunca se leen enteras. El Motor busca en las tablas con el patrón registrado y trae solo lo que la tarea necesita.

## El Controlador

El **Controlador** es una sección de `Memoria/Vistas/Inicio.md`: la lista de los frentes vigentes. Cada frente es una línea, y «lo que sigue» es un dato de esa línea (se copia del pendiente del frente), no una pieza ni un documento aparte. Así no hay dos lugares que mantener sincronizados y el agente lee un solo archivo. Se llama simplemente «Controlador», sin otro nombre para la lista.

**Qué lleva cada línea.** Cuatro campos: **Proyecto**, **Frente**, **Turno** (quién tiene que mover el frente) y **Lo que sigue** (una frase, tope de una línea; lo que no cabe se queda en el frente). Las líneas se agrupan por proyecto, con «General» primero. Solo se listan los frentes vigentes: no lleva campo de vigencia, porque los pausados y terminados viven en la tabla Proyectos y se consultan cuando la persona los pide.

## La ficha del frente

La vista de cada frente es su ficha de trabajo: con una sola lectura el agente sabe cómo afrontarlo. Lleva el ID del frente, su estado, turno, lo que sigue y descripción; **Del proyecto**, lo común (qué es y hasta cinco decisiones confirmadas); y **Para trabajar**, los índices conectados al frente o a su proyecto (hasta ocho colecciones y ocho conceptos, con su rama si la tienen) y cómo buscar el resto; y **Elementos usados**, hasta ocho archivos o enlaces que el frente usa, con su ruta y su último estado registrado, y cuántos más hay. El Controlador nombra cada frente sin la ruta de su ficha, que se encuentra por nombre en Vistas/Proyectos. El recorrido empieza en Bienvenida e Inicio si existe. Cuando el pedido trata de un frente: Controlador → ficha del frente → Buscar u otra función si hace falta. Las funciones no forman una cadena obligatoria: Recordar consulta Decisiones directamente. Al recibir el resultado del Motor, la IA completa y verifica el trabajo y entrega la respuesta o el recurso solicitado.

## Elementos que usa un frente

Cuando un frente trabaja con archivos concretos, el agente los registra con la acción `uso`: queda la referencia, no una copia. Dos frentes pueden usar el mismo archivo y retirarlo de uno no lo borra. Usar un archivo de la colección de otro proyecto se confirma con la persona y no cambia de dueño. Al retomar el frente, la ficha ya muestra sus recursos; antes de abrir uno, `uso` con `comprobar` o `coleccion resolver` dicen si sigue en su sitio. A partir de 100 referencias conviene referenciar la subcolección completa; el tope es 200.

## Colección al crear un proyecto

La acción proyecto crea siempre su colección raíz en una operación recuperable. Sin ubicación elegida, usa una carpeta externa en el Escritorio conocido de Windows. Puede crear en una base elegida o vincular una carpeta existente, sincronizada, un enlace o una carpeta dentro de Mind. Si el destino falla o es ambiguo, devuelve la decisión concreta; no selecciona otra nube ni carpeta. Renombrar el proyecto no mueve archivos. Detalle de entradas y límites en la Función Colecciones.
