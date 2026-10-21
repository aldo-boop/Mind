// Pruebas de la Función Recordar. Usan una carpeta temporal; no tocan datos reales.
// Uso: node --test pruebas.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { abrirDecisiones as crearMemoria, parecido } from './recordar.mjs';

const OPCIONES = { aurora: 'Taller Aurora', brisa: 'Brisa', api: "Nodo Sur" };
const NOTA = 'Rosa me pasó este correo. Me dice que enviemos la información ahí.';
const PARECIDA = 'Rosa me mandó un correo y dice que le enviemos la información ahí.';

function nueva() {
  const dir = mkdtempSync(join(tmpdir(), 'recordar-'));
  return { m: crearMemoria(join(dir, 'sub', 'decisiones.jsonl')), limpiar: () => rmSync(dir, { recursive: true, force: true }) };
}

test('sin ruta no arranca', () => {
  assert.throws(() => crearMemoria(), /ruta/);
});

test('una propuesta no responde: solo lo confirmado', () => {
  const { m, limpiar } = nueva();
  try {
    m.guardar({ tipo: 'proyecto', forma: OPCIONES, texto: NOTA, respuesta: 'aurora' });
    assert.equal(m.recordar({ tipo: 'proyecto', forma: OPCIONES, texto: NOTA }), null);
  } finally { limpiar(); }
});

test('un caso confirmado responde un texto parecido, con 0 tokens', () => {
  const { m, limpiar } = nueva();
  try {
    m.confirmar(m.guardar({ tipo: 'proyecto', forma: OPCIONES, texto: NOTA, respuesta: 'aurora' }));
    const r = m.recordar({ tipo: 'proyecto', forma: OPCIONES, texto: PARECIDA });
    assert.equal(r.respuesta, 'aurora');
    assert.ok(r.parecido >= 0.8);
    assert.equal(r.costo, '0 tokens');
  } finally { limpiar(); }
});

test('el orden de las opciones no cambia la forma; otras opciones sí', () => {
  const { m, limpiar } = nueva();
  try {
    m.confirmar(m.guardar({ tipo: 'proyecto', forma: OPCIONES, texto: NOTA, respuesta: 'aurora' }));
    const desordenadas = { api: OPCIONES.api, brisa: OPCIONES.brisa, aurora: OPCIONES.aurora };
    assert.equal(m.recordar({ tipo: 'proyecto', forma: desordenadas, texto: NOTA }).respuesta, 'aurora');
    assert.equal(m.recordar({ tipo: 'proyecto', forma: { aurora: 'Taller Aurora' }, texto: NOTA }), null);
    assert.equal(m.recordar({ tipo: 'otro-tipo', forma: OPCIONES, texto: NOTA }), null);
  } finally { limpiar(); }
});

test('un texto distinto no responde', () => {
  const { m, limpiar } = nueva();
  try {
    m.confirmar(m.guardar({ tipo: 'proyecto', texto: NOTA, respuesta: 'aurora' }));
    assert.equal(m.recordar({ tipo: 'proyecto', texto: 'Nuevo lote de café tostado para la tienda' }), null);
  } finally { limpiar(); }
});

test('una corrección vale con su nuevo valor', () => {
  const { m, limpiar } = nueva();
  try {
    const id = m.guardar({ tipo: 'proyecto', texto: NOTA, respuesta: 'aurora' });
    assert.equal(m.corregir(id, 'brisa').estado, 'corregida');
    assert.equal(m.recordar({ tipo: 'proyecto', texto: NOTA }).respuesta, 'brisa');
  } finally { limpiar(); }
});

test('corregir con el mismo valor original cuenta como confirmar', () => {
  const { m, limpiar } = nueva();
  try {
    const id = m.guardar({ tipo: 'proyecto', texto: NOTA, respuesta: 'aurora' });
    assert.equal(m.corregir(id, 'aurora').estado, 'confirmada');
  } finally { limpiar(); }
});

test('si los casos parecidos no coinciden, no responde', () => {
  const { m, limpiar } = nueva();
  try {
    m.confirmar(m.guardar({ tipo: 'proyecto', texto: NOTA, respuesta: 'aurora' }));
    m.corregir(m.guardar({ tipo: 'proyecto', texto: PARECIDA, respuesta: 'aurora' }), 'brisa');
    assert.equal(m.recordar({ tipo: 'proyecto', texto: NOTA }), null);
  } finally { limpiar(); }
});

