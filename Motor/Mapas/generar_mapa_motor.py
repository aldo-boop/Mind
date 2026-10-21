"""Recorrido del Motor tras el Bloque 6.

python generar_mapa_motor.py --output mapa.pdf [--render vista.png] [--font-dir carpeta]
Requiere reportlab y pypdf; pypdfium2 solo si se pide render. No instala dependencias.
La fuente queda adjunta al PDF. No contiene rutas personales.
"""
from pathlib import Path
import argparse
import hashlib
import io
import json
import math
import os
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import Color, white, black
from pypdf import PdfReader, PdfWriter

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--render', type=Path)
parser.add_argument('--font-dir', type=Path)
args = parser.parse_args()
font_dir = args.font_dir or Path(os.environ.get('SystemRoot', '/nonexistent')) / 'Fonts'
if (font_dir / 'segoeui.ttf').exists() and (font_dir / 'segoeuib.ttf').exists():
    pdfmetrics.registerFont(TTFont('Mind', str(font_dir / 'segoeui.ttf')))
    pdfmetrics.registerFont(TTFont('MindBold', str(font_dir / 'segoeuib.ttf')))
    FONT, BOLD = 'Mind', 'MindBold'
else:
    FONT, BOLD = 'Helvetica', 'Helvetica-Bold'

W, H = 4920, 2112
INK, GRAY, LINE = Color(.08, .08, .08), Color(.34, .34, .34), Color(.48, .48, .48)
buf = io.BytesIO()
c = canvas.Canvas(buf, pagesize=(W, H), pageCompression=1, invariant=1)
c.setTitle('Mapa del Motor de Mind')
c.setAuthor('Mind')
c.setSubject('Motor 2.0.0-dev.23 - Bloques 1 a 7 ejecutados y revisados; pendientes explícitos')
checks, cards, connectors, text_boxes = [], [], [], []


def wrap(text, width, font, size):
    result = []
    for paragraph in text.split('\n'):
        line = ''
        for word in paragraph.split():
            candidate = (line + ' ' + word).strip()
            if pdfmetrics.stringWidth(candidate, font, size) > width and line:
                result.append(line)
                line = word
            else:
                line = candidate
        result.append(line)
    return result


def text(x, top, value, width, size=13, bold=False, color=INK, leading=None, align='left'):
    assert size >= 11
    font, leading = (BOLD if bold else FONT), leading or size * 1.35
    c.setFont(font, size)
    c.setFillColor(color)
    for i, line in enumerate(wrap(value, width, font, size)):
        length = pdfmetrics.stringWidth(line, font, size)
        y = H - top - size - i * leading
        left = x + (width - length) / 2 if align == 'center' else x + width - length if align == 'right' else x
        text_boxes.append((left, top+i*leading, left+length, top+size+i*leading, line))
        assert length <= width + .1, (line, length, width)
        assert 0 <= x and x + width <= W and 0 < y < H, (line, x, y)
        if align == 'center':
            c.drawCentredString(x + width / 2, y, line)
        elif align == 'right':
            c.drawRightString(x + width, y, line)
        else:
            c.drawString(x, y, line)
    return top + size + (len(wrap(value, width, font, size)) - 1) * leading


def frame(x, top, width, height, dashed=False, fill=white, stroke=LINE):
    assert all(v % 12 == 0 for v in (x, top, width, height)), (x, top, width, height)
    c.saveState()
    c.setLineWidth(1.1)
    c.setStrokeColor(stroke)
    c.setFillColor(fill)
    if dashed:
        c.setDash(5, 4)
    c.roundRect(x, H - top - height, width, height, 6, stroke=1, fill=1)
    c.restoreState()


def card(x, top, width, height, title, body='', dark=False, dashed=False, size=14, body_size=12, center=False):
    frame(x, top, width, height, dashed=dashed, fill=black if dark else white, stroke=INK)
    end = text(x + 24, top + 24, title, width - 48, size, True,
               white if dark else INK, align='center' if center else 'left')
    if body:
        end = text(x + 24, end + 8, body, width - 48, body_size, False,
                   Color(.81, .81, .81) if dark else GRAY, align='center' if center else 'left')
    assert end <= top + height - 24, (title, end, top + height - 24)
    checks.append({'title': title, 'bottom_padding': round(top + height - end, 2)})
    cards.append((x, top, x + width, top + height, title))


