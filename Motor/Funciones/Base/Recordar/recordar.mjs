// Recordar: responde lo repetido sin modelo, solo con decisiones que la persona confirmó.
// Generaliza a todo el Motor la memoria de decisiones repetidas: no adivina, consulta lo confirmado.
// Los datos son las Decisiones de la persona.
//
// Cuidados que se conservan del Decisor:
// - Todo lo que se guarda entra como «propuesta». Solo la persona, de forma explícita,
//   lo confirma o lo corrige. Así la memoria no se refuerza sola.
// - Solo responde un caso confirmado o corregido, del mismo tipo y la misma forma,
//   cuyo texto se parece al menos `umbral` (0,8) en las palabras importantes.
// - Si los casos parecidos no dicen lo mismo, no responde.
// - Un texto con negación solo coincide con el mismo texto normalizado.
// - El archivo solo crece: una confirmación es una línea nueva; nada se reescribe.
//
// El código vive en el Motor; los datos son de la persona y viven en su Memoria (antes Contexto).
// Por eso la ruta siempre la da quien usa la Función.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

export const UMBRAL = 0.8;

const PALABRAS_VACIAS = new Set(('a al algo algun alguna algunas alguno algunos ante antes aqui asi aun cada como con contra cual '
  + 'cuando de del desde donde dos el ella ellas ello ellos en entre era eran es esa esas ese eso esos esta estaba estan estar '
  + 'estas este esto estos fue fueron ha han hasta hay la las le les lo los mas me mi mis mucho muy nada ni no nos nuestra '
  + 'nuestro o otra otras otro otros para pero poco por porque que quien se ser si sin sobre solo son su sus tambien te tiene '
  + 'tienen todo todos tu tus un una uno unos unas ya yo').split(' '));
const NEGACIONES = new Set(['no', 'sin', 'nunca', 'jamas', 'ni', 'tampoco', 'not', 'never', 'without', 'neither', 'nor']);

const sinTildes = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function palabrasImportantes(texto) {
  return new Set(sinTildes(texto).split(/[^a-z0-9ñ]+/).filter((p) => p.length > 2 && !PALABRAS_VACIAS.has(p)));
}

// Parecido por palabras (coseno sobre conjuntos). Una bolsa de palabras no entiende
// el alcance de una negación: con negaciones solo vale el mismo texto, en el mismo orden.
export function parecido(a, b) {
  const ta = sinTildes(a).match(/[a-z0-9]+/g) || [];
  const tb = sinTildes(b).match(/[a-z0-9]+/g) || [];
  if ([...ta, ...tb].some((p) => NEGACIONES.has(p))) return JSON.stringify(ta) === JSON.stringify(tb) ? 1 : 0;
  const A = palabrasImportantes(a), B = palabrasImportantes(b);
  if (!A.size || !B.size) return 0;
  let comunes = 0;
  for (const p of A) if (B.has(p)) comunes += 1;
  return comunes / Math.sqrt(A.size * B.size);
}

