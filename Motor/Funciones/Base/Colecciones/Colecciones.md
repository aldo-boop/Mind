# Colecciones

`abrirColecciones(tablas)` gestiona las ubicaciones, la colección raíz de un proyecto y el índice de sus elementos. Toda escritura de filas, ramas, recibos y diario pasa por Tablas. Esta función no conecta cuentas, no descarga archivos y no instala vigilantes.

## Proyecto y colección

`abrirFrentes(tablas).altaProyecto(nombre, descripcion, opciones)` crea siempre el proyecto con su colección raíz en la misma operación recuperable. Requiere `confirmadoPorPersona: true`. Si falta `opciones.coleccion`, crea una carpeta externa en el Escritorio físico que Windows devuelve mediante `Environment.GetFolderPath(DesktopDirectory)`. No construye una ruta a partir del nombre de usuario. Funciona con la ubicación que Windows tenga configurada, incluso redirigida. El nombre legible lleva un sufijo derivado de `idPedido`.

Devuelve `{proyecto, coleccion, ubicacion, recibo}`. Para compatibilidad de llamadas JavaScript previas, también expone los campos de la fila proyecto en el nivel superior (`id`, `nombre`, etc.). Las llamadas nuevas deben usar `resultado.proyecto.id`. La confirmación de un frente general puede crear General con su colección, usando el mismo protocolo.

Renombrar un proyecto cambia sus datos, no mueve su carpeta ni cambia los IDs. Repetir un `idPedido` completado devuelve la misma colección, comprueba la carpeta y recupera vistas pendientes. Un cambio de destino en el reintento exige una decisión; no se realiza una reubicación silenciosa. Una operación interrumpida conserva la ubicación planificada aunque Windows cambie después el Escritorio.

## Entrada de ubicación

| Elección | `coleccion` |
|---|---|
| Externa predeterminada | Omitir, o `{}` |
| Crear dentro de una base externa elegida | `{ubicacion:"local", base:"D:/Trabajo"}` |
| Vincular carpeta existente | `{ubicacion:"local", direccion:"D:/Trabajo/Cliente"}` |
| Carpeta sincronizada existente | `{ubicacion:"sincronizada", direccion:"D:/Carpeta sincronizada/Cliente"}` |
| Crear dentro de carpeta sincronizada elegida | `{ubicacion:"sincronizada", base:"D:/Carpeta sincronizada"}` |
| Enlace o identificador remoto | `{ubicacion:"enlace", direccion:"https://example.org/recurso"}` |
| Crear dentro de Mind | `{ubicacion:"mind"}` |
| Vincular carpeta dentro de Mind | `{ubicacion:"mind", direccion:"Colecciones/Existente"}` |

`modo` puede explicitar `crear` o `vincular`; se infiere de `direccion`. `base` y `direccion` juntos son ambiguos y se rechazan. Nombre y descripción de la colección son opcionales. Una carpeta sincronizada requiere ubicación explícita: no se elige proveedor. Un enlace queda `no-comprobada`; almacenarlo no demuestra acceso remoto.

Antes de acceder se validan los localizadores. Dentro de Mind las rutas son relativas, sin escapes. No se permiten symlinks o junctions en el recorrido de la ubicación. Vincular comprueba tipo y lectura sin escribir en la carpeta elegida; crear comprueba la base y comunica cualquier fallo de creación. Un destino ocupado no se adopta como carpeta nueva.

Si falta una elección o el destino no es accesible, la CLI sale con código 2 y un objeto `{codigo:"DECISION_UBICACION", necesitaDecision:true, decision, error}`; puede incluir el recibo si ya hay una operación pendiente. Se pide una carpeta accesible o un enlace explícito. No se declara éxito ni se escoge otra ubicación automáticamente.

## Acción `coleccion`

`node Motor/ejecutar.mjs coleccion <Memoria> <JSON>`.

- `operacion:"preparar"`: para un proyecto existente sin colección. Campos: `proyecto` (ID o nombre inequívoco), `confirmadoPorPersona:true`, `coleccion` opcional e `idPedido` opcional. Repetir no crea otra raíz. Si el proyecto ya tiene colección, comprueba y devuelve la existente; pedir otro destino exige una decisión para reubicar después.
- `operacion:"buscar"`: `coleccion` (ID o nombre inequívoco), `texto`, `limite` (10 predeterminado, 1–50) y `rama` opcional. Reutiliza Buscar sobre las ramas de esa colección, devuelve resultados acotados y no abre contenido físico. Una rama ajena se rechaza.
- `operacion:"indexar"`, `resolver`, `registrarEnlace` y `reubicar`: índice de elementos (Bloque 3, dev.15), detallado abajo.

Toda decisión pendiente sale con código 2 y `{codigo, error, necesitaDecision:true, decision, detalle?}`; nada se declara hecho. Los resultados largos se acotan: muestras de 10 y listas de 50 con su `total`. El recibo de una operación grande muestra 10 escrituras y `escritosTotal`.

