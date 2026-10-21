# Guía de Mind

Se abre cuando la persona pregunta qué es Mind, cómo empezar o qué puede hacer. Explica lo pertinente con palabras simples, sin recitar la guía.

## Qué es y cómo empezar

Un segundo cerebro en una carpeta: la **Memoria** conserva lo de la persona y el **Motor** mantiene datos, índices y referencias. La IA interpreta el pedido, consulta el contexto necesario, llama las funciones que necesita, realiza el trabajo y comprueba el resultado antes de responder o entregar un archivo. El Motor no interpreta conversaciones ni dirige la IA.

La persona descomprime el paquete y abre la carpeta con una IA que pueda leer archivos y ejecutar herramientas locales. El paquete no incluye una IA ni un chat. Node viene incluido; no se instala otro ni se modifica PATH. La IA lee Bienvenida y, si existe, Inicio. Antes de usar funciones invoca Mind.cmd sin pedido para comprobar el estado. Sin canal publicado o sin red se usa la versión local.

No hay formulario previo. La Memoria empieza vacía y sus vistas aparecen al registrar datos. Si la persona ya tiene un sistema anterior en otra carpeta, ordenado o no, la IA lo abre junto a este Mind y lo adapta siguiendo las Reglas de Recepción, sin modificar el original. La IA hace las llamadas internas; la persona puede empezar conversando y trabajando.

## Qué permite

- Conservar Perfil, reglas, decisiones y conocimientos, diferenciando declaraciones de observaciones.
- Organizar proyectos y frentes con estado, turno y siguiente paso. El Controlador muestra esas filas; no ejecuta tareas.
- Crear o vincular la colección de cada proyecto. Los archivos pueden quedar en una carpeta externa, existente, sincronizada, en enlaces o dentro de Mind; el índice permanece en Memoria.
- Inventariar metadatos, resolver ubicaciones y registrar qué elementos utiliza un frente. Reutilizar referencias evita duplicar archivos; reubicar copia y verifica antes de cambiar la raíz, conservando el original.
- Buscar en tablas o ramas y reutilizar decisiones confirmadas con Recordar. La coincidencia es por palabras: si falta contexto, hay conflicto o devuelve null, la IA busca, revisa o pregunta.
- Adaptar un sistema anterior: la IA propone la correspondencia, pregunta lo ambiguo y escribe con el Motor citando la procedencia.
- Actualizar o reparar archivos oficiales con verificación y respaldo. Una adaptación del formato de Memoria requiere autorización y conservación comprobada.

## Límites

Inventariar no abre ni descarga contenido. Guardar un enlace no comprueba acceso remoto. No se instala ni configura sincronización de nube: una carpeta sincronizada depende del proveedor que la persona ya use. Compartir o exportar proyectos completos no tiene una operación automática implementada.

Las piezas propias van en Memoria o Del usuario. Las extensiones externas necesitan escaneo SAFE y autorización; todavía no hay un cargador aislado para ejecutarlas. Un escaneo no garantiza seguridad absoluta. Lo retirado de las tablas conserva historial. Las actualizaciones compatibles no escriben Memoria; una adaptación autorizada transforma su estructura en una copia cotejada y conserva respaldo.

La entrega funciona y se ha probado en Windows x64. El paquete incluye runtime ARM64, pendiente de ejecución en un entorno ARM64. Las versiones oficiales llegan por un canal firmado cuando hay red; sin red se usa la versión local. Los mapas distinguen estas limitaciones del código disponible.

## Mind 1.2.1

La línea del nuevo Motor es Mind 1.2. Esta mejora es 1.2.1 y las siguientes serán 1.2.2, 1.2.3, etc. Las construcciones técnicas 2.0.0-dev y el Mind anterior se conservan como historia; no se reescriben sus paquetes ni sus registros.

La lectura empieza en Inicio, Perfil, Proyectos y Biblioteca. Con muchos frentes, Inicio muestra un resumen y conserva los siguientes pasos en sus fichas. Obsidian recibe valores iniciales de navegación y gráfico; los filtros propios se conservan y los cambios se respaldan.

Para conectar Drive, OneDrive, Dropbox u otra nube con carpeta sincronizada, indica la carpeta que ya usa su aplicación. Mind recuerda la elección y sitúa allí las colecciones nuevas. Las existentes se trasladan cuando lo pidas, copiando y comprobando antes de cambiar sus referencias. La copia en el servidor se comprueba con el proveedor; nunca se deduce de que exista una unidad local. No se configura ningún respaldo automático al elegir la carpeta.