def panel(x, top, width, height, title, subtitle=''):
    frame(x, top, width, height, dashed=True)
    end = text(x + 24, top + 24, title, width - 48, 15, True)
    if subtitle:
        text(x + 24, end + 8, subtitle, width - 48, 12, color=GRAY)


def arrow(points):
    connectors.append(points)
    c.saveState()
    c.setStrokeColor(LINE)
    c.setFillColor(LINE)
    c.setLineWidth(1.1)
    path = c.beginPath()
    path.moveTo(points[0][0], H - points[0][1])
    for x, y in points[1:]:
        path.lineTo(x, H - y)
    c.drawPath(path)
    x, y = points[-1]
    prev_x, prev_y = points[-2]
    angle = math.atan2(y - prev_y, x - prev_x)
    for delta in (-.55, .55):
        c.line(x, H - y, x - 7 * math.cos(angle + delta), H - (y - 7 * math.sin(angle + delta)))
    c.restoreState()


def info_arrow(points):
    c.saveState()
    c.setDash(3, 4)
    arrow(points)
    c.restoreState()



# CONTENIDO

def connector(points):
    connectors.append(points)
    c.saveState()
    c.setStrokeColor(LINE)
    c.setLineWidth(1.1)
    path = c.beginPath()
    path.moveTo(points[0][0], H - points[0][1])
    for x, y in points[1:]:
        path.lineTo(x, H - y)
    c.drawPath(path)
    c.restoreState()


text(60, 36, 'Mapa del Motor de Mind', 2112, 30, True)
text(2544, 48, 'Instrucciones / Código implementado / Diseño pendiente - Bloque 6: reglas y mapas', 2316, 15, color=GRAY, align='right')

# 1. Entradas de la herramienta e inicio de conversación.
text(60, 552, '1 - Entrada y conversación', 636, 17, True)
for title, top in [('AGENTS.md', 600), ('CLAUDE.md', 744), ('GEMINI.md', 888)]:
    card(60, top, 240, 108, title, 'Archivo de entrada de la herramienta de IA', dark=True, size=15, body_size=12)
card(408, 420, 288, 108, 'Prompt de la persona', 'El pedido que inicia el trabajo.', dark=True, size=15, body_size=13)
card(408, 708, 288, 192, 'Bienvenida.md', 'Cómo trabajar y qué leer.\nIndica abrir Inicio si existe.\nLa lectura no ejecuta código.\nAntes de funciones: Mind.cmd sin pedido.', dark=True, size=15, body_size=13)
connector([(300, 654), (348, 654), (348, 942), (300, 942)])
connector([(300, 798), (348, 798)])
arrow([(348, 798), (408, 798)])
arrow([(552, 528), (552, 708)])
text(576, 600, 'conversación\nnueva', 192, 12, color=GRAY, leading=24)
text(60, 1044, 'Se abre el archivo que corresponde a la herramienta utilizada. Todos llevan a Bienvenida.', 240, 12, color=GRAY)

# 2. Inicio es una vista y el Controlador enlaza directamente los frentes.
text(840, 516, '2 - Vistas generadas', 432, 17, True)
panel(840, 552, 432, 624, 'Inicio.md', 'Vista generada desde los datos')
card(864, 648, 384, 120, 'Reglas del usuario', 'Instrucciones generales confirmadas.', size=15, body_size=13)
card(864, 804, 384, 120, 'Perfil', 'Una línea por faceta. El detalle se abre cuando hace falta.', size=15, body_size=13)
card(864, 960, 384, 168, 'Controlador', 'Frentes activos por proyecto.\nProyecto, frente, turno y siguiente paso.\nEnlaza cada frente; no ejecuta trabajo.', size=15, body_size=13)
arrow([(696, 804), (840, 804)])
text(840, 1224, 'Bienvenida + Inicio: arranque breve.\nEl detalle se consulta según el pedido.', 432, 13, color=GRAY, leading=24)

# La IA recibe prompt y contexto; las funciones son opcionales.
card(1392, 144, 528, 192, 'Agente - decide y trabaja', 'Interpreta el pedido y lee Inicio.\nElige qué contexto abrir y qué función llamar.\nMind aporta información y código local.', size=16, body_size=14)
arrow([(696, 474), (744, 474), (744, 228), (1392, 228)])
arrow([(1272, 600), (1320, 600), (1320, 288), (1392, 288)])

