"""Transforma as questões oficiais (imagem do Curso Objetivo) em QUESTÃO DE TEXTO de verdade, com a IA lendo a imagem:
enunciado limpo (fórmulas em LaTeX), alternativas, resolução do professor em texto, assunto (lido da questão + resolução) e as figuras
recortadas como imagens de verdade. Retoma de onde parou; usa as chaves em GEMINI_KEYS (nunca gravadas em arquivo).
Uso:  python transcrever.py entrada.json saida.json [--max N] [--amostra]
  --amostra  escolhe poucas questões de cada matéria (teste de qualidade)
"""
import base64, io, json, os, random, re, sys, threading, time, unicodedata, urllib.request
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, r'C:\rotina-banco\libs')
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import objetivo as o
import types
_src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'classificar.py'), encoding='utf-8').read().split('from concurrent.futures')[0]
cl = types.SimpleNamespace(); _ns = {'__file__': os.path.join(os.path.dirname(os.path.abspath(__file__)), 'classificar.py')}; exec(_src, _ns)   # só a lista de assuntos
cl.TAX = _ns['TAX']; cl.TEXTO_TAX = _ns['TEXTO_TAX']

CHAVES = [k for k in os.environ.get('GEMINI_KEYS', '').split(',') if k]
MODELOS = ['gemini-3.5-flash-lite', 'gemini-3.6-flash']
TRAVA = threading.Lock()
ESGOTADA = {}      # (modelo, chave) -> até quando evitar

def caminho(q):
    banca = {'Fuvest': 'fuvest', 'UNESP': 'unesp', 'Unicamp': 'unicamp'}.get(q['banca'], q['banca'].lower())
    pasta = q['id'].split('-', 1)[1].rsplit('-', 1)[0]
    return os.path.join(o.CACHE, banca, pasta, re.sub(r'[^\w.-]', '_', q['img'].split('/resolucao-comentada/')[-1]))

PROMPT = ('Esta imagem é uma questão de vestibular (parte de cima) seguida da resolução comentada de um professor (depois da palavra "Resolução"). '
          'Faça o seguinte e responda SÓ com JSON:\n'
          '1) "enunciado": transcreva SÓ a questão (sem a resolução), em texto limpo e fiel, com fórmulas em LaTeX entre $...$. Tabelas simples viram tabela markdown. Não invente nada.\n'
          '2) "alternativas": lista só com o TEXTO de cada alternativa, na ordem (sem a letra).\n'
          '3) "gabarito": a letra em "Resposta:" no fim da resolução (A a E).\n'
          '4) "resolucao": transcreva a resolução do professor em texto limpo (fórmulas em LaTeX entre $...$), sem a linha "Resposta".\n'
          '5) "figuras": para cada figura, gráfico, mapa, esquema, foto ou desenho que seja IMAGEM de verdade dentro da QUESTÃO (não da resolução, não texto comum, não tabela simples), a caixa "box_2d" = [ymin, xmin, ymax, xmax] na escala 0 a 1000 sobre a imagem inteira, e uma "legenda" curta.\n'
          '6) "depende_de_outro_texto": true se a questão remete a um texto ou figura que NÃO está nesta imagem (ex.: "o texto das questões 24 e 25"); senão false.\n'
          '7) "materia" e "assunto": o assunto EXATO copiado da lista da matéria, escolhido lendo a questão e a resolução:\n' + cl.TEXTO_TAX +
          '\nFormato: {"materia":"","assunto":"","enunciado":"","alternativas":[""],"gabarito":"A","resolucao":"","figuras":[{"box_2d":[0,0,0,0],"legenda":""}],"depende_de_outro_texto":false}')

def chama(png_b64):
    corpo = json.dumps({'contents': [{'role': 'user', 'parts': [{'text': PROMPT}, {'inlineData': {'mimeType': 'image/png', 'data': png_b64}}]}],
                        'generationConfig': {'responseMimeType': 'application/json', 'temperature': 0, 'maxOutputTokens': 6000}}).encode()
    for volta in range(6):
        opcoes = [(m, k) for m in MODELOS for k in CHAVES if ESGOTADA.get((m, k), 0) < time.time()]
        if not opcoes:
            time.sleep(60); continue
        m, k = random.choice(opcoes[:max(1, len(CHAVES))])
        try:
            req = urllib.request.Request(f'https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent', data=corpo, headers={'Content-Type': 'application/json', 'x-goog-api-key': k})
            j = json.loads(urllib.request.urlopen(req, timeout=150).read())
            txt = ''.join(p.get('text', '') for p in j['candidates'][0]['content']['parts'])
            return json.loads(txt)
        except urllib.error.HTTPError as e:
            with TRAVA:
                ESGOTADA[(m, k)] = time.time() + (900 if e.code == 429 else 20)
        except Exception:
            time.sleep(3 + volta * 4)
    return None

def caixa(b):
    while isinstance(b, list) and len(b) == 1 and isinstance(b[0], list):
        b = b[0]
    try:
        y0, x0, y1, x1 = [float(v) for v in b]
        return (y0, x0, y1, x1) if y1 > y0 and x1 > x0 else None
    except Exception:
        return None