## Índice de elementos (Bloque 3)

**indexar** — `{coleccion, elemento?|rama?, profundidad?, maximo?, revincular?, confirmadoPorPersona?, idPedido?}`. Recorre solo la carpeta de la colección o de una subcolección (`elemento` o su `rama`), hasta `profundidad` niveles (1–64) y como máximo `maximo` entradas (50.000 por omisión; si se supera, pide acotar sin escribir). Lee nombres y tipos del directorio y el `lstat` de cada archivo (tamaño y fecha); el de una carpeta solo si su tipo no es claro. No abre, copia ni calcula hashes de archivos, no recorre el disco, no instala vigilantes ni cambia atributos.

- Cada carpeta es una `subcoleccion` con su propia rama y cada archivo un `elemento`, con `ubicacion: relativa`, `direccion` relativa a la raíz de la colección, `nombre` del sistema de archivos, `disponibilidad`, `comprobado` y, desde el esquema 3, `tamano` y `modificado` leídos con `lstat`. No se inventa `descripcion`; la que aporte la persona o el agente se conserva.
- La identidad es la dirección relativa y la clase dentro de la colección (sin distinguir mayúsculas en Windows). Repetir el inventario no duplica: solo escribe lo que cambió y la fila del ámbito con su nueva comprobación.
- Contenido modificado: si cambian el tamaño o la fecha, la fila se actualiza con el mismo ID y se informa en `modificados` y `modificadosMuestra`. Una fila sin esos datos (anterior al esquema 3 o registrada a mano) solo se completa (`completados`).
- Ausente: solo lo que falta en una carpeta leída completa; conserva su ID. Lo que reaparece vuelve a `disponible` con el mismo ID. Un archivo convertido en carpeta conserva la fila anterior como ausente y abre otra.
- Una carpeta ilegible queda en `errores` y no retira nada de lo que contiene. Un ámbito inaccesible devuelve `AMBITO_INACCESIBLE` sin escribir. Symlinks y junctions no se siguen: van a `omitidos` con su motivo, igual que los ciclos o nombres inválidos.
- Un posible renombre o movimiento externo se devuelve en `revincular.propuestas`, con `coincidencia`: **fuerte** si otro archivo del ámbito tiene el mismo tamaño y la misma fecha (puede estar en otra carpeta; solo se proponen esos), **débil** si solo hay archivos nuevos de su carpeta con su extensión. Nunca se fusiona: dos copias idénticas son dos coincidencias fuertes. Con la decisión de la persona, `revincular:[{elemento, direccion}]` y `confirmadoPorPersona:true` traslada el ID a la nueva dirección. Si está en otra carpeta, la fila pasa a la rama de esa carpeta (`movidos`) y su versión anterior queda retirada en el historial. La fila que ocupaba esa dirección se retira, salvo que un frente ya la use (`REVINCULAR_REFERENCIADO`). La carpeta de destino debe estar en el índice; solo se revinculan archivos.
- Abrir ramas nuevas requiere `confirmadoPorPersona:true` o la autonomía para ramas (`CONFIRMAR_RAMAS`). Una reubicación pendiente bloquea el inventario.
- Persistencia: una operación de Tablas (`tipo: indexar`) con un lote validado (una escritura por rama) y proyección de las ramas tocadas al final. Si se corta tras escribir, queda pendiente; repetir el mismo ámbito la reanuda con el mismo `idPedido` y no duplica. Una vista pendiente queda en el recibo y se recupera con el mismo `idPedido`.
- Devuelve `{coleccion, ambito, comprobado, observados, nuevos, actualizados, modificados, completados, reaparecidos, ausentes, sinAcceso, sinCambios, ramasNuevas, revinculados, movidos, escritos, nuevosMuestra, ausentesMuestra, modificadosMuestra, errores, omitidos, avisos, revincular?, contenido, recibo}`.

Al usar una colección, el agente puede pedir `indexar` con `elemento` y `profundidad: 1` de la carpeta que va a trabajar; la actualización completa es una petición explícita.

**resolver** — `{coleccion, elemento?}`. Sin `elemento`, resuelve la raíz. Valida identidad y propiedad con `Tablas.elemento` y devuelve `{localizador:{tipo:'ruta'|'enlace', valor}, registrada, observada:{disponibilidad, tipo?, motivo?, fecha}, comprobacion, apertura, indiceDesactualizado}`. No escribe en el índice ni abre contenido. Rutas: comprobación local con metadatos y rechazo de symlinks o junctions en el recorrido (`sin-acceso`). En una colección sincronizada, `apertura: puede-requerir-descarga`: se comprobó la entrada local, no que el contenido esté descargado. Enlaces: `no-comprobada` y `requiere-acceso-remoto`; Mind no accede al recurso. Un elemento ausente devuelve `revincular` con candidatos de su carpeta, sin elegir: fuertes (mismo tamaño y fecha, aunque ya tengan fila) o, si no hay, débiles (sin indexar, con su extensión). Para buscar en otras carpetas está `indexar`.

