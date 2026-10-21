# Bienvenida

Mind es tu segundo cerebro: **Memoria** guarda lo tuyo y **Motor** hace trabajar a tu IA con orden, rápido y cuidando tu información.

## Al arrancar

Lee `Memoria/Vistas/Inicio.md` (tus reglas, tu Perfil y tus frentes) si existe y aún no lo tienes cargado. No abras nada más hasta que la tarea lo pida.

Si no existe, el Mind es nuevo y está vacío: no hagas preguntas previas, empieza a trabajar. En tu primera respuesta, di en una línea que puede pedirte «¿cómo funciona Mind?» y abrirás la Guía. Inicio se crea cuando haya datos.

## Motor portátil

Antes de empezar a usar las funciones, invoca `Mind.cmd` para comprobar el estado y las versiones. Node ya viene incluido; no instales otro ni cambies PATH. Si Windows pide un permiso real, explícalo sin cambiar sus políticas.

Para trabajar, escribe un pedido JSON UTF-8 en un archivo temporal y pásalo por la entrada estándar: desde cmd, `Mind.cmd < pedido.json`. En PowerShell puedes indicar ese archivo con `$env:MIND_PEDIDO` y ejecutar `Mind.cmd`; la ruta se lee como dato, nunca como código. Ejemplo de pedido: `{"operacion":"ejecutar","accion":"buscar","datos":{"tabla":"proyectos","texto":"web"}}`. La Memoria es la de esta instalación. Conservar el pedido temporal hasta comprobar la respuesta permite revisar un fallo.

La compatibilidad de desarrollo se mantiene: `node Motor/ejecutar.mjs buscar Memoria '{\"tabla\":\"proyectos\",\"texto\":\"web\"}'`. Las comillas escapadas (`\"`) funcionan también en PowerShell 5.1. Usa el lanzador en instalaciones distribuidas.

## Cómo trabajar

- Lee poco: una faceta, un frente o un grupo de reglas solo cuando la tarea lo pida. Si una fila de Colecciones o Conceptos trae `rama`, busca dentro de ella.
- Anota lo nuevo y las decisiones mediante las funciones del Motor; las vistas no se editan a mano. Consulta `Motor/Funciones/Funciones.md` para los contratos.
- Capacidades en `Motor/Capacidades/Base/` y `Motor/Capacidades/Del usuario/`: abre solo el `SKILL.md` necesario.
- Para reutilizar una decisión, usa Recordar directamente, con condiciones comprobadas. Ante null o conflicto, revisa contexto, busca o pregunta. En formato, tono y flujo gana la regla de la persona.

## Protección y actualizaciones

El Motor oficial instalado no se personaliza ni repara editando archivos. Lo propio va en `Del usuario` y en la Memoria. Actualizar y reparar conservan la Memoria, piezas propias y archivos ajenos. Reparar restaura solo archivos oficiales, guarda copia y avisa. Adaptar el formato de Memoria exige autorización, copia, respaldo y conservación comprobada antes de activar; si falla, se conserva el Motor anterior.

Sin canal publicado o sin red se usa la versión local. Las versiones oficiales compatibles se aplican al empezar a usar Mind, sin trabajo activo. No hay un servicio residente. Borrar, credenciales, seguridad y acciones sobre la computadora o la nube mantienen sus protecciones. Nada externo entra sin escaneo SAFE y autorización.

## Reglas base: ábrelas cuando toque

En `Motor/Reglas base/`: qué es Mind o cómo empezar → Guía. Perfil → Reglas del Perfil. Frentes y proyectos → Reglas de Proyectos. Decisiones → Reglas de Decisiones. Archivos y carpetas → Reglas de Colecciones. Estudio → Reglas de Conceptos. Estructura y actualizaciones → Reglas de la Memoria. Traer un sistema anterior → Reglas de Recepción.
