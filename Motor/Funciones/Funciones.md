# Funciones

El paquete incluye Node portátil. La IA usa Mind.cmd y pedidos JSON; no necesita Node global ni cambiar PATH. Colecciones consulta el Escritorio conocido mediante Windows PowerShell. Las funciones no instalan herramientas ni conectan cuentas.

## Base y Del usuario

`Motor/Funciones/Base/` contiene las siete Funciones directas de Mind: Tablas, Frentes, Colecciones, Buscar, Recordar, Seguridad y Adaptar. La persona no edita este código oficial y las actualizaciones lo renuevan. `Motor/Funciones/Del usuario/` contiene lo que la persona crea o incorpora: ninguna actualización lo borra ni modifica. Ambas carpetas tienen su equivalente en `Motor/Capacidades/`; las dos partes de Capacidades y Del usuario de Funciones empiezan vacías de fábrica.

El ejecutor importa solo las Funciones de Base. La suite del taller incluye Base, ejecutor, actualizador y Distribución mediante Motor/probar.mjs; nunca descubre ni ejecuta código de Del usuario. El paquete distribuido no incluye pruebas.

- Tablas: `abrirTablas(rutaMemoria).inicializar()`, `alta(tabla, fila, {rama})`, `actualizar(tabla, id, cambios, {rama})`, `retirar(tabla, id, {rama})`, `leer(tabla, {historia, rama})`, `ramas(tabla)`, `abrirRama(tabla, idPadre, {rama, nombre, confirmadoPorPersona})`, `regenerar()`, `elemento({coleccion, elemento})`, `operacion({idPedido, tipo, datos}, fn)` (con `ctx.lote` para muchas filas de Colecciones), `operacionesPendientes()`, `descartarOperacion({idPedido, confirmadoPorPersona})`, `liberarCandado({confirmadoPorPersona})`. Colecciones y Conceptos admiten ramas (`Tablas/<tabla>/<rama>.jsonl`, con su CSV y su vista en `Vistas/<Tabla>/<rama>.md`); escribir en una rama solo proyecta esa rama. Esquema 3 (el 2 más `tamano` y `modificado` de los elementos de archivo): Colecciones distingue `clase` (coleccion, subcoleccion, elemento), propiedad (`proyecto`, solo en la raíz), `padre`, `coleccion`, `ubicacion`, `disponibilidad`, `comprobado` y `pendiente`; un frente guarda `elementosUsados` (objetos `{coleccion, elemento}`). Detalle en `Base/Tablas/Tablas.md`.
- Frentes: `abrirFrentes(tablas)`; altas con `{confirmadoPorPersona: true}`, cambios de turno, siguiente paso, proyecto, padre (`perteneceA`) o estado. `altaProyecto` abre siempre el proyecto y su colección raíz en una operación recuperable. `uso({operacion, frente, elementos})` registra, retira o consulta los elementos que usa un frente, sin copiarlos (detalle en `Base/Frentes/Frentes.md`).
- Colecciones: `abrirColecciones(tablas)`; `preparar({proyecto, coleccion, idPedido, confirmadoPorPersona})` crea o vincula la colección de un proyecto existente y `buscar({coleccion, rama, texto, limite})` consulta su índice. `indexar` inventaría por metadatos la colección o una subcolección; `resolver` devuelve localizador y disponibilidad observada; `registrarEnlace` guarda un enlace sin acceder a él; `reubicar` copia, verifica y cambia la raíz conservando IDs. Al abrir un proyecto, Frentes usa la misma preparación; sin ubicación explícita crea en el Escritorio conocido de Windows. Detalle en `Base/Colecciones/Colecciones.md`.
- Recordar: abrirDecisionesEnTablas(tablas) consulta Decisiones directamente. Exige condicionesComprobadas:true; tipo, proyecto, estado y coincidencia léxica compatibles. Ante null, conflicto o condiciones inciertas, la IA busca contexto o pregunta; no supone equivalencia semántica.
- Buscar: `buscar(tablas, {tabla, rama, texto, limite, faceta, tema, proyecto, conectadoA, vigente, alAvisar})`; busca en una sola tabla, la raíz o la `rama` indicada. Predeterminado diez filas, máximo cincuenta. `avisosCrecimiento(tablas, {tabla})` sugiere subdividir facetas o temas con más de cien filas vigentes, sin crear divisiones; el ejecutor incluye estos avisos en su salida.
- Seguridad: `escanear(carpeta, {ejecutable})` llama a SkillSpector local con análisis estático, sin modelo; `autorizarExtension` requiere confirmación explícita, manifiesto válido y SAFE con cobertura completa. No instala SkillSpector. Si falta, bloquea.
- Adaptar: `detectarVersion(motor, memoria)`, `prepararMigracion(origen, tallerNuevo)` y `adaptarEsqueleto(motor, memoria, {renombrar, valoresPredeterminados})`. Tablas reexporta la última. Conserva el original, adapta en un candidato y coteja todos los eventos y hashes de archivos antes de activar. Se detiene ante columnas sin regla o versiones no soportadas. El plan viene del Motor; no clasifica texto ni ejecuta transformadores externos. Del esquema 1 al 2 adapta Colecciones en la tabla principal y en todas sus ramas, agregando solo columnas, y devuelve lo que queda `pendiente` para la persona.

