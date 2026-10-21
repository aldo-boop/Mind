# Reglas de la Memoria

Estas reglas vienen con Mind y son iguales para todos.

## Dónde vive

La Memoria de cada persona vive en una carpeta de su computadora. El agente lee y escribe esa carpeta. El Motor no depende de ningún proveedor para funcionar.

El Motor y los índices de Memoria trabajan localmente. Los archivos de una colección pueden estar fuera de Mind; un enlace puede apuntar a un recurso remoto sin que el Motor lo descargue ni compruebe sus permisos.

## Sin duplicados

Nada se duplica innecesariamente. Antes de crear una pieza, comprueba si ya existe y actualízala en su lugar. Cada dato tiene una única fuente. Las vistas se generan desde ella en `Vistas/`, sin crear vistas Markdown duplicadas dentro de `Tablas/`.

Una tabla, una fuente de verdad y una única vista legible por dominio. `Tablas/` guarda únicamente los datos estructurados (`.jsonl` y `.csv`); `Vistas/` concentra todas las lecturas Markdown generadas por el Motor.

## Estructura

La Memoria empieza en cero y, a medida que hay información, el Motor crea bajo demanda tres carpetas de contenido; los archivos ocultos de versión, candados, operaciones y respaldo son metadatos técnicos:

- **Tablas:** los datos estructurados. Cinco tablas posibles: Perfil, Proyectos (proyectos y frentes), Decisiones, Colecciones y Conceptos. Sus columnas son el contrato con el Motor, iguales para todos. Cada tabla que recibe datos crea su registro `.jsonl` que solo crece y su exportación `.csv` con BOM UTF-8 y formato RFC 4180 para Excel o Sheets. El CSV es una exportación: editarlo no actualiza el JSONL. La edición entra por la Función Tablas. No se escriben archivos Markdown en `Tablas/`.
- **Colecciones:** recursos que la persona elige guardar dentro de Memoria. Cada proyecto tiene una colección lógica propia, pero su ubicación predeterminada es externa; el índice de esa colección vive en Tablas aunque sus archivos estén fuera.
- **Vistas:** lo regenerable en Markdown. Cuando existen datos en su dominio, el Motor genera la vista de arranque `Inicio.md` (Reglas del usuario, Resumen del Perfil y Controlador en un solo archivo, medido en cada escritura), las ramas de detalle (`Vistas/Perfil/` y `Vistas/Proyectos/`) y las vistas de consulta (`Decisiones.md`, `Colecciones.md` y `Conceptos.md`). Nadie las escribe a mano. Las vistas de consulta y las ramas de detalle se abren cuando hacen falta y no se cargan al arrancar. Las reglas del usuario son decisiones generales confirmadas (`proyecto: General`, `tipo: regla-usuario`), no un archivo de origen aparte.

Facetas, proyectos y frentes no son carpetas: son valores dentro de las columnas de las tablas. Por eso siguen libres aunque las tablas sean fijas. Si el esqueleto es fijo, debe ser lo más simple posible y nacer vacío hasta que el usuario lo habite.

## La nube

Mind recuerda la carpeta de nube elegida para las colecciones nuevas. La sincronización la realiza la aplicación del proveedor; no hay inicio de sesión ni conexión automática a cuentas. Mind funciona localmente sin cuentas. La persona puede elegir una carpeta que otra aplicación ya sincroniza o registrar un enlace. El inventario comprueba metadatos locales sin descargar; eso no acredita una copia remota. Abrir un recurso sincronizado puede requerir descarga y permisos. La IA verifica acceso y conservación según la operación solicitada, sin deducirlos de la existencia del enlace.

## Colecciones

Las Colecciones reúnen las carpetas de archivos del usuario y sus fichas y referencias en las cinco tablas de `Tablas/`. Detalle en Reglas de Colecciones.

## Actualizaciones y Funciones y Capacidades adicionales