# 3. Datos del proyecto y colección propia: implementados en Bloques 1 y 2.
text(1392, 492, '3 - Proyectos y frentes', 528, 17, True)
panel(1392, 528, 528, 1080, 'Lista de proyectos', 'Cada proyecto tiene su colección raíz')
frame(1416, 624, 480, 936)
text(1440, 648, 'Proyecto', 432, 19, True)
text(1440, 696, 'Qué es, para qué existe y decisiones comunes.', 432, 14, color=GRAY)
card(1440, 780, 432, 180, 'Frentes - texto y referencias', 'Contexto, códigos y comandos.\nElementos usados: referencias, sin copias.\nAcción uso y recursos en la ficha: en código.', size=15, body_size=13)
frame(1440, 1056, 432, 432)
text(1464, 1080, 'Colección propia del proyecto', 384, 15, True)
text(1464, 1128, 'Se crea o vincula al abrir el proyecto.', 384, 13, color=GRAY)
card(1464, 1176, 384, 120, 'Índice de elementos', 'Metadatos con tamaño y fecha; lo ausente guarda su ID.', size=14, body_size=12)
card(1464, 1332, 384, 120, 'Carpetas y subcarpetas', 'Elementos físicos. Su ubicación se elige; el frente no los almacena.', size=14, body_size=12)
arrow([(1248, 1044), (1344, 1044), (1344, 870), (1440, 870)])
arrow([(1440, 924), (1368, 924), (1368, 1236), (1464, 1236)])

# 4. Lecturas y funciones según la tarea; no hay una cadena obligatoria.
text(2064, 132, '4 - Según el pedido: solo lo necesario', 900, 17, True)
frame(2064, 180, 900, 1656)
text(2088, 204, 'El agente elige. El Motor no interpreta el prompt ni decide qué trabajo hacer.', 852, 14, color=GRAY)
arrow([(1920, 228), (2064, 228)])
panel(2088, 288, 852, 336, 'Ficha del frente', 'Acceso desde el Controlador o el proyecto')
card(2112, 384, 804, 84, 'Del frente', 'Estado, turno, siguiente paso y descripción.', size=14, body_size=12)
card(2112, 504, 804, 84, 'Del proyecto, para trabajar y elementos usados', 'Decisiones comunes, colección e índices; hasta ocho elementos con ruta y último estado.', size=14, body_size=12)
arrow([(1872, 870), (1992, 870), (1992, 426), (2112, 426)])
card(2088, 696, 408, 120, 'Un grupo de Reglas base', 'Se lee el grupo que corresponde al trabajo, también Recepción.', dark=True, size=14, body_size=12)
card(2544, 696, 396, 120, 'Una Capacidad', 'Se abre la habilidad necesaria para el pedido.', size=14, body_size=12)
frame(2088, 888, 852, 924)
text(2112, 912, 'Funciones del Motor - siete funciones en código', 804, 16, True)
text(2112, 948, 'Mind.cmd + pedido JSON llama a ejecutar.mjs. Funciones sin llamada a modelo.', 804, 12, color=GRAY)
card(2112, 996, 804, 120, 'Buscar', 'Consulta una tabla o rama. Devuelve diez resultados por defecto y hasta cincuenta.', dark=True, size=15, body_size=13)
card(2112, 1164, 804, 120, 'Recordar', 'Consulta Decisiones directamente. Compara palabras de casos confirmados y exige condiciones comprobadas. Ante null o conflicto, la IA busca contexto o pregunta; no supone una decisión.', dark=True, size=15, body_size=13)
card(2112, 1332, 804, 120, 'Frentes + Tablas - al guardar', 'Frentes abre proyecto con colección, gestiona su estado y registra los elementos que usa (uso). Tablas valida, guarda y regenera vistas; los fallos dejan recibos.', dark=True, size=15, body_size=13)
card(2112, 1500, 804, 120, 'Colecciones - raíz, índice y ubicación', 'Prepara la raíz y busca. Inventaría sin abrir archivos; resuelve localizador y disponibilidad; registra enlaces sin acceder; reubica con copia verificada y los mismos IDs.', dark=True, size=15, body_size=13)
card(2112, 1668, 804, 120, 'Uso puntual: Seguridad + Adaptar', 'Seguridad exige escáner y autorización. Adaptar lleva los esquemas 1 y 2 al 3, incluidas sus ramas, con respaldo y autorización.', dark=True, size=15, body_size=13)