## Uso local

Al empezar a usar funciones, invocar Mind.cmd sin pedido (operación inicio); después enviar pedidos JSON UTF-8. En cmd: Mind.cmd < pedido.json. En PowerShell: asignar la ruta del archivo a $env:MIND_PEDIDO y ejecutar .\Mind.cmd. Retirar esa variable antes de otra comprobación sin pedido. Ejemplo:

```json
{"operacion":"ejecutar","accion":"buscar","datos":{"tabla":"proyectos","texto":"web"}}
```

Los datos viajan por stdin; el lanzador no evalúa el pedido como código ni consulta el canal en cada acción. En el taller, la suite completa se ejecuta con Motor/Runtime/win32-x64/node.exe Motor/probar.mjs en x64; el runtime equivalente requiere un entorno ARM64 para esa arquitectura. La CLI de desarrollo node Motor/ejecutar.mjs sigue disponible con JSON por argumento o con - por stdin. No instalar Node global para usarla.

Las otras acciones del ejecutor reciben un objeto JSON: `adaptar` (solo con `confirmadoPorPersona: true`), `buscar`, `alta`, `actualizar`, `retirar`, `recordar`, `seguridad`, `proyecto`, `frente`, `cambiar`, `uso`, `operaciones`, `liberar`, `coleccion`. Las altas de proyecto/frente requieren `confirmadoPorPersona: true`; el llamador es responsable de que corresponda a una decisión real de la persona.

`inicializar` prepara la carpeta de `Memoria` en cero, sin crear archivos de relleno; si se indica `{"sembrar": true}`, llama a `sembrarConceptosMind` para agregar los 18 conceptos de ejemplo oficiales con ID estable sin duplicar filas ni sobrescribir correcciones.

| Acción | Campos del objeto JSON |
|---|---|
| proyecto | `nombre`, `confirmadoPorPersona: true`; opcionales: `descripcion`, `idPedido`, `coleccion` (`{base}`, `{direccion}`, `{ubicacion: "mind"}` o `{ubicacion: "enlace", direccion}`) |
| operaciones | sin campos: lista las operaciones compuestas pendientes |
| liberar | `confirmadoPorPersona: true`: retira el candado solo si su proceso ya no existe |
| uso | `operacion`: `registrar`, `retirar` o `consultar`; `frente`; `elementos` [{coleccion, elemento}]; opcionales `confirmadoPorPersona` (otra colección), `desde`, `limite`, `comprobar` |
| coleccion | `operacion`: `preparar`, `buscar`, `indexar`, `resolver`, `registrarEnlace` o `reubicar`; argumentos y salidas en `Base/Colecciones/Colecciones.md` |
| retirar | `tabla`, `id`; opcional: `rama` |
| rama | `tabla`, `id` de la fila padre, `confirmadoPorPersona: true` (o autonomía confirmada); opcionales: `rama` del padre, `nombre` |
| recordar: guardar | `operacion: "guardar"`, `tipo`, `texto`, `respuesta`, `proyecto` (General por defecto); opcionales: `alcance`, `origen`, `limite` |
| recordar: confirmar | `operacion: "confirmar"`, `id`, `confirmadoPorPersona: true` |
| recordar: corregir | `operacion: "corregir"`, `id`, `respuesta`, `confirmadoPorPersona: true` |
| recordar: recordar | `operacion: "recordar"`, `tipo`, `texto`, `proyecto`, `condicionesComprobadas: true`; opcional: `umbral` |
| seguridad: escanear | `operacion: "escanear"`, `carpeta`; opcional: `ejecutable` |
| seguridad: autorizar | `operacion: "autorizar"`, `carpeta`, `confirmadoPorPersona: true`; opcional: `ejecutable` |