def img_uri(im, largura=720, qualidade=82):
    if im.width > largura:
        im = im.resize((largura, round(im.height * largura / im.width)), Image.LANCZOS)
    b = io.BytesIO(); im.convert('RGB').save(b, 'JPEG', quality=qualidade, optimize=True)
    return 'data:image/jpeg;base64,' + base64.b64encode(b.getvalue()).decode()

_OCR = {}
def ocr_da(arq):
    pasta = os.path.dirname(arq)
    if pasta not in _OCR:
        try: _OCR[pasta] = json.load(open(os.path.join(pasta, '_ocr.json'), encoding='utf-8-sig'))
        except Exception: _OCR[pasta] = {}
    return _OCR[pasta].get(os.path.basename(arq)) or {}

def processa(q):
    arq = caminho(q)
    if not os.path.exists(arq):
        return None
    im = Image.open(arq).convert('RGB'); b = io.BytesIO(); im.save(b, 'PNG')
    x = chama(base64.b64encode(b.getvalue()).decode())
    if not x or not isinstance(x.get('alternativas'), list) or len(x['alternativas']) < 2 or not x.get('enunciado'):
        return None
    gab = str(x.get('gabarito') or '').strip().upper()[:1]
    if gab and gab != q['gab']:       # a leitura da IA tem que bater com o gabarito oficial do site
        return None
    W, H = im.size; figuras = []
    linhas = [l for l in (ocr_da(arq).get('linhas') or []) if len(l.get('t', '')) >= 22]    # linhas de texto corrido (não rótulos de figura)
    for f in x.get('figuras') or []:
        c = caixa(f.get('box_2d'))
        if not c or c[0] / 1000 * H > q['corte']:
            continue                    # figura da resolução: ignora
        y0, x0, y1, x1 = c
        esq, dir = max(0, int(x0 / 1000 * W - 0.04 * W)), min(W, int(x1 / 1000 * W + 0.04 * W))     # a caixa da IA costuma errar: abre uma folga e depois fecha pelas linhas de texto
        y0p, y1p = y0 / 1000 * H, y1 / 1000 * H; h0 = max(1, y1p - y0p)
        topo, base = max(0, int(y0p - 0.08 * h0 - 0.01 * H)), min(q['corte'], int(y1p + 0.08 * h0 + 0.01 * H))
        for l in linhas:                                       # texto corrido fora do miolo da figura marca onde ela acaba
            ym = l['y'] + l['h'] / 2
            if topo <= ym <= y0p + 0.15 * h0: topo = max(topo, l['y'] + l['h'] + 2)
            elif y1p - 0.15 * h0 <= ym <= base: base = min(base, l['y'] - 2)
        rec = im.crop((esq, topo, dir, base))
        if rec.width < 50 or rec.height < 30 or rec.width * rec.height < 10000 or rec.height > 0.92 * q['corte'] and rec.width > 0.92 * W:
            continue
        figuras.append(img_uri(rec))
    mat = x.get('materia') if x.get('materia') in cl.TAX else (q.get('materia') or '')
    ass = x.get('assunto') if x.get('assunto') in cl.TAX.get(mat, []) else ('Outro' if mat else '')
    alts = [re.sub(r'^\s*\(?[a-eA-E]\)\s*', '', str(a)).strip() for a in x['alternativas']][:5]
    return {'id': 'tx-' + q['id'], 'banca': q['banca'], 'ano': q['ano'], 'num': q['num'], 'fase': q.get('fase', ''), 'materia': mat, 'assunto': ass,
            'enunciado': x['enunciado'].strip(), 'alts': [{'l': 'ABCDE'[i], 't': t} for i, t in enumerate(alts)], 'gab': q['gab'],
            'coment': str(x.get('resolucao') or '').strip(), 'imagens': figuras, 'fig': 1 if x.get('depende_de_outro_texto') else 0,
            'img': q['img'], 'tipo': 'real', 'fonte': 'Objetivo (lido por IA)'}

def principal():
    ent, sai = sys.argv[1], sys.argv[2]
    maxn = int(sys.argv[sys.argv.index('--max') + 1]) if '--max' in sys.argv else 10 ** 9
    q = json.load(open(ent, encoding='utf-8'))
    feitas = {x['id'] for x in json.load(open(sai, encoding='utf-8'))} if os.path.exists(sai) else set()
    if '--amostra' in sys.argv:
        random.seed(5); por = {}
        for x in q: por.setdefault(x.get('materia') or '?', []).append(x)
        q = [y for m, l in por.items() for y in random.sample(l, min(4, len(l)))]
    q = [x for x in q if 'tx-' + x['id'] not in feitas][:maxn]
    out = json.load(open(sai, encoding='utf-8')) if os.path.exists(sai) else []
    print(f'{len(q)} questões a processar', flush=True)
    ok = falha = 0
    with ThreadPoolExecutor(4) as ex:
        for r in ex.map(processa, q):
            if r: out.append(r); ok += 1
            else: falha += 1
            if (ok + falha) % 20 == 0:
                print(f'  {ok + falha}/{len(q)} (ok {ok}, falhou {falha})', flush=True)
                json.dump(out, open(sai, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    json.dump(out, open(sai, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'PRONTO: {ok} ok, {falha} falharam, arquivo {sai}', flush=True)

if __name__ == '__main__':
    principal()