# 5. Tablas y ubicaciones físicas, con consultas y escritura separadas.
text(3096, 588, '5 - Memoria: datos y recursos', 1008, 17, True)
panel(3096, 624, 432, 816, 'Cinco tablas', 'JSONL: fuente / CSV: exportación')
card(3120, 720, 384, 108, 'Perfil', 'Información de la persona.', size=14, body_size=12)
card(3120, 864, 384, 108, 'Proyectos', 'Proyectos y frentes.', size=14, body_size=12)
card(3120, 1008, 384, 108, 'Decisiones', 'Reglas y decisiones. Recordar usa las confirmadas o corregidas y vigentes.', size=14, body_size=12)
card(3120, 1152, 384, 108, 'Colecciones', 'Propiedad, ubicación e índices por ramas, con tamaño y fecha.', size=14, body_size=12)
card(3120, 1296, 384, 108, 'Conceptos', 'Conocimiento organizado por materias.', size=14, body_size=12)
arrow([(2916, 1056), (3000, 1056), (3000, 684), (3096, 684)])
arrow([(2916, 1224), (3024, 1224), (3024, 1062), (3120, 1062)])
arrow([(2916, 1392), (3048, 1392), (3048, 1416), (3096, 1416)])
text(3096, 1488, 'Índices, resolución y reubicación (Bloque 3)\ny acción uso con su ficha (Bloque 4): en código.\nEsquema 3: tamaño y fecha de cada archivo.', 432, 13, color=GRAY, leading=24)
panel(3672, 864, 432, 816, 'Ubicación física de la colección', 'Crear, vincular y reubicar: en código')
card(3696, 1008, 384, 120, 'Externa - predeterminada', 'Carpeta en el Escritorio conocido de Windows, o base elegida.', size=14, body_size=12)
card(3696, 1164, 384, 120, 'Carpeta existente', 'Vincula sin sobrescribir ni duplicar los archivos.', size=14, body_size=12)
card(3696, 1320, 384, 120, 'Nube - explícita', 'Sincronizada: inventario sin descargar. Enlace: no se comprueba ni se descarga.', size=14, body_size=12)
card(3696, 1476, 384, 120, 'Dentro de Mind', 'Crea o vincula en Memoria. Opción elegida por la persona.', size=14, body_size=12)
info_arrow([(3504, 1206), (3600, 1206), (3600, 1068), (3672, 1068)])

# Mantenimiento independiente, implementado en el Bloque 5.
panel(4260, 144, 540, 1428, 'Mantenimiento - código', 'Mind.cmd + actualizar.mjs: pedidos JSON y Node portátil')
card(4284, 252, 492, 168, 'Paquete Windows', 'Node incluido para x64 y ARM64. No instala Node global ni cambia PATH. Paquete sin Memoria ni datos personales.', dark=True, size=15, body_size=13)
card(4284, 456, 492, 192, 'Inicio - comprobar versiones', 'La IA invoca inicio antes de trabajar. Canal firmado y compatible; sin trabajo activo. Sin canal o sin red: versión local. Las acciones no consultan el canal.', dark=True, size=15, body_size=13)
card(4284, 684, 492, 192, 'Actualizar / reparar / recuperar', 'Manifiesto explícito y hashes. Solo archivos oficiales; respaldo y diario. Conserva Memoria, Del usuario y archivos ajenos. Si no puede recuperar, bloquea e informa.', dark=True, size=15, body_size=13)
card(4284, 912, 492, 192, 'Adaptar - autorización separada', 'Una versión incompatible no se aplica sola. Copia, transformación estructural y cotejo de eventos, IDs y archivos antes de activar. Sin conservación, sigue lo anterior.', dark=True, size=15, body_size=13)
card(4284, 1140, 492, 168, 'Pendientes de validación', 'ARM64 real, canal real y revisar dev.23. Sin sincronización de proveedores ni exportación de proyectos. La IA no viene incluida.', dashed=True, size=15, body_size=13)
text(4284, 1356, 'Referencias: Distribucion.md y sus pruebas.\nReglas e instrucciones alineadas en Bloque 6.\nNo hay servicio residente ni orquestador.', 492, 13, color=GRAY, leading=24)