El JSON va como un solo argumento entre comillas simples, con las comillas internas escritas como `\"`. Esa forma funciona igual en Windows PowerShell 5.1, PowerShell 7 y bash; sin las barras, PowerShell 5.1 borra las comillas y la llamada falla.

```powershell
node Motor/ejecutar.mjs buscar Memoria '{\"tabla\":\"conceptos\",\"tema\":\"Mind\",\"limite\":17}'
node Motor/ejecutar.mjs retirar Memoria '{\"tabla\":\"conceptos\",\"id\":\"id-de-la-fila\"}'
```

Un escaneo bloqueado o una operación inválida salen con código 2. `seguridad autorizar` comprueba la autorización en esa invocación: el JSON de salida es un recibo, no una capacidad ejecutable ni una activación persistente. No carga extensiones. Una decisión guardada entra como propuesta; confirmar o corregir requiere el booleano `true`, no una cadena de texto.

## Persistencia y recuperación

El JSONL es la fuente; contiene eventos `poner` de la fila completa con ID estable. La lectura corriente toma el último evento de cada ID; `{historia:true}` devuelve todos. Retirar agrega un evento con vigencia reemplazada. No se permite cambiar el `tipo` de un registro existente (`proyecto` ↔ `frente`, `faceta` ↔ `entrada`). Los archivos CSV son exportaciones, no una entrada bidireccional. Las vistas se reconstruyen tras cada escritura solo para las tablas que tienen datos, reemplazando o retirando únicamente vistas con la marca del Motor y conservando con aviso cualquier archivo ajeno sin marca. Un candado exclusivo serializa escritores y guarda el proceso que lo tomó; si ese proceso muere, el candado no se retira solo: el error lo informa y la persona lo libera con `liberar`. Las operaciones compuestas dejan su intención en `.operaciones.json` hasta completarse. Un registro truncado o dañado frena la escritura sin descartar bytes. Si el evento se guardó pero falló una proyección, la excepción entrega un recibo estructurado (`err.guardado === true`, `err.vistaPendiente === true`, `err.id`, `err.recibo`), proyecta las tablas sanas y permite reintentar la misma alta o usar `idPedido` sin duplicar filas.

## Funciones y Capacidades adicionales

La persona crea o incorpora sus Funciones en `Motor/Funciones/Del usuario/<nombre>/` y sus Capacidades en `Motor/Capacidades/Del usuario/<nombre>/`. Lo oficial protegido es `Reglas base/`, `ejecutar.mjs`, `Funciones/Base/` y `Capacidades/Base/`. Una actualización renueva solo sus archivos oficiales y conserva Memoria y todo Del usuario; Distribución implementa revisión, actualización, reparación y recuperación con lista oficial explícita. Contrato: Motor/Distribucion/Distribucion.md.

