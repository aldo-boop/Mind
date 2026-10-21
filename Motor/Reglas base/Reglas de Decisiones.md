# Reglas de Decisiones

Estas reglas vienen con Mind y son iguales para todos. Las Decisiones de cada persona viven en su Memoria. La Función Recordar las guarda, las recuerda y las muestra.

## Estructura

Una fila por decisión en `Memoria/Tablas/decisiones.jsonl`, escrita por Tablas y exportada a CSV. Se conservan estas siete columnas, más ID, Tipo, Fecha y Vigencia:

| Columna | Qué guarda |
|---|---|
| Proyecto | A cuál pertenece, o «General» si cruza varios |
| Condición | Cuándo aplica |
| Decisión | Qué se hace |
| Alcance | Hasta dónde llega |
| Origen | La frase de la persona y su fecha |
| Límite | Cuándo volver a consultarle |
| Estado | Propuesta, confirmada o corregida |

Una decisión pequeña («esta nota era del proyecto Aurora») puede dejar vacíos el Alcance y el Límite.

## Reglas del usuario

Las instrucciones generales al agente se guardan con Proyecto `General` y Tipo `regla-usuario`. Solo las confirmadas o corregidas por la persona y vigentes generan la sección Reglas del usuario de `Memoria/Vistas/Inicio.md`. Una propuesta no se convierte en instrucción. La vista conserva condición, alcance y límite para que el agente evalúe cuándo aplica.

## Cómo se ve

- **Buscar** entrega las decisiones pertinentes por proyecto. Recordar puede reutilizar solo las confirmadas o corregidas cuyas condiciones, alcance y límite se cumplan; el parecido de palabras no sustituye esa comprobación.
- **Cada proyecto** muestra solo las suyas. Son las mismas filas: se muestran, no se copian. Si una decisión se corrige, cambia en todas partes.

## Quién confirma

Toda decisión nueva entra como propuesta. Solo la persona, con su palabra, la confirma o la corrige. Solo lo confirmado o corregido puede reutilizarse, y únicamente si sus condiciones, alcance y límite siguen comprobados.

## Autonomía del Motor

Cuánto decide el Motor sin preguntar es una decisión de la persona, y se guarda como cualquier otra: Proyecto `General`, Tipo `autonomia`, Condición con lo que regula y Decisión `automática` o `preguntar`. Solo cuenta si está confirmada o corregida. Hoy la usa una condición: `ramas` (abrir ramas en los índices). Sin esa decisión, el Motor pregunta.

## Recordar sin inventar coincidencias

Recordar consulta Decisiones directamente; no necesita pasar por Buscar. El código filtra tipo, proyecto, vigencia y estado y compara palabras. La IA debe comprobar las condiciones, el alcance y los límites antes de pasar condicionesComprobadas:true: el parecido no los demuestra. Una formulación distinta puede no coincidir, y casos parecidos con respuestas distintas devuelven null. En esos casos la IA consulta más contexto, usa Buscar o pregunta; no confirma automáticamente ni convierte una propuesta en decisión. No hay memoria semántica implementada. El indicador de costo sin modelo se refiere a esa función; leer y usar su resultado sí consume contexto de la IA.
