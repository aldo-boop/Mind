# Reglas de Conceptos

Conceptos guarda lo que la persona estudia, investiga o conversa. Un concepto no describe a la persona y no desaparece al terminar un proyecto.

Vive en `Memoria/Tablas/conceptos.jsonl` y su CSV. Columnas: ID, Concepto, Síntesis (en palabras de la persona), Tema, Pertenece a, Conectado a, Colección / Fuente, Fecha y Vigencia. Las claves del código son `id`, `concepto`, `sintesis`, `tema`, `perteneceA`, `conectadoA`, `fuente`, `fecha`, `vigencia`.

Los temas se dividen libremente con Pertenece a. El Motor consulta Tema y sus descendientes; Conectado a puede vincular proyectos o facetas. Buscar entrega solo los conceptos vigentes pertinentes, con límite predeterminado de diez filas. Lo reemplazado queda como historia.

Tablas valida las columnas y conserva cada corrección como evento. Ninguna extensión cambia el esquema base.

Como en Colecciones, un concepto puede abrir una **rama**: una tabla hija en `Tablas/conceptos/<rama>.jsonl` donde esa materia se desarrolla con más conceptos, sin cargar la tabla principal. La tabla principal guarda los conceptos raíz de cada materia; el agente baja por la rama cuando la persona estudia esa materia. Abrir una rama sigue la misma regla de confirmación o autonomía, y el Motor avisa al pasar de 100 filas.
