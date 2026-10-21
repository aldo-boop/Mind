# Actualizador de frentes

`abrirFrentes(tablas)` da de alta proyectos y frentes solo con `confirmadoPorPersona: true`. Un frente necesita proyecto; General se crea al abrir el primer frente general.

`cambiar(id, cambios)` actualiza turno, siguiente paso, proyecto o estado (`activo`, `pausado`, `terminado`). Tablas conserva historia y regenera Controlador: cuatro campos por línea, General primero, solo frentes activos de proyectos activos. API completa en `../../Funciones.md`.

Un frente puede tener `perteneceA`, con el ID o nombre de un frente padre del mismo proyecto. Se guarda su ID. Se rechazan padres inexistentes, ambiguos, retirados, terminados o de otro proyecto y los ciclos. No se mueve de proyecto un padre que tiene subfrentes vigentes; primero se resuelve su árbol con la persona.

**Elementos usados (Bloque 4, dev.16).** `uso({operacion, frente, elementos, confirmadoPorPersona, desde, limite, comprobar})`, también como acción `uso` del ejecutor. `frente` es ID o nombre inequívoco; `elementos`, una lista de `{coleccion, elemento}`.

- `registrar` valida cada referencia (colección y elemento vigentes y propiedad) y la agrega sin duplicar; no copia archivos. Los elementos de la colección del propio proyecto no piden confirmación. Los de otra colección, también de la persona, requieren `confirmadoPorPersona:true` (si no, `CONFIRMAR_REUTILIZACION` con `detalle.ajenos`) y no cambian de dueño. Desde 100 referencias avisa; el tope es 200 (`DEMASIADOS_USOS`): para más, se referencia una subcolección.
- `retirar` quita solo la referencia: el archivo y su índice no cambian.
- `consultar` pagina con `desde` y `limite` (10 por defecto, 1–50) y devuelve nombre, colección, si es propia, localizador, último estado registrado y `siguiente`. Con `comprobar:true` agrega la disponibilidad observada ahora mediante `coleccion resolver`. Una referencia retirada o rota aparece con su estado, no se oculta.
- Usar un recurso no abre otro frente. La ficha del frente muestra los ocho primeros (detalle en `../Tablas/Tablas.md`).

**Proyecto con su colección (esquema 2).** `altaProyecto(nombre, descripcion, {confirmadoPorPersona: true, coleccion, idPedido})` abre el proyecto y su colección raíz en una sola operación recuperable: primero la carpeta o el enlace, después la fila del proyecto, la de la colección y la rama de su índice. `coleccion` admite `{base}` para crear una carpeta nueva y legible dentro de una carpeta absoluta (nombre del proyecto más un código corto estable), `{direccion}` para vincular una carpeta existente sin tocar su contenido, `{ubicacion: "mind"}` para crearla en `Memoria/Colecciones/` y `{ubicacion: "enlace", direccion: "https://…"}` para un recurso remoto, sin afirmar que exista. Una carpeta ausente, sin permiso u ocupada se informa sin declarar éxito ni dejar filas. Un corte o una caída dejan la operación en el diario; repetir el pedido (mismo nombre o mismo `idPedido`) la completa sin duplicar proyecto, colección ni carpeta. Sin `coleccion`, el alta sigue siendo la de siempre. La carpeta predeterminada en el Escritorio de la persona llega con la función Colecciones.

Al reanudar o repetir un proyecto con colección local, se vuelve a comprobar que la carpeta guardada existe, es una carpeta y puede leerse. Si desapareció, la operación interrumpida mantiene su pendiente y sus IDs; no inventa otra raíz. Restaurar la ubicación permite reanudar. Los enlaces remotos siguen sin afirmarse comprobados.

Desde dev.14, todo proyecto creado por Frentes obtiene su colección raíz. Omitir `coleccion` crea una carpeta en el Escritorio conocido de Windows. La preparación física está en Colecciones y las escrituras permanecen en Tablas. La respuesta lleva proyecto, colección, ubicación y recibo. La API conserva `resultado.id` como alias de `resultado.proyecto.id`. Ver `../Colecciones/Colecciones.md`.
