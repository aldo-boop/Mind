"""Mapa general del Motor tras el Bloque 6.

python generar_mapa_general.py --output mapa.pdf [--render vista.png] [--font-dir carpeta]
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

W, H = 5040, 1968
INK, GRAY, LINE = Color(.08, .08, .08), Color(.34, .34, .34), Color(.48, .48, .48)
buf = io.BytesIO()
c = canvas.Canvas(buf, pagesize=(W, H), pageCompression=1, invariant=1)
c.setTitle('Mapa de Mind completo')
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


text(60, 36, 'Mapa de Mind completo', 1704, 30, True)
text(3024, 48, 'Arquitectura general - Motor 2.0.0-dev.23 - Bloque 7: revisado y corregido', 1944, 15, color=GRAY, align='right')

# Se conserva la organización del mapa anterior; el lienzo crece para la séptima función.
card(60, 600, 264, 132, 'Persona', 'Formula el pedido y recibe el resultado.', dark=True, center=True, size=16, body_size=13)
card(396, 576, 276, 180, 'Agente', 'Lee el contexto, elige las funciones y realiza el trabajo solicitado.', size=16, body_size=13)
arrow([(324, 666), (396, 666)])

frame(768, 180, 1920, 1380)
text(792, 204, 'Mind - archivos de entrada, Motor y Memoria', 1872, 22, True)
card(792, 264, 1872, 84, 'Archivos de entrada + Bienvenida - instrucciones',
     'AGENTS.md / CLAUDE.md / GEMINI.md llevan a Bienvenida. Indica abrir Inicio si existe. Lectura inicial; antes de funciones, Mind.cmd sin pedido.', dark=True, size=16, body_size=12)
arrow([(672, 666), (720, 666), (720, 306), (792, 306)])

frame(792, 384, 768, 1140)
text(816, 408, 'Motor - en código', 720, 20, True)
card(816, 468, 720, 96, 'Reglas base - instrucciones',
     'Guía, Perfil, Proyectos, Decisiones, Colecciones, Conceptos, Memoria y Recepción.', dark=True, size=15, body_size=12)
card(816, 600, 720, 84, 'Mind.cmd y ejecutar.mjs - funciones',
     'Pedido JSON por stdin; sin red en cada acción. Devuelve resultados, recibos o errores.', dark=True, size=15, body_size=12)
frame(816, 720, 720, 540)
text(840, 744, 'Funciones / Base - siete funciones existentes', 672, 15, True)
functions = [
    (840, 792, 'Tablas', 'Valida, guarda y genera vistas'),
    (1200, 792, 'Frentes', 'Proyectos, frentes y elementos usados'),
    (840, 912, 'Buscar', 'Filtra una tabla o rama'),
    (1200, 912, 'Recordar', 'Decisiones; null exige revisar o preguntar'),
    (840, 1032, 'Seguridad', 'Exige escáner y autorización'),
    (1200, 1032, 'Adaptar', 'Esquemas 1 y 2 a 3 con respaldo'),
    (1020, 1152, 'Colecciones', 'Raíz, índice, enlaces y reubicación'),
]
for x, y, title, body in functions:
    card(x, y, 312, 84, title, body, dark=True, size=13, body_size=11)
# La séptima tarjeta se centra y conserva 24 puntos hasta el borde de su grupo.
card(816, 1296, 720, 84, 'Capacidades y piezas Del usuario',
     'Habilidades y piezas propias, sin activación automática.', size=13, body_size=11)
card(816, 1416, 720, 84, 'Distribución y actualizar.mjs',
     'Verifica, respalda y recupera oficiales. Adaptación con autorización y cotejo.', dark=True, size=13, body_size=11)

frame(1632, 384, 1032, 1068)
text(1656, 408, 'Memoria - datos de la persona', 984, 20, True)
panel(1656, 468, 432, 276, 'Tablas - en código', 'JSONL: fuente / CSV: exportación')
text(1680, 552, 'Perfil\nProyectos y frentes\nDecisiones\nColecciones e índices por ramas\nConceptos', 384, 14, color=GRAY, leading=30)
panel(2136, 468, 504, 276, 'Vistas - en código', 'Generadas por Tablas')
text(2160, 552, 'Inicio: reglas del usuario, Perfil y Controlador\nFichas de proyectos y frentes\nDetalle del Perfil y consultas', 456, 14, color=GRAY, leading=30)
frame(1656, 792, 984, 528, dashed=True)
text(1680, 816, 'Proyecto - estructura lógica', 936, 18, True)
text(1680, 852, 'Contexto y decisiones comunes. Reúne sus frentes y tiene una colección raíz.', 936, 13, color=GRAY)
card(1680, 912, 432, 240, 'Frentes - texto y referencias',
     'Contexto, estado, turno, siguiente paso y elementos usados {coleccion, elemento}.\nAcción uso: registrar, retirar y consultar sin copiar archivos. La ficha muestra hasta ocho.', size=15, body_size=13)
card(2160, 912, 456, 240, 'Colección propia - en código',
     'Al crear un proyecto se crea o vincula su colección raíz en la misma operación recuperable.\nLos archivos pueden estar fuera de Mind.', size=15, body_size=13)
text(1680, 1200, 'La pertenencia se mantiene por ID. Renombrar el proyecto no mueve su carpeta.\nLos frentes reutilizan referencias; los archivos físicos permanecen en su colección.', 936, 13, color=GRAY, leading=24)

panel(2760, 468, 1008, 984, 'Colección de cada proyecto - Bloques 1 a 4 en código', 'El índice vive en Memoria; la ubicación de los archivos se elige.')
card(2784, 564, 960, 132, 'Índice de elementos',
     'Clase, propietario, padre, descripción, ubicación, disponibilidad, tamaño y fecha, por ramas.\nInventario sin abrir archivos; detecta cambios. Renombres y movimientos se proponen por tamaño y fecha; no se fusionan.', size=15, body_size=13)
card(2784, 744, 456, 144, 'Externa a Mind - predeterminada',
     'Crea una carpeta en el Escritorio conocido de Windows. Admite una base elegida.', size=14, body_size=13)
card(3288, 744, 456, 144, 'Carpeta existente del proyecto',
     'Comprueba y vincula su ubicación sin sobrescribir ni duplicar archivos.', size=14, body_size=13)
card(2784, 936, 456, 144, 'Nube - ubicación explícita',
     'Sincronizada: se inventaría sin descargar. Un enlace guardado no demuestra acceso remoto.', size=14, body_size=13)
card(3288, 936, 456, 144, 'Dentro de Mind - opcional',
     'Crea o vincula una carpeta en Memoria. Sus archivos aumentan el peso local.', size=14, body_size=13)
card(2784, 1128, 960, 132, 'Colecciones - preparar, buscar, indexar, resolver, registrar enlace y reubicar',
     'Resolver: localizador y disponibilidad observada. Reubicar: copia verificada por SHA-256, mismos IDs, original intacto.\nBuscar: 10 resultados por defecto y hasta 50. Una ubicación dudosa pide una decisión; no elige otro destino.', size=15, body_size=13)
text(2784, 1308, 'Comprobado: índice, resolución, enlaces y reubicación (3); uso desde frentes y esquema 3 (4).\nPaquete y mantenimiento (5): implementados. Validación integral (7): ejecutada y revisada.\nRecepción de un sistema anterior: IA + funciones actuales; no hay sincronización automática de proveedores.', 960, 13, color=GRAY, leading=24)
info_arrow([(2616, 1032), (2712, 1032), (2712, 630), (2760, 630)])

panel(3888, 468, 1080, 984, 'Distribución y mantenimiento - Bloque 5 en código', 'Lo ejecuta Distribución y actualizar.mjs, del Motor. La IA invoca inicio al comenzar; las funciones son opcionales según el pedido.')
card(3912, 564, 1032, 144, 'Paquete portátil - Mind.cmd', 'Node x64 y ARM64 incluidos, sin instalación global ni cambios de PATH. Pedidos JSON por archivo o stdin. El paquete contiene Motor oficial, sin Memoria, proyectos ni contexto personal.', dark=True, size=15, body_size=13)
card(3912, 756, 492, 216, 'Inicio y canal firmado', 'Comprueba publicaciones auténticas y compatibles sin trabajo activo. Sin canal o red: sigue la versión local. Cada acción ejecutar solo toma candados y comprueba recuperación.', dark=True, size=15, body_size=13)
card(4452, 756, 492, 216, 'Actualizar, reparar y recuperar', 'Lista oficial, hashes, respaldo y diario. Conserva datos y piezas propias. Restaura ante fallo; si no puede demostrar recuperación, bloquea e informa.', dark=True, size=15, body_size=13)
card(3912, 1020, 1032, 168, 'Adaptar Memoria - autorización y conservación comprobada', 'Si cambia el esquema, no se aplica automáticamente. Prepara una copia, transforma solo estructura y coteja eventos, IDs, relaciones e historial y archivos no derivados antes de activar. Se conserva Memoria-original.', dark=True, size=15, body_size=13)
card(3912, 1236, 1032, 168, 'Diseño o validación pendientes', 'ARM64 real, canal de publicaciones real y revisión de las correcciones dev.23. No hay sincronización de proveedores, exportación completa de proyectos ni ejecución aislada de extensiones. Una IA con herramientas locales realiza y verifica el entregable.', dashed=True, size=15, body_size=13)

text(792, 1608, 'Cierre del pedido - solo se invocan las funciones necesarias', 4176, 16, True)
card(792, 1656, 648, 120, 'Motor - resultado técnico',
     'Filas, decisión recuperada, recibo o error. Informa lo guardado y lo que queda pendiente.', dark=True, size=15, body_size=13)
card(1536, 1656, 816, 120, 'Agente - completa y verifica',
     'Usa el resultado del Motor, realiza el trabajo solicitado y comprueba qué quedó hecho.', size=15, body_size=13)
card(2448, 1656, 2520, 120, 'Usuario - recibe la respuesta o el entregable',
     'Texto, archivo o trabajo realizado. Ejemplo: carpeta de trabajo creada y organizada según la arquitectura acordada.', size=15, body_size=13)
arrow([(1440, 1716), (1536, 1716)])
arrow([(2352, 1716), (2448, 1716)])
arrow([(768, 1500), (720, 1500), (720, 1716), (792, 1716)])
text(60, 1848, 'Negro: piezas oficiales / Claro: datos y trabajo / Recuadro punteado: agrupación\nFlecha continua: lectura, llamada o resultado / Punteada: referencia de ubicación; no ejecución.', 1848, 12, color=GRAY, leading=24)
text(3168, 1848, 'Motor 2.0.0-dev.23 - Suite y evidencia: informes del Bloque 7 - 2026-10-19\nPendientes: revisar dev.23, ARM64 real y canal real.', 1788, 12, color=GRAY, leading=24, align='right')

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
writer.add_metadata({'/Title': 'Mapa de Mind completo', '/Author': 'Mind', '/Subject': 'Motor 2.0.0-dev.23 - Bloque 7: revisado y corregido'})
writer.add_attachment('generar_mapa_general.py', Path(__file__).read_bytes())
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