**registrarEnlace** — `{coleccion, dentroDe?, nombre, direccion, descripcion?, confirmadoPorPersona?, idPedido?}`. Guarda un `elemento` con `ubicacion: enlace`, URL o `esquema:valor` y `disponibilidad: no-comprobada`. No descarga ni conecta proveedores. Repetir la misma dirección en el mismo nivel devuelve la fila existente (`repetido`). Se rechazan rutas de disco y los esquemas `file`, `javascript`, `data` y `vbscript`. Si `dentroDe` es una subcolección sin rama, abrirla requiere confirmación.

**reubicar** — `{coleccion, destino:{ubicacion?, base?|direccion?}, modo?:'copiar'|'vincular', confirmadoPorPersona:true, permitirDescarga?, idPedido?, cancelar?}`.

- `copiar` (predeterminado entre carpetas): prepara un destino nuevo o vacío (`base` usa el mismo nombre de carpeta), copia cada archivo a un temporal propio y lo renombra, verifica por SHA-256 y tamaño archivo por archivo y que no sobren ni falten entradas, y solo entonces cambia `ubicacion`, `direccion`, `disponibilidad` y `comprobado` de la raíz. IDs, ramas, direcciones relativas y `elementosUsados` no cambian. El original queda intacto: Mind no lo borra.
- `vincular`: adopta una carpeta que la persona ya preparó si contiene cada elemento indexado con su tipo; si el original sigue disponible y nada es sincronizado, compara contenidos. Faltantes o distintos devuelven `VINCULAR_INCOMPLETO` con detalle.
- Rechazos con decisión: destino con contenido ajeno (`DESTINO_OCUPADO`), dentro del origen o que lo contiene, origen con errores o enlaces (`ORIGEN_INCOMPLETO`), origen sincronizado sin `permitirDescarga:true` (`DESCARGA_NO_AUTORIZADA`), copiar desde un enlace (`ORIGEN_REMOTO`) o pasar a enlace una colección física (`REUBICAR_A_ENLACE`). Entre enlaces se vincula solo la dirección, que queda `no-comprobada`.
- Recuperación: el plan y cada etapa (`destino` copiando/copiado, `verificacion`) quedan en el diario antes de sus efectos. Tras un corte, la raíz sigue en el original; repetir con el mismo destino reanuda y no vuelve a copiar lo terminado. Un nombre final en el destino siempre es una copia completa; un archivo distinto que Mind no terminó detiene la operación. `cancelar:true` abandona una reubicación sin cambio de raíz y conserva la copia parcial para que la persona decida. Un mismo destino ya aplicado devuelve `repetido`.
- Avisa de los elementos con localizador absoluto o de Mind dentro del original: siguen apuntando allí.

## Pruebas y dependencias

Las pruebas inyectan un proveedor de Escritorio ficticio y operaciones de disco controladas mediante `abrirFrentes(tablas, {escritorio, archivos})` o `abrirColecciones(tablas, {escritorio, archivos})`. Esta inyección solo existe en la API de desarrollo, no como opciones ejecutables en el JSON de usuario. No modifica el registro, los permisos de Windows ni el Escritorio real.

Las pruebas del Bloque 3 (`indice-pruebas.mjs`) usan un espía del sistema de archivos que registra cualquier lectura de contenido y simula archivos «solo en línea» como puntos de reanálisis; es una simulación, no un proveedor real. Los junctions se ensayan en Windows. La concurrencia usa dos procesos reales de Node.

La suite consulta también el Escritorio conocido real en modo lectura. Las pruebas de redirección usan una carpeta ficticia con espacios, tildes y estructura OneDrive; no certifican una sesión real de un proveedor de nube. La falta de permisos se inyecta como EACCES; no cambia ACL reales. El paquete de ejecución portátil es del Bloque 5.

Referencia de la API del sistema: [Microsoft: Environment.SpecialFolder, DesktopDirectory](https://learn.microsoft.com/en-us/dotnet/api/system.environment.specialfolder).

## Correcciones de recuperación (dev.17)

`revincular` exige una correspondencia uno a uno: ni el elemento original ni su dirección de destino pueden repetirse. Las rutas se comparan sin distinguir mayúsculas en Windows. Una contradicción devuelve `REVINCULAR_AMBIGUO` antes de escribir. Repetir una revinculación ya aplicada es inocuo; el elemento conserva su ID al volver a una carpeta anterior.

Si se interrumpe un inventario entre escrituras de ramas, el diario conserva el lote validado completo para recuperarlo con el mismo pedido antes de recalcular el inventario. Si se interrumpe una reubicación después de verificar la copia, reanudar compara otra vez las entradas y el contenido actuales de origen y destino antes de activar la raíz: la verificación anterior no acredita la copia actual. Ante diferencias, devuelve `VERIFICACION_FALLIDA`, conserva la raíz original y deja la operación pendiente.
