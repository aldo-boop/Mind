# Mind

**Mind by Api D'Uniam Enterprises** es un segundo cerebro en una carpeta: la **Memoria** guarda lo tuyo (perfil, proyectos, decisiones, conocimientos) y el **Motor** hace que cualquier IA trabaje con orden, rápido y cuidando tu información. Todo vive en tu computadora.

## Instalar

En Windows 10 u 11, abre PowerShell y pega:

```powershell
irm https://raw.githubusercontent.com/aldo-boop/Mind/main/instalar.ps1 | iex
```

Mind queda en el Escritorio, en la carpeta `Mind`. Abre tu IA dentro de esa carpeta (Claude Code, Codex, Gemini, Cursor, Copilot o cualquiera que lea archivos y ejecute comandos locales) y escribe «hola». No hay formulario previo: la Memoria empieza vacía y se llena trabajando.

- Node viene incluido; no instalas nada más ni cambias PATH.
- El instalador comprueba el tamaño y la huella SHA-256 de la descarga y, al terminar, cada archivo contra el manifiesto oficial.
- Si quieres otra carpeta: `$env:MIND_DESTINO = 'D:\Mi carpeta\Mind'` antes del comando.
- Al final te pregunta si quieres que tu IA encuentre Mind desde cualquier carpeta; solo con un «s» añade un bloque marcado a tu CLAUDE.md, AGENTS.md o GEMINI.md globales (guarda una copia `.antes-de-mind`).

## Actualizar y reparar

Mind consulta el canal oficial cuando empiezas a usarlo y aplica solo versiones firmadas y compatibles, sin trabajo activo. Para forzarlo o para reparar archivos oficiales dañados, repite el comando de instalación o abre `Recuperar.cmd` en la carpeta. No hace falta guardar ningún ZIP. Tu Memoria, tus piezas en `Del usuario` y tus archivos nunca se tocan; lo reemplazado queda respaldado.

## Qué hay aquí

Este repositorio es el taller del Motor: código, reglas base, pruebas y el instalador. Las versiones firmadas (ZIP con Node portátil) se publican en https://aldo-boop.github.io/Mind/. Memoria y datos personales nunca entran al paquete.

Para construir una versión: restaura `Motor/Runtime/win32-*/node.exe` desde las URL y huellas de cada `procedencia.json` (no están en git por su tamaño), ejecuta `Motor/probar.mjs` y `Motor/Distribucion/construir.mjs` (ver `Motor/Distribucion/Distribucion.md`). La clave privada de publicación vive fuera del repositorio.

## Límites

Windows x64 probado; ARM64 incluido pero sin ejecutar en equipo real. Versión de desarrollo (`2.0.0-dev`).

## Mind 1.2.1

La línea del nuevo Motor es Mind 1.2. Esta mejora es 1.2.1 y las siguientes serán 1.2.2, 1.2.3, etc. Las construcciones técnicas 2.0.0-dev y el Mind anterior se conservan como historia; no se reescriben sus paquetes ni sus registros.

La lectura empieza en Inicio, Perfil, Proyectos y Biblioteca. Con muchos frentes, Inicio muestra un resumen y conserva los siguientes pasos en sus fichas. Obsidian recibe valores iniciales de navegación y gráfico; los filtros propios se conservan y los cambios se respaldan.

Para conectar Drive, OneDrive, Dropbox u otra nube con carpeta sincronizada, indica la carpeta que ya usa su aplicación. Mind recuerda la elección y sitúa allí las colecciones nuevas. Las existentes se trasladan cuando lo pidas, copiando y comprobando antes de cambiar sus referencias. La copia en el servidor se comprueba con el proveedor; nunca se deduce de que exista una unidad local. No se configura ningún respaldo automático al elegir la carpeta.
