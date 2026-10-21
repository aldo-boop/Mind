# Mapas del Motor

Las fuentes generar_mapa_general.py y generar_mapa_motor.py representan el Motor 2.0.0-dev.23, esquema 3: Bloques 1 a 5 implementados, reglas y mapas del Bloque 6 y validación integral del Bloque 7 ejecutada localmente, con las Reglas de Recepción. El Bloque 7 tuvo revisión independiente y dev.23 aplica sus correcciones; falta revisar esas correcciones. No tomar un mapa como prueba de una capacidad: contrastar código, reglas y resultados en el informe de construcción.

```powershell
python Motor/Mapas/generar_mapa_general.py --output "ruta/Mapa de Mind completo.pdf" --render "ruta/vista-general.png"
python Motor/Mapas/generar_mapa_motor.py --output "ruta/Mapa del Motor de Mind.pdf" --render "ruta/vista-motor.png"
```

Requieren reportlab y pypdf; pypdfium2 solo para render. No instalan dependencias. Salidas explícitas y fuente adjunta a cada PDF. Segoe UI de Windows o Helvetica; --font-dir permite elegir Segoe. Ninguna ruta personal está fijada en el generador.

Cada generador valida cuadrícula de 12 puntos, relleno de 24, separación entre tarjetas hermanas, ausencia de superposiciones, conectores ortogonales que no cruzan tarjetas ni texto y cuerpo de al menos 11 puntos. Deja un JSON con hashes y medidas. Renderizar y revisar también el mapa completo y zonas densas: estas comprobaciones no sustituyen la revisión visual ni evalúan el significado de las afirmaciones.

Leyenda común: negro para piezas oficiales, claro para información y trabajo; recuadro punteado para agrupación. Flechas continuas muestran lectura, llamada o devolución del resultado; las punteadas referencian ubicación y no representan ejecución. El Controlador es una vista y la IA escoge las funciones. El recorrido termina cuando la IA completa y verifica el trabajo y entrega el resultado a la persona.

Pendientes explícitos: ejecución ARM64 real, elección/configuración y publicación del canal real, revisión de las correcciones dev.23. No están implementados la sincronización de proveedores, el empaquetado completo de proyectos ni un cargador aislado de extensiones. El paquete del Motor no incluye IA ni datos personales. Conservar copia cotejada de los PDF anteriores antes de sustituir los mismos mapas canónicos.