El manifiesto contiene `nombre`, `versionMemoria` (la del esquema vigente, hoy 3; una extensión declarada para otra versión no se autoriza) y `permisos: {leer: [...], escribir: [...]}`. Las listas usan los nombres de las cinco tablas o `propia`. La autorización entrega un objeto inmutable que comprueba la huella antes de cada llamada. `puertaExtension(tablas, permiso)` expone solo esas operaciones, escribe columnas propias en `Tablas/Extensiones/<nombre>.jsonl` y CSV y pasa por la misma exclusión (`.adaptacion.lock`, `.escritura.lock`, `Tablas/.escritura.lock`) y comprobación de `version.json` que las cinco tablas principales. Un cambio de archivos invalida la autorización.

Esta API no impide que código hostil que ya tenga acceso a la PC invoque `node:fs`. Por eso este lote no incluye un cargador ni ejecuta extensiones en el proceso del Motor. Falta construir el aislamiento de ejecución antes de activar extensiones externas. SAFE es resultado de análisis estático, no una garantía absoluta.

## Límites comprobables

La Memoria de fábrica empieza en cero: las carpetas (`Tablas`, `Colecciones`, `Vistas`), los archivos `.jsonl`/`.csv`, las vistas Markdown y `version.json` se crean bajo demanda a medida que cada dominio recibe datos. General se crea al abrir el primer frente general. La adaptación independiente conserva respaldos técnicos de Memoria; la adaptación integrada con una publicación conserva Memoria-original bajo Motor/.respaldos y elimina el trabajo temporal. El actualizador usa un diario y recuperar para restaurar operaciones interrumpidas antes de admitir trabajo. Si no puede comprobar el respaldo, bloquea e informa recuperación pendiente; no declara éxito. Los respaldos con Memoria no se podan automáticamente; se conservan tres respaldos ordinarios del Motor. El límite de lectura de arranque lo mide el actualizador en cada instalación; un número arbitrario de reglas o frentes puede superarlo y exige reducir el resumen con la persona. No hay sincronización de proveedores, empaquetado de proyectos, importación CSV ni ejecución aislada de extensiones. ARM64 real y canal real siguen pendientes de validación/configuración. Adaptar datos reales requiere autorización específica.

## Funciones base

- [[Motor/Funciones/Base/Tablas/Tablas|Tablas]]
- [[Motor/Funciones/Base/Frentes/Frentes|Frentes]]
- [[Motor/Funciones/Base/Colecciones/Colecciones|Colecciones]]
- [[Motor/Funciones/Base/Buscar/Buscar|Buscar]]
- [[Motor/Funciones/Base/Recordar/Recordar|Recordar]]
- [[Motor/Funciones/Base/Seguridad/Seguridad|Seguridad]]
- [[Motor/Funciones/Base/Adaptar/Adaptar|Adaptar]]

## Vistas ramificadas y de consulta

Tablas reconstruye en `Memoria/Vistas/` únicamente las vistas de los dominios que tienen datos: la vista de arranque `Inicio.md` (Reglas del usuario, Resumen del Perfil y Controlador, con nombres y sin rutas), `Índice.md` (los enlaces a cada faceta raíz, proyecto y frente activo, raíz de navegación que no se lee al arrancar), las vistas de consulta (`Decisiones.md`, `Colecciones.md`, `Conceptos.md`) y los árboles derivados de `Memoria/Vistas/Proyectos/` y `Memoria/Vistas/Perfil/`, sin duplicar archivos Markdown en `Memoria/Tablas/`. Los enlaces van del padre a sus hijos directos. Terminar o retirar un nodo quita su rama derivada; no borra sus registros. Los archivos ajenos no se retiran.

El arranque de lectura es Bienvenida.md y Memoria/Vistas/Inicio.md si existe. Esa lectura no ejecuta código. Antes de usar funciones, la IA invoca Mind.cmd sin pedido para comprobar estado y publicaciones; esto sí ejecuta el mantenimiento definido en Distribución. El detalle y las vistas de consulta no se cargan; las líneas de frentes activos y facetas raíz sí cuentan en el arranque. Presupuesto: Bienvenida ≤ 1.000 tokens estimados y Bienvenida + Inicio ≤ 2.000 (`LIMITES` en Tablas). Tablas avisa en cada escritura si Inicio lo supera y el actualizador lo comprueba al instalar; nunca se ocultan filas.

