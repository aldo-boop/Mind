# Adaptar

`detectarVersion` compara las versiones del Motor y la Memoria. `prepararMigracion` prepara un respaldo y candidato sin activar nada.

`adaptarEsqueleto` bloquea escritores, copia, aplica el plan determinista del Motor (`renombrar` y `valoresPredeterminados` por tabla) y valida todos los eventos, ID, valores y archivos del usuario. Solo después intercambia los directorios y deja el original en `.respaldo-<version>-<identificador>`. No elimina respaldo ni taller. Una columna sin regla o una versión no soportada detienen la activación.

**Esquema 1 → 2.** Además del plan, `adaptarEsqueleto` aplica la regla del Motor para Colecciones en la tabla principal y en todas sus ramas: agrega `clase`, `ubicacion`, `padre`, `coleccion` y, cuando se deduce sin interpretar, `proyecto`. Las direcciones relativas del esquema 1 conservan su significado (`mind`: relativas a Memoria). El dueño sale del único proyecto al que apuntan sus conexiones (el proyecto o un frente suyo); si apuntan a varios, o varias colecciones apuntan al mismo proyecto, ninguna se asigna y queda `pendiente: asignar-proyecto` para la persona. Una rama sin padre único queda `pendiente: sin-padre`. Cada evento conserva ID, orden y valores; solo se agregan columnas. Una rama dañada, una dirección incompatible, un nombre de rama no admitido u operaciones pendientes detienen la activación. El resultado lista los `pendientes`.

**Esquema 2 → 3.** Solo se agregan las columnas `tamano` y `modificado` a Colecciones: ningún evento se reescribe y quedan vacías hasta el siguiente inventario, que las completa sin contarlas como cambios. Desde el esquema 1 se aplica primero la regla del esquema 2 y la Memoria queda en 3. Se comprueba con datos ficticios.

La clasificación semántica no se inventa: requiere instrucciones al agente antes de reintentar. Una caída durante el intercambio puede exigir recuperar el original desde el taller conservado. Esta función se comprueba con datos ficticios; no ha migrado una instancia personal. API completa en `../../Funciones.md`.
