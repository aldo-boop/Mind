# Distribución, actualización y recuperación

El paquete Windows incluye Node 24.22.0 para x64 y ARM64, licencias y hashes de procedencia. Mind.cmd detecta la arquitectura real con RuntimeInformation en Windows PowerShell 5.1 y ejecuta una copia verificada del runtime en TEMP: así puede actualizar el runtime instalado sin intentar reemplazar el ejecutable en uso. La copia se llama `mind-node-<16 caracteres del hash>.exe`, se hace con un nombre temporal corto y luego se renombra; su contenido se verifica siempre por el hash completo. Si la ruta de TEMP es tan larga que la copia superaría el límite de Windows, se detiene con un mensaje que lo dice; si una copia previa quedó incompleta, se rehace. Las copias de otras versiones se retiran cuando ya no están en uso. No usa Node de PATH ni cambia las políticas de Windows. El script de PowerShell es constante; los pedidos nunca se evalúan como comandos.

## Uso

Desde cmd: `Mind.cmd < pedido.json`. Desde PowerShell: `$env:MIND_PEDIDO = 'ruta absoluta del pedido.json'; & .\Mind.cmd`. Sin pedido, hace la comprobación de inicio. Los pedidos son JSON UTF-8; se admiten BOM y caracteres Unicode. Los argumentos posicionales de Mind.cmd no se interpolan ni se evalúan.

Pedido de trabajo: `{"operacion":"ejecutar","accion":"buscar","datos":{"tabla":"proyectos","texto":"web"}}`. Los `datos` llegan a la función por la entrada estándar, sin el límite de 32.767 caracteres de la línea de comandos de Windows.

El canal se consulta solo con la operación `inicio` (Mind.cmd sin pedido), al empezar a usar Mind. Cada acción de trabajo comprueba recuperación y candados locales, sin red: una acción ejecutar no aplica versiones por su cuenta. La IA debe reservar inicio para el comienzo del trabajo; los candados protegen operaciones activas, no toda la duración de una conversación.

Operaciones de mantenimiento: `inicio`, `revisar`, `recuperar`, `actualizar-local` y `reparar-local` (estas dos con `destino`), `adaptar-actualizacion` (con `confirmadoPorPersona:true`) y `adaptar-local` (con destino y confirmación). Ambas aceptan `simular:true`, que muestra el plan sin copiar ni escribir nada, y `adoptar:true` para un Mind anterior sin recibo. No se aceptan transformadores, claves privadas, funciones ejecutables ni permisos de prueba desde pedidos JSON.

## Versiones publicadas

`archivos.json` es la lista explícita del contenido oficial; `construir.mjs` genera manifiesto, ZIP determinista, inventario y hashes. No descubre documentos en la raíz ni incorpora Memoria, Del usuario, tests o mapas personales. Para preparar: ejecutar el Node portátil con `Motor/Distribucion/construir.mjs pedido-construccion.json`; el pedido contiene `origen` y `salida`. Firmar requiere además `clave` (ID), `archivoClave` (PEM externo al taller), `secuencia` creciente y, opcionalmente, `urlPaquete` y `vence` (por omisión, 180 días después de `publicado`). `archivoPrivadas`, externo al taller, es una lista de palabras privadas, una por línea: si alguna aparece en un archivo oficial, no se construye. Siempre se rechazan rutas de perfiles de usuario y direcciones de correo. La clave privada nunca se distribuye. Las pruebas de autenticidad usan claves ficticias temporales.

El descriptor `canal.json` se firma con Ed25519. `confianza.json` fija canal HTTPS y claves públicas autorizadas. Solo se ejecuta una publicación que pase firma, compatibilidad, hashes, tamaño y validación de rutas. El ZIP se extrae únicamente en un candidato nuevo. URLs del paquete deben permanecer en el origen del canal; no se siguen redirecciones implícitas. Las publicaciones no pueden degradar la versión instalada ni reutilizar contradictoriamente una secuencia ya vista. Un descriptor vencido no se aplica y se conserva la versión instalada.

Desde dev.24 el canal oficial es `https://aldo-boop.github.io/Mind/canal.json` (GitHub Pages, sin redirecciones, mismo origen que el ZIP) y `confianza.json` fija la clave pública `api-duniam-1`. La clave privada vive fuera del taller y del repositorio; el paquete nunca la lleva. Los mecanismos completos se demuestran con un servidor local y firmas ficticias; ese permiso local solo existe en la API de pruebas, no en los pedidos JSON, y la suite aísla su origen con un `confianza.json` sin canal.

## Instalar y reparar con un comando

