# Reglas de Colecciones

Estas reglas vienen con Mind y son iguales para todos. Las Colecciones de cada persona viven en su Memoria y crecen trabajando con ella.

## Qué son

Las colecciones reúnen recursos físicos o enlaces y su índice ligero. Cada proyecto tiene una raíz propia, sin exigir que sus archivos estén dentro de Mind. Perfil y Proyectos aportan contexto; cuando necesita recursos, la IA consulta el índice y comprueba su ubicación.

El Motor es la puerta para escribir tablas y mantener referencias. La IA abre o crea el recurso físico con las herramientas necesarias para el pedido; el Motor no crea por sí solo un entregable ni procesa el contenido de todos los archivos.

## Colecciones y tablas

- **Colección:** una carpeta real con archivos, ordenada. Es la arquitectura de archivos.
- **Tablas:** cinco bases de datos posibles en `Memoria/Tablas/`: Perfil, Proyectos, Decisiones, Colecciones y Conceptos. El Motor busca en la que corresponde. La tabla Colecciones tiene una ficha por colección; las demás guardan sus propios elementos.

Cada proyecto tiene una colección raíz propia; las colecciones que no son de un proyecto son de la persona. A quién pertenece no lo dice la carpeta, lo dice su ficha (`proyecto`). Además, cualquier colección puede conectarse a otros proyectos, frentes o al Perfil (`conectadoA`) sin cambiar de dueño.

Las Colecciones reúnen las carpetas propias y las que otra persona comparte.

## La ficha de una colección

| Campo | Qué guarda |
|---|---|
| Clase | Colección raíz, subcolección o elemento |
| Nombre y Descripción | Cómo se llama y qué es |
| Proyecto | El proyecto dueño (solo la raíz; vacío si es de la persona) |
| Padre y Colección | Dónde cuelga un elemento y a qué colección raíz pertenece (los pone el Motor) |
| Ubicación y Dirección | Cómo se resuelve y dónde está: local o sincronizada (ruta absoluta), dentro de Mind (relativa a Memoria), relativa a su colección o enlace |
| Disponibilidad y Comprobado | Lo último que se observó y cuándo |
| Conectado a | Otros proyectos, frentes o el Perfil que la usan, sin ser dueños |
| Dueño | Propia, o compartida por quién |
| Patrón | Cómo se reconoce lo que hay adentro |
| Pendiente | Lo que la persona tiene que decidir (por ejemplo, a qué proyecto asignarla) |

## Cómo se busca

El agente pide a Buscar lo que necesita. La tabla Colecciones devuelve dirección, conexiones y patrón para encontrar el recurso; `coleccion resolver` da su localizador y si está disponible ahora. Buscar consulta filas, no abre recursos externos. El recuperador de archivos por patrón y el empaquetado aún no se construyen en este lote.

El índice se actualiza cuando se pide inventariar o registrar un elemento. No hay un observador residente que capture todo cambio externo: antes de usar una carpeta, comprobar o indexar el ámbito necesario. El patrón y la descripción ayudan a buscar, pero no prueban que todos los archivos estén registrados ni disponibles.

## Compartir y empaquetar

Estas son posibilidades de diseño, no operaciones automáticas implementadas. No existe exportación o importación completa de un proyecto ni intercambio automático entre dos Memorias. Registrar una carpeta compartida o un enlace no concede permisos en su proveedor. Cualquier entrega manual se acuerda con la persona y verifica su contenido y destino; no incluye por defecto Perfil, reglas ni proyectos ajenos. El ZIP de distribución contiene el Motor oficial, no proyectos personales.

## Índices por niveles

Las tablas son índices, no los archivos: los archivos pesan y viven en sus carpetas (disco o nube); cada fila guarda dónde está un elemento, a qué se conecta y cómo reconocerlo. Para que ninguna tabla acumule miles de filas, el índice se distribuye como las carpetas: la tabla principal tiene pocas filas (las ramas) y cada fila puede apuntar, con su columna **Rama**, a una tabla hija en su propio archivo (`Tablas/colecciones/<rama>.jsonl`), que a su vez puede tener sus ramas.

- El agente baja de nivel leyendo solo la tabla que necesita: busca en la raíz y, si una fila trae `rama`, busca dentro de ella.
- Cuando una tabla o una rama pasa de 100 filas vigentes, el Motor avisa en el recibo para dividirla.
- Abrir una rama (`rama` en el ejecutor, `abrirRama` en Tablas) requiere la confirmación de la persona, salvo que haya confirmado la autonomía para ramas (Reglas de Decisiones). Clasificar qué va en cada rama lo decide el agente con la persona; el código no inventa el significado.
- Una fila se conecta a un frente, a un proyecto o al Perfil con `conectadoA`; la ficha del frente muestra las que le corresponden.

## Preparar la colección de un proyecto

La acción proyecto la crea o vincula en la misma operación lógica. Predeterminado: carpeta externa en el Escritorio conocido del usuario, sin deducir rutas a mano. Se puede elegir otra base, una carpeta existente, una carpeta sincronizada, un enlace o dentro de Mind. La acción coleccion/preparar atiende proyectos anteriores sin colección; coleccion/buscar consulta su índice. Vincular conserva los archivos. Una ubicación inaccesible o ambigua pide una decisión concreta y no se declara éxito.

## Inventariar, resolver y reubicar

El código mantiene el índice; el agente decide cuándo pedirlo y qué significa cada cosa.

- **Inventariar** (`coleccion indexar`) se pide explícitamente o al usar una carpeta, acotado a esa subcolección. Registra carpetas y archivos por nombre, tipo y disponibilidad, sin abrirlos ni descargarlos. No inventa descripciones: la clasificación la aportan la persona o el agente. Abrir ramas nuevas pide confirmación, salvo autonomía para ramas.
- **Ausente no es borrado:** un archivo que falta conserva su ID y su referencia. Si parece renombrado o movido, el Motor lo propone y la persona decide revincular; nunca se fusiona por parecido. Con el mismo tamaño y la misma fecha la coincidencia es fuerte, aun en otra carpeta, pero sigue siendo una propuesta: dos copias idénticas coinciden. Si hace falta certeza, el agente puede comparar el contenido abriendo los archivos. Una carpeta que no se pudo leer no retira nada.
- **Cambios de contenido:** el inventario guarda tamaño y fecha de cada archivo, sin abrirlo, y marca como modificado el que cambió.
- **Resolver** (`coleccion resolver`) comprueba la entrada local antes de usarla. En una carpeta sincronizada, abrir el contenido puede requerir que el proveedor lo descargue: se hace solo cuando el trabajo lo necesita. Un enlace (`coleccion registrarEnlace`) se guarda y se devuelve sin comprobar existencia, permisos ni sincronización.
- **Reubicar** (`coleccion reubicar`) necesita la confirmación de la persona. Copia a un destino nuevo o vacío, verifica cada archivo y solo entonces cambia la raíz; los IDs y las referencias de los frentes no cambian. El original no se borra y un destino ocupado no se mezcla. Desde una carpeta sincronizada hace falta permitir la descarga; a o desde un enlace no se copia.
- Symlinks y junctions no se siguen. Todo lo que no se pudo comprobar se informa; no se da por hecho.