// JSON con claves ordenadas: dos formas iguales dan la misma firma aunque cambie el orden.
function canonico(v) {
  if (Array.isArray(v)) return `[${v.map(canonico).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonico(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}
const firma = (tipo, forma) => `${tipo}|${canonico(forma ?? null)}`;

export function abrirDecisiones(ruta) {
  if (!ruta) throw new Error('Falta la ruta de las Decisiones: viven en la Memoria de la persona.');

  function agregar(registro) {
    mkdirSync(dirname(ruta), { recursive: true });
    appendFileSync(ruta, `${JSON.stringify(registro)}\n`, 'utf8');
  }

  function leer() {
    if (!existsSync(ruta)) return [];
    const casos = new Map();
    for (const linea of readFileSync(ruta, 'utf8').split(/\r?\n/)) {
      if (!linea.trim()) continue;
      let r;
      try { r = JSON.parse(linea); } catch { continue; } // una línea dañada no impide leer las demás
      if (r.tipo === 'caso') casos.set(r.id, { ...r, estado: 'propuesta', original: r.respuesta });
      else if (r.tipo === 'revision' && casos.has(r.id)) {
        const c = casos.get(r.id);
        casos.set(r.id, { ...c, respuesta: r.respuesta, estado: r.estado, fechaRevision: r.fecha });
      }
    }
    return [...casos.values()];
  }

  function buscar(id) {
    const c = leer().find((x) => x.id === id);
    if (!c) throw new Error(`No existe el caso ${id} en las Decisiones.`);
    return c;
  }

  return {
    ruta,
    leer,

    // Guarda una decisión como propuesta. Columnas: Proyecto, Condición (`texto`),
    // Decisión (`respuesta`), Alcance, Origen, Límite y Estado. Sin proyecto, es «General».
    // `tipo` dice qué clase de pregunta es (p. ej. «proyecto-de-nota»); `forma`, opcional,
    // fija lo que la hace igual a otra (opciones, instrucciones). Los dos solo sirven para recordar.
    guardar({ tipo, forma, texto, respuesta, origen, proyecto, alcance, limite }, { ahora = new Date() } = {}) {
      if (!tipo || typeof tipo !== 'string') throw new Error('Falta el tipo del caso.');
      if (typeof texto !== 'string' || !texto.trim()) throw new Error('Falta el texto del caso.');
      if (respuesta === undefined) throw new Error('Falta la respuesta del caso.');
      const id = `D${ahora.toISOString().slice(0, 10).replace(/-/g, '')}-${randomBytes(3).toString('hex')}`;
      const opcionales = Object.fromEntries(Object.entries({ forma, origen, proyecto, alcance, limite }).filter(([, v]) => v !== undefined && v !== ''));
      agregar({ tipo: 'caso', id, fecha: ahora.toISOString(), clase: tipo, texto, respuesta, ...opcionales });
      return id;
    },

    // La vista que se lee: una tabla por proyecto, «General» primero. Con `proyecto`, solo la suya;
    // así cada proyecto muestra sus decisiones sin copiarlas.
    vista({ proyecto } = {}) {
      const celda = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
      const valor = (v) => (typeof v === 'string' ? v : JSON.stringify(v));
      const grupos = new Map();
      for (const c of leer()) {
        const p = c.proyecto || 'General';
        if (proyecto && p !== proyecto) continue;
        if (!grupos.has(p)) grupos.set(p, []);
        grupos.get(p).push(c);
      }
      if (!grupos.size) return proyecto ? `Sin decisiones de ${proyecto}.\n` : 'Sin decisiones.\n';
      const orden = [...grupos.keys()].sort((a, b) => (a === 'General' ? -1 : b === 'General' ? 1 : a.localeCompare(b, 'es')));
      return orden.map((p) => [
        `## ${p}`, '',
        '| Condición | Decisión | Alcance | Origen | Límite | Estado |',
        '|---|---|---|---|---|---|',
        ...grupos.get(p).map((c) => `| ${celda(c.texto)} | ${celda(valor(c.respuesta))} | ${celda(c.alcance)} | ${celda([c.origen, c.fecha.slice(0, 10)].filter(Boolean).join(', '))} | ${celda(c.limite)} | ${c.estado} |`),
        '',
      ].join('\n')).join('\n');
    },

    // Solo cuando la persona lo dice: «sí, era eso».
    confirmar(id, { ahora = new Date() } = {}) {
      const c = buscar(id);
      agregar({ tipo: 'revision', id, fecha: ahora.toISOString(), respuesta: c.respuesta, estado: 'confirmada' });
      return buscar(id);
    },

    // Solo cuando la persona lo dice: «no, era esto otro».
    corregir(id, respuesta, { ahora = new Date() } = {}) {
      const c = buscar(id);
      if (respuesta === undefined) throw new Error('Falta la respuesta correcta.');
      const estado = canonico(respuesta) === canonico(c.original) ? 'confirmada' : 'corregida';
      agregar({ tipo: 'revision', id, fecha: ahora.toISOString(), respuesta, estado });
      return buscar(id);
    },

    // Responde sin modelo si puede; si no, devuelve null y decide quien la llamó.
    // No escribe nada: si quien la usa guarda la respuesta, entra otra vez como propuesta.
    recordar({ tipo, forma, texto }, { umbral = UMBRAL } = {}) {
      const f = firma(tipo, forma);
      const parecidos = [];
      for (const c of leer()) {
        if (!['confirmada', 'corregida'].includes(c.estado) || firma(c.clase, c.forma) !== f) continue;
        const s = parecido(texto, c.texto);
        if (s >= umbral) parecidos.push({ id: c.id, respuesta: c.respuesta, parecido: s });
      }
      if (!parecidos.length) return null;
      if (new Set(parecidos.map((x) => canonico(x.respuesta))).size > 1) return null; // no coinciden: no responde
      return {
        respuesta: parecidos[0].respuesta,
        parecido: Math.round(Math.max(...parecidos.map((x) => x.parecido)) * 100) / 100,
        casos: parecidos.map((x) => x.id),
        costo: '0 tokens',
      };
    },
  };
}