# El resultado técnico vuelve a la IA, que termina el trabajo y entrega.
card(3096, 1788, 1008, 168, 'Resultado de vuelta al agente', 'Buscar y Colecciones: filas del índice, localizador y disponibilidad observada. Recordar: decisión compatible o ausencia.\nEscrituras: recibo, avisos y vistas regeneradas o pendientes.\nEl agente usa el resultado para completar el pedido.', size=16, body_size=14)
arrow([(2964, 1788), (3024, 1788), (3024, 1872), (3096, 1872)])
card(4260, 1644, 540, 132, 'Agente - completa y verifica', 'Usa el resultado, realiza el trabajo solicitado y comprueba qué quedó hecho.', size=15, body_size=13)
card(4260, 1848, 540, 132, 'Respuesta / entregable al usuario', 'Texto, archivo o trabajo realizado. Por ejemplo, una carpeta organizada según lo acordado.', size=15, body_size=13)
arrow([(4104, 1872), (4188, 1872), (4188, 1710), (4260, 1710)])
arrow([(4530, 1776), (4530, 1848)])
text(4560, 1800, 'entrega verificada', 240, 12, color=GRAY)

text(60, 2028, 'Negro: piezas oficiales / Claro: información y trabajo / Recuadro punteado: agrupación\nFlecha continua: lectura, llamada o resultado / Flecha punteada: referencia de ubicación; no ejecución.', 2328, 12, color=GRAY, leading=24)
text(2544, 2028, 'Motor 2.0.0-dev.23 - Bloques 1 a 5 en código - validación 7 revisada - 2026-10-19\nPendiente: revisar dev.23, ARM64 real y canal publicado. Las instrucciones no son automatismos.', 2316, 12, color=GRAY, leading=24, align='right')

# Comprobar que ningún conector atraviesa el interior de una tarjeta ajena.
for points in connectors:
    for (x1, y1), (x2, y2) in zip(points, points[1:]):
        assert x1 == x2 or y1 == y2
        for left, top, right, bottom, title in cards:
            if y1 == y2:
                assert not (top < y1 < bottom and max(min(x1, x2), left) < min(max(x1, x2), right)), title
            else:
                assert not (left < x1 < right and max(min(y1, y2), top) < min(max(y1, y2), bottom)), title

# Comprobar que las líneas tampoco atraviesan texto fuera de tarjetas.
for points in connectors:
    for (x1,y1),(x2,y2) in zip(points,points[1:]):
        for left,top,right,bottom,label in text_boxes:
            if y1==y2:
                assert not (top < y1 < bottom and max(min(x1,x2),left) < min(max(x1,x2),right)), ('conector/texto',label)
            else:
                assert not (left < x1 < right and max(min(y1,y2),top) < min(max(y1,y2),bottom)), ('conector/texto',label)
# Tarjetas hermanas en un mismo nivel: mínimo 48 horizontal y 36 vertical.
for i,(l,t,r,b,title) in enumerate(cards):
    for l2,t2,r2,b2,title2 in cards[i+1:]:
        assert not (max(l,l2)<min(r,r2) and max(t,t2)<min(b,b2)), ('tarjetas superpuestas',title,title2)
        if t==t2 and b==b2 and (r<=l2 or r2<=l):
            assert max(l2-r,l-r2)>=48, ('separación horizontal',title,title2)
        if l==l2 and r==r2 and (b<=t2 or b2<=t):
            assert max(t2-b,t-b2)>=36, ('separación vertical',title,title2)
c.showPage()
c.save()
writer = PdfWriter()
writer.append(PdfReader(io.BytesIO(buf.getvalue())))
writer.add_metadata({'/Title': 'Mapa del Motor de Mind', '/Author': 'Mind', '/Subject': 'Motor 2.0.0-dev.23 - Bloque 7: revisado y corregido'})
writer.add_attachment('generar_mapa_motor.py', Path(__file__).read_bytes())
args.output.parent.mkdir(parents=True, exist_ok=True)
with args.output.open('wb') as target:
    writer.write(target)
if args.render:
    import pypdfium2 as pdfium
    document = pdfium.PdfDocument(str(args.output))
    document[0].render(scale=.65).to_pil().save(args.render)
audit = {'page': [W, H], 'cards': checks, 'minimum_padding': min(x['bottom_padding'] for x in checks),
         'connectors_checked': len(connectors), 'text_lines_checked': len(text_boxes), 'minimum_body_size': 11, 'grid': 12,
         'source_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
         'pdf_sha256': hashlib.sha256(args.output.read_bytes()).hexdigest()}
args.output.with_suffix('.comprobacion.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'pdf': str(args.output), 'cards': len(checks), 'minimum_padding': audit['minimum_padding'], 'sha256': audit['pdf_sha256']}, ensure_ascii=False))
