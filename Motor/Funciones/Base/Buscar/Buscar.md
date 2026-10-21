# Buscar

Consulta una de las cinco tablas sin modelo, con los comparadores de Recordar. Filtra vigencia, jerarquía de facetas o temas y conexiones. Entrega diez filas por defecto, hasta cincuenta por petición. Ante igual puntuación ordena primero la fila cuyo nombre contiene el texto buscado tal cual y después la más reciente; `compararResultados` es ese orden y Colecciones lo usa al juntar ramas. Si los empates superan el límite, la fila literal entra y desplaza a otra empatada. La coincidencia sigue siendo por palabras, así que la IA comprueba el nombre antes de usar un resultado. La expansión por conjunto termina incluso si los datos contienen ciclos.

`avisosCrecimiento(tablas, {tabla})` detecta facetas o temas con más de cien entradas vigentes y propone subdividir a la persona. `buscar` acepta `alAvisar`; el ejecutor devuelve filas y avisos. No crea temas ni facetas por su cuenta. API completa en `../../Funciones.md`.

Con `rama`, busca dentro de esa tabla hija y no en la raíz. Las filas que traen `rama` indican por dónde seguir bajando.
