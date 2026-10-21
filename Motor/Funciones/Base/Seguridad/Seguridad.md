# Seguridad

Envoltorio de SkillSpector. `escanear(carpeta, {ejecutable})` usa un ejecutable local explícito o `MIND_SKILLSPECTOR`; nunca lo instala. Ejecuta análisis estático sin modelo. Solo admite SAFE con cobertura completa y ejecución exitosa; ante error, falta de analizador, enlace o cambio de contenido, bloquea.

`autorizarExtension` exige confirmación de la persona, manifiesto con nombre seguro, versión de Memoria compatible y permisos válidos. Devuelve permisos inmutables y comprueba huella antes de cada acceso. No incluye un cargador ni ejecuta extensiones. El análisis estático y la API limitada no son una caja de aislamiento del sistema operativo. API completa en `../../Funciones.md`.