Las piezas de la raíz de Mind son `Bienvenida.md`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` (la entrada para Codex, Claude Code y Antigravity), `Memoria/` y `Motor/`. **Arranque estándar:** cada agente abre el archivo que le corresponde (Claude Code, `CLAUDE.md`; Gemini y Antigravity, `GEMINI.md`; Codex y cualquier otro, `AGENTS.md`). Los tres son mínimos, dicen lo mismo y llevan a `Bienvenida.md`; `CLAUDE.md` y `GEMINI.md` además importan con `@` solo Bienvenida, que siempre existe; `Inicio.md` aparece únicamente cuando hay datos y Bienvenida indica leerlo si existe. `Bienvenida.md` explica cómo funciona Mind, qué leer para empezar (y qué hacer si el Mind es nuevo y aún no tiene `Inicio.md`) y a qué guía acudir si la persona pregunta qué es Mind, sin ejecutar nada, y pesa como máximo 1.000 tokens estimados. El actualizador exige este estándar en cada instalación. Funciones y Capacidades tienen dos subcarpetas: `Base/` para las piezas oficiales de Mind, no editables por la persona y reemplazadas con una actualización; `Del usuario/` para lo que la persona crea o incorpora, que ninguna actualización borra ni modifica. Lo propio vive en `Motor/Funciones/Del usuario/<nombre>/` y `Motor/Capacidades/Del usuario/<nombre>/`.

El Motor oficial instalado incluye las rutas explícitas del manifiesto: reglas, funciones Base, entradas, lanzadores y runtime portátil. Se desarrolla en un taller separado, sin Memoria. Lo propio va en `Del usuario/` o Memoria y no se sobrescribe. `Mind.cmd` consulta al comenzar a usar las funciones y aplica una publicación firmada y compatible sin trabajo activo; sin canal o red, continúa con la versión instalada. No existe servicio residente ni conexión al equipo del desarrollador.

La revisión compara archivos sin modificarlos. Reparar y actualizar sustituyen solo rutas oficiales registradas y verificadas, primero respaldan lo afectado y dejan un diario recuperable. No regeneran vistas ni escriben información del usuario como parte de una actualización compatible. Ante una ruta nueva ocupada por contenido desconocido, se pide decisión. Si fallan la integridad, el respaldo o la comprobación, no se activa el cambio o se restaura lo anterior. Una copia oficial sana puede reparar incluso código del actualizador dañado. Si también se dañó la entrada, la recuperación requiere esa copia externa. Contrato y pedidos: `Motor/Distribucion/Distribucion.md`.

Toda Función o Capacidad externa declara permisos en `manifiesto.json`, pasa primero por Seguridad con resultado SAFE y análisis completo, y recibe autorización explícita antes de acceder a los datos por la API de Tablas. Sus columnas propias quedan en una tabla separada gestionada por esa API, sin alterar las cinco tablas base. No se carga código externo en el proceso del Motor.

La versión del esqueleto vive en `Memoria/version.json`; se comprueba antes de activar otro Motor. Si difiere, el Motor anterior sigue disponible y se solicita autorización separada para adaptar. La operación `adaptar-actualizacion` o `adaptar-local` prepara una copia mediante transformaciones oficiales deterministas y compara todos los eventos, sus columnas, IDs, relaciones e historial, además de hashes de archivos no derivados. Solo cambia el esqueleto; no resume, reclasifica ni descarta información. Sin conservación demostrada, no activa nada. En esta entrada conjunta, el original queda en `Motor/.respaldos/<identificador>/Memoria-original`; la copia temporal de trabajo se elimina al terminar; si una recuperación necesita conservar una candidata, queda en el respaldo con su estado informado. La función de adaptación independiente mantiene además sus respaldos internos. No se invoca una adaptación de la Memoria personal durante la construcción.

Durante una adaptación se regeneran vistas y CSV; la Memoria original completa queda respaldada. Una actualización compatible no los regenera ni toca las tablas. Si una columna no tiene regla, una transformación perdería datos, la versión no es compatible o hay otro escritor, no se activa nada. Clasificar texto exige instrucciones al agente; el código no inventa el significado. Las pruebas de desarrollo usan datos ficticios. Adaptar una instalación con datos reales requiere autorización específica para esa Memoria.

## Versión 1.2.1 — presentación y nube

La línea del Motor construido desde el nuevo comienzo es Mind 1.2; los identificadores 2.0.0-dev pertenecen a sus construcciones técnicas anteriores. Esta mejora se entrega como 1.2.1; las siguientes serán 1.2.2, etc. El esquema de Memoria sigue siendo 3.

Inicio conserva los frentes completos cuando caben. Si supera el presupuesto, muestra sus cantidades y un resumen por proyecto; si ese resumen tampoco cabe, enlaza la lista completa. Los próximos pasos y registros permanecen en las fichas. Nunca se truncan las reglas de la persona ni se eliminan datos para reducir el arranque. Si las reglas y el Perfil por sí solos desbordan el presupuesto, se informa para revisarlos con la persona.

Mind prepara los valores iniciales de Obsidian al empezar y los accesos principales al crear datos. Conserva filtros personalizados y marcadores existentes; respalda los archivos que cambia en .obsidian/.respaldos-mind. La acción de mantenimiento {"operacion":"vista"} permite repetirlo. Las preferencias de Obsidian son de la persona y no forman parte del manifiesto oficial de archivos reemplazables.

Conectar una nube: {"operacion":"ejecutar","accion":"nube","datos":{"operacion":"conectar","carpeta":"RUTA_ABSOLUTA_ELEGIDA","confirmadoPorPersona":true}}. La carpeta debe existir y la aplicación del proveedor debe sincronizarla. La elección queda en Decisiones y Biblioteca; los proyectos nuevos crean su colección en Proyectos dentro de esa base. Una ubicación explícita de proyecto tiene prioridad. {"operacion":"estado"} consulta disponibilidad local. No se piden ni distribuyen credenciales, no se instala ningún proveedor, no se trasladan colecciones existentes al conectar, y un dato local nunca acredita la copia en el servidor. Para trasladar se usa coleccion reubicar: copia, coteja, conserva IDs y deja el original; la comprobación remota se realiza con el proveedor o conector disponible antes de retirar originales.
