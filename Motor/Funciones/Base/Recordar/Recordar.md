# Recordar

Responde lo repetido sin modelo, solo con decisiones confirmadas por la persona.

## Uso

```js
import { abrirTablas } from '../Tablas/tablas.mjs';
import { abrirDecisionesEnTablas } from './tablas.mjs';
const tablas = abrirTablas(rutaMemoria);
const decisiones = abrirDecisionesEnTablas(tablas);
const id = decisiones.guardar({tipo: 'decision', proyecto: 'General', texto: 'Condición', respuesta: 'Decisión'});
decisiones.confirmar(id, {confirmadoPorPersona: true});
const resultado = decisiones.recordar({tipo: 'decision', proyecto: 'General', texto: 'Condición'}, {condicionesComprobadas: true});
```

La persona confirma o corrige; el parecido de palabras no confirma nada. El llamador comprueba condición, alcance, límite y vigencia antes de marcar `condicionesComprobadas`. Si no lo hace, Recordar devuelve `null`. Con decisiones parecidas que se contradicen tampoco responde. Con negaciones solo coincide el mismo texto normalizado.

Las filas se guardan exclusivamente mediante Tablas en `Memoria/Tablas/decisiones.jsonl`. Las reglas del usuario confirmadas regeneran su vista automáticamente. No se crea otro archivo de casos.

`recordar.mjs` conserva la implementación anterior y sus 15 pruebas de compatibilidad, además de los comparadores `palabrasImportantes` y `parecido` que usa Buscar. Su API antigua de archivo no se conecta al ejecutor de v2. Para escribir en la Memoria nueva se usa el adaptador `tablas.mjs`; su prueba de integración comprueba confirmación, corrección y vista sobre la misma tabla.