`instalar.ps1` (en el repositorio, no en el ZIP) descarga `canal.json` y el ZIP desde el canal, comprueba tamaño y SHA-256 del descriptor, extrae en el Escritorio (`Mind`, o `MIND_DESTINO`) y deja que el propio Motor verifique cada archivo contra el manifiesto con `revisar`. Si la carpeta ya es un Mind, no escribe encima: extrae en TEMP y aplica `actualizar-local` (o `reparar-local` si la versión es la misma) con el Motor oficial recién bajado, así conserva Memoria y piezas propias. Una carpeta ajena no vacía se rechaza. Recuperar.cmd repite ese camino sobre su propia carpeta: reparar no exige guardar ningún ZIP. Con `MIND_PEDIDO` definido conserva el uso sin red desde una copia oficial. La primera instalación confía en el origen HTTPS; después, las versiones solo se aplican si pasan la firma de `confianza.json`. Una IA global (CLAUDE.md, AGENTS.md o GEMINI.md del usuario) solo se toca si la persona responde que sí a la pregunta del instalador.

## Conservación y recuperación

Solo se sustituyen las rutas oficiales del manifiesto. Memoria, Del usuario y archivos desconocidos quedan fuera; si una ruta oficial nueva colisiona con un archivo no registrado, se pide decisión. Las instalaciones anteriores sin recibo deben adoptarse explícitamente desde una copia oficial (`adoptar:true`), después de revisar con `simular:true` qué archivos se reemplazarán. Si además la Memoria tiene un esquema anterior, `adaptar-local` con `confirmadoPorPersona:true` y `adoptar:true` hace ambas cosas en una operación cotejada. Los archivos de la versión anterior que ya no son oficiales se conservan como ajenos.

La actualización no regenera vistas ni escribe datos en Memoria. Usa un candado de actualización, el candado compartido de escritura y una marca de sesión por operación de trabajo. Las sesiones de procesos interrumpidos se recuperan al siguiente inicio; una sesión viva difiere la actualización. El diario y los respaldos verificables permiten restaurar tras un fallo o una caída del proceso. Una copia oficial sana puede ejecutar Recuperar.cmd con un pedido reparar-local sobre un Mind dañado. Si se dañó también la entrada, hace falta esa copia externa: no se promete autocuración total.

Un esquema incompatible no se instala. La adaptación, separada y autorizada, prepara una copia; conserva columnas y eventos originales y compara archivos no derivados. Un formato transformado se comprueba por equivalencia lógica; un archivo sin transformación, por hash. La Memoria original queda en el respaldo; la copia de trabajo en TEMP se borra siempre al terminar, porque contiene datos personales. También se borra el paquete descargado. La versión anterior queda operativa si no se demuestra la conservación. Solo se admiten transformaciones oficiales ya implementadas; una versión futura no autoriza a inventar cómo transformar datos.

Tras cada operación confirmada se conservan los tres respaldos de Motor más recientes; los respaldos que guardan una Memoria original nunca se borran solos y se informan.

La ejecución ARM64 necesita Windows ARM64 real o equivalente; incluir el binario o simular su selección no prueba su ejecución. Las pruebas no certifican recuperación ante pérdida física del disco ni frente a software hostil con control total de la máquina.

Los fallos de consulta, descarga, firma o preparación conservan el Motor instalado y se informan como mantenimiento aplazado. Un diario que no pudo restaurarse bloquea el trabajo hasta recuperar una versión coherente. La falta de espacio se prueba mediante un fallo ENOSPC inyectado al respaldar, sin llenar ni cambiar permisos del disco personal.

## Transición a 1.2.x

La serie pública nueva comienza en 1.2.1. La comparación normaliza exclusivamente 2.0.0-dev.N como construcciones 1.2.0-dev.N; no rebaja versiones 2.0.0 estables. Cada publicación conserva la firma, huella, compatibilidad y prohibición de retroceso.

El canal /Mind/canal.json conserva una publicación puente 2.0.0-dev.27 para las instalaciones que todavía usan el comparador anterior. Esa publicación cambia la confianza al canal /Mind/estable/canal.json, que entrega 1.2.1 y sus mejoras sucesivas. Se necesitan ambos canales: sustituir el canal antiguo por 1.2.1 dejaría a sus usuarios sin actualización automática. El instalador nuevo consulta directamente /estable. El estado de secuencia se interpreta por la URL del canal; dentro de cada canal siguen rechazándose publicaciones antiguas o contradictorias. El puente y su firma deben mantenerse disponibles para quienes vuelvan después.