test('con negación solo coincide el mismo texto', () => {
  assert.equal(parecido('No quiero video hoy', 'Quiero video hoy'), 0);
  assert.equal(parecido('No quiero video hoy', 'no quiero VIDEO hoy'), 1);
});

test('recordar no escribe nada', () => {
  const { m, limpiar } = nueva();
  try {
    m.confirmar(m.guardar({ tipo: 'proyecto', texto: NOTA, respuesta: 'aurora' }));
    const antes = m.leer().length;
    m.recordar({ tipo: 'proyecto', texto: PARECIDA });
    assert.equal(m.leer().length, antes);
  } finally { limpiar(); }
});

test('una línea dañada no impide leer las demás', () => {
  const { m, limpiar } = nueva();
  try {
    const id = m.guardar({ tipo: 'proyecto', texto: NOTA, respuesta: 'aurora' });
    appendFileSync(m.ruta, '{esto no es json\n');
    m.confirmar(id);
    assert.equal(m.recordar({ tipo: 'proyecto', texto: NOTA }).respuesta, 'aurora');
  } finally { limpiar(); }
});

test('respuestas que no son texto también sirven', () => {
  const { m, limpiar } = nueva();
  try {
    m.confirmar(m.guardar({ tipo: 'formato', texto: 'Historia vertical para Instagram de Brisa', respuesta: { ancho: 1080, alto: 1920 } }));
    assert.deepEqual(m.recordar({ tipo: 'formato', texto: 'historia vertical instagram brisa' }).respuesta, { ancho: 1080, alto: 1920 });
  } finally { limpiar(); }
});

test('la vista agrupa por proyecto, con General primero', () => {
  const { m, limpiar } = nueva();
  try {
    const ahora = new Date('2026-10-06T12:00:00Z');
    m.confirmar(m.guardar({ tipo: 'nombre', texto: 'Al hablar del Panel alveolar con clientes', respuesta: 'Llamarlo «Separador acolchado»', proyecto: 'Taller Aurora', alcance: 'Material hacia clientes', origen: 'Clara vía la persona', limite: 'Si cambia el nombre comercial' }, { ahora }));
    m.guardar({ tipo: 'proyecto-de-nota', texto: NOTA, respuesta: 'aurora' }, { ahora });
    m.guardar({ tipo: 'compra', texto: 'Comprar bots', respuesta: 'No | nunca', proyecto: 'Brisa' }, { ahora });
    const v = m.vista();
    assert.ok(v.indexOf('## General') < v.indexOf('## Brisa'));
    assert.ok(v.indexOf('## Brisa') < v.indexOf('## Taller Aurora'));
    assert.match(v, /\| Al hablar del Panel alveolar con clientes \| Llamarlo «Separador acolchado» \| Material hacia clientes \| Clara vía la persona, 2026-10-06 \| Si cambia el nombre comercial \| confirmada \|/);
    assert.match(v, /No \\\| nunca/); // una barra en el texto no rompe la tabla
    assert.match(v, /\| propuesta \|/);
  } finally { limpiar(); }
});

test('cada Control ve solo sus decisiones; una corrección se ve en todas partes', () => {
  const { m, limpiar } = nueva();
  try {
    const id = m.guardar({ tipo: 'tipografia', texto: 'Tipografía de marca', respuesta: 'Arial', proyecto: 'Taller Aurora' });
    m.guardar({ tipo: 'proyecto-de-nota', texto: NOTA, respuesta: 'aurora' });
    m.corregir(id, 'Montserrat');
    const aurora = m.vista({ proyecto: 'Taller Aurora' });
    assert.match(aurora, /Montserrat/);
    assert.doesNotMatch(aurora, /Arial|General|Rosa/);
    assert.match(m.vista(), /Montserrat \|.*\| corregida \|/);
    assert.equal(m.vista({ proyecto: 'Brisa' }), 'Sin decisiones de Brisa.\n');
  } finally { limpiar(); }
});

test('sin caso o con un id inexistente, avisa', () => {
  const { m, limpiar } = nueva();
  try {
    assert.equal(m.recordar({ tipo: 'proyecto', texto: NOTA }), null);
    assert.throws(() => m.confirmar('M00000000-000000'), /No existe/);
    assert.throws(() => m.guardar({ tipo: 'proyecto', texto: '', respuesta: 'aurora' }), /texto/);
  } finally { limpiar(); }
});
