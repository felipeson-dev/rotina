"""Transforma as questões oficiais (imagem do Curso Objetivo) em QUESTÃO DE TEXTO de verdade, com a IA lendo a imagem:
enunciado limpo (fórmulas em LaTeX), alternativas, resolução do professor em texto, assunto (lido da questão + resolução) e as figuras
recortadas como imagens de verdade. Usa as chaves em GEMINI_KEYS (nunca gravadas em arquivo).
Pode rodar por dias: quando a cota grátis acaba, espera e continua sozinho; se o PC desligar, é só rodar de novo (retoma).
Uso:  python transcrever.py entrada.json [entrada2.json ...] saida.json [--max N] [--amostra]
Saída: saida.json (só as que deram certo, id "tx-<id original>") e saida.json.falhas.json (motivo de cada falha).
As que falham de vez (ex.: o Gemini não copia texto já publicado) ficam no modo imagem na hora de empacotar (empacotar.py).
"""
import base64, io, json, os, random, re, sys, threading, time, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
sys.path.insert(0, r'C:\rotina-banco\libs')
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import objetivo as o
import types
_src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'classificar.py'), encoding='utf-8').read().split('from concurrent.futures')[0]
_ns = {'__file__': os.path.join(os.path.dirname(os.path.abspath(__file__)), 'classificar.py')}; exec(_src, _ns)   # só a lista de assuntos
cl = types.SimpleNamespace(TAX=_ns['TAX'], TEXTO_TAX=_ns['TEXTO_TAX'])

CHAVES = [k for k in os.environ.get('GEMINI_KEYS', '').split(',') if k]
MODELOS = ['gemini-3.5-flash-lite']     # só o leve: o flash (20/dia) fica para a IA do app dela, que usa as mesmas chaves
LIMITE_DIA = int(os.environ.get('LIMITE_DIA', 430))   # de 500/dia por chave, deixa uns 70 para o app dela
USO_ARQ = r'C:\rotina-banco\uso-gemini.json'          # pedidos por dia e por chave (só o número da chave, nunca a chave)
TRAVA = threading.Lock()
ESGOTADA = {}      # (modelo, chave) -> até quando evitar
FALHAS = {}        # id -> {'m': motivo, 'def': falha definitiva?, 'n': tentativas}
AVISADA = set()
AVISO_ESPERA = 0
PASTA_DA_BANCA = {v: k for k, v in o.NOME.items()}           # 'Santa Casa' -> 'santacasa' (pasta do cache)
DEFINITIVAS = ('recitation', 'gabarito', 'incompleta', 'alternativas', 'sem imagem')

def caminho(q):
    banca = PASTA_DA_BANCA.get(q['banca'], q['banca'].lower())
    pasta = q['id'].split('-', 1)[1].rsplit('-', 1)[0]
    return os.path.join(o.CACHE, banca, pasta, re.sub(r'[^\w.-]', '_', q['img'].split('/resolucao-comentada/')[-1]))

def prompt_de(mat):
    # a matéria do caderno é só uma dica: cadernos como "Português e Inglês" marcam tudo como Português (visto em 27/10)
    dica = f' A matéria indicada no caderno da prova é "{mat}", mas pode estar errada quando o caderno junta matérias (ex.: Português e Inglês): decida pela questão.' if mat else ''
    lista = ('7) "materia" e "assunto": a matéria e o assunto copiados EXATAMENTE da lista abaixo, escolhidos lendo a questão e a resolução '
             '(o tema nem sempre está escrito no enunciado). Se nenhum assunto servir, "Outro".' + dica + '\n' + cl.TEXTO_TAX)
    return ('Esta imagem é uma questão de vestibular (parte de cima) seguida da resolução comentada de um professor (depois da palavra "Resolução"). '
            'Faça o seguinte e responda SÓ com JSON:\n'
            '1) "enunciado": transcreva SÓ a questão (sem as alternativas e sem a resolução), em texto limpo e fiel, com fórmulas em LaTeX entre $...$. Tabelas simples viram tabela markdown. Não invente nada.\n'
            '2) "alternativas": lista só com o TEXTO de cada alternativa, na ordem (sem a letra).\n'
            '3) "gabarito": a letra da alternativa correta segundo a resolução (em "Resposta:", no próprio texto da resolução ou na letra ao lado do número da questão, no topo). Se não der para saber, "".\n'
            '4) "resolucao": transcreva a resolução do professor em texto limpo (fórmulas em LaTeX entre $...$), sem a linha "Resposta".\n'
            '5) "figuras": para cada figura, gráfico, mapa, esquema, foto ou desenho que seja IMAGEM de verdade dentro da QUESTÃO (não da resolução, não texto comum, não tabela simples), a caixa "box_2d" = [ymin, xmin, ymax, xmax] na escala 0 a 1000 sobre a imagem inteira, e uma "legenda" curta.\n'
            '6) "depende_de_outro_texto": true se a questão remete a um texto ou figura que NÃO está nesta imagem (ex.: "o texto das questões 24 e 25"); senão false.\n'
            + lista +
            '\nFormato: {"materia":"","assunto":"","enunciado":"","alternativas":[""],"gabarito":"A","resolucao":"","figuras":[{"box_2d":[0,0,0,0],"legenda":""}],"depende_de_outro_texto":false}')

def dia_pacifico():
    return time.strftime('%Y-%m-%d', time.gmtime(time.time() - 8 * 3600))   # a cota zera à meia-noite do Pacífico

def proxima_virada():
    t = time.time() - 8 * 3600
    return t - t % 86400 + 86400 + 8 * 3600 + 120

USO = {}
def carregar_uso():
    global USO
    try: USO = json.load(open(USO_ARQ, encoding='utf-8'))
    except Exception: USO = {}

def pode(k):
    # a chave ainda tem a parte dela hoje? (se não, só volta na virada do dia)
    with TRAVA:
        if USO.get(f'{dia_pacifico()}|{CHAVES.index(k) + 1}', 0) >= LIMITE_DIA:
            for m in MODELOS: ESGOTADA[(m, k)] = proxima_virada()
            return False
        return True

def contar(k, n=1, esgotou=False):
    # só conta pedido que o Google aceitou (429 por minuto não gasta a cota do dia); "esgotou" = o Google disse que acabou o dia
    with TRAVA:
        chave = f'{dia_pacifico()}|{CHAVES.index(k) + 1}'
        USO[chave] = LIMITE_DIA if esgotou else USO.get(chave, 0) + n
        try: json.dump(USO, open(USO_ARQ, 'w', encoding='utf-8'))
        except Exception: pass

def esperar_cota():
    """Ninguém disponível: dorme até a primeira chave/modelo voltar (cota por minuto ~1 min; cota do dia: testa de novo a cada 30 min)."""
    global AVISO_ESPERA
    with TRAVA:
        prox = min((ESGOTADA.get((m, k), 0) for m in MODELOS for k in CHAVES), default=0)
        if time.time() - AVISO_ESPERA > 600:
            AVISO_ESPERA = time.time(); print(f'{time.strftime("%d/%m %H:%M")}  esperando a cota voltar (próxima chave livre em {max(0, prox - time.time()) / 60:.0f} min)', flush=True)
    time.sleep(max(5, min(1800, prox - time.time())))

def chama(png_b64, prompt):
    """Devolve (json, erro). Erro 'RECITATION' = o Gemini se recusou a copiar um texto que existe na internet: não adianta repetir igual."""
    corpo = json.dumps({'contents': [{'role': 'user', 'parts': [{'text': prompt}, {'inlineData': {'mimeType': 'image/png', 'data': png_b64}}]}],
                        'generationConfig': {'responseMimeType': 'application/json', 'temperature': 0, 'maxOutputTokens': 8000}}).encode()
    erros, tentativas = [], 0
    while tentativas < 4:
        opcoes = [(m, k) for m in MODELOS for k in CHAVES if ESGOTADA.get((m, k), 0) < time.time()]
        if not opcoes:
            esperar_cota(); continue                 # cota acabou: espera, sem gastar tentativa
        m = opcoes[0][0]; k = random.choice([k for mm, k in opcoes if mm == m])
        if not pode(k):
            continue
        try:
            req = urllib.request.Request(f'https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent', data=corpo, headers={'Content-Type': 'application/json', 'x-goog-api-key': k})
            j = json.loads(urllib.request.urlopen(req, timeout=180).read())
            contar(k)
            c = (j.get('candidates') or [{}])[0]
            if c.get('finishReason') == 'RECITATION':
                return None, 'RECITATION'
            txt = ''.join(p.get('text', '') for p in c.get('content', {}).get('parts', []))
            try:
                return json.loads(txt), ''
            except Exception:
                erros.append(f'{m}: resposta não é JSON (fim={c.get("finishReason")}, {len(txt)} letras)'); tentativas += 1
        except urllib.error.HTTPError as e:
            corpo_erro = ''
            try: corpo_erro = e.read().decode('utf-8', 'replace')
            except Exception: pass
            if e.code == 429:
                # cota grátis (visto em 27/10): 500 pedidos/dia e 15/minuto por chave no modelo leve; 20/dia no outro
                try: ids = [v.get('quotaId', '') for d in json.loads(corpo_erro)['error'].get('details', []) for v in d.get('violations', [])]
                except Exception: ids = []
                dia = any('PerDay' in i for i in ids) or (not ids and 'per day' in corpo_erro.lower())
                if (m, k, dia) not in AVISADA:
                    AVISADA.add((m, k, dia)); print(f'{time.strftime("%d/%m %H:%M")}  cota {"do dia" if dia else "por minuto"}: {m}, chave {CHAVES.index(k) + 1}{" (volta à meia-noite do Pacífico, ~4h/5h de Brasília)" if dia else ""} {ids[:1]}', flush=True)
                if dia:
                    contar(k, esgotou=True)
                with TRAVA:
                    ESGOTADA[(m, k)] = proxima_virada() if dia else time.time() + 62
                continue                             # cota: não conta como tentativa
            contar(k)
            erros.append(f'{m}: HTTP {e.code}'); tentativas += 1
            with TRAVA:
                ESGOTADA[(m, k)] = time.time() + 20
        except Exception as e:
            erros.append(f'{m}: {e!r}'[:200]); tentativas += 1
            time.sleep(3 + tentativas * 4)
    return None, ' | '.join(erros)

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
    with TRAVA:
        if pasta not in _OCR:
            try: _OCR[pasta] = json.load(open(os.path.join(pasta, '_ocr.json'), encoding='utf-8-sig'))
            except Exception: _OCR[pasta] = {}
    return _OCR[pasta].get(os.path.basename(arq)) or {}

def falhou(q, motivo):
    with TRAVA:
        n = FALHAS.get(q['id'], {}).get('n', 0) + 1
        FALHAS[q['id']] = {'m': motivo, 'def': any(d in motivo.lower() for d in DEFINITIVAS) or n >= 3, 'n': n}
    return None

def recortar_figuras(im, x, q, arq):
    W, H = im.size; figuras = []
    linhas = [l for l in (ocr_da(arq).get('linhas') or []) if len(l.get('t', '')) >= 22]    # linhas de texto corrido (não rótulos de figura)
    for f in x.get('figuras') or []:
        c = caixa(f.get('box_2d') if isinstance(f, dict) else None)
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
        if base - topo < 30 or dir - esq < 50:
            continue
        rec = im.crop((esq, topo, dir, base))
        if rec.width * rec.height < 10000 or rec.height > 0.92 * q['corte'] and rec.width > 0.92 * W:
            continue
        figuras.append(img_uri(rec))
    return figuras

def processa(q):
    try:
        arq = caminho(q)
        if not os.path.exists(arq):
            return falhou(q, 'sem imagem no cache')
        im = Image.open(arq).convert('RGB'); b = io.BytesIO(); im.save(b, 'PNG')
        mat0 = q.get('materia') or ''
        x, erro = chama(base64.b64encode(b.getvalue()).decode(), prompt_de(mat0))
        if not x:
            return falhou(q, 'recitation: o Gemini não copia este enunciado (já publicado na internet), fica como imagem' if erro == 'RECITATION' else 'IA: ' + erro)
        if not isinstance(x, dict) or not isinstance(x.get('alternativas'), list) or len(x['alternativas']) < 2 or not str(x.get('enunciado') or '').strip():
            return falhou(q, 'resposta incompleta')
        alts = [re.sub(r'^\s*\(?[a-eA-E]\)\s*', '', str(a)).strip() for a in x['alternativas']][:5]
        if 'ABCDE'.index(q['gab']) >= len(alts) or not all(alts):
            return falhou(q, f'alternativas: vieram {len(alts)}, a certa é a {q["gab"]}')
        gab = str(x.get('gabarito') or '').strip().upper()[:1]
        if gab and gab != q['gab']:       # a leitura da IA tem que bater com o gabarito oficial do site
            return falhou(q, f'gabarito: IA leu {gab}, oficial {q["gab"]}')
        mat = x.get('materia') if x.get('materia') in cl.TAX else mat0
        ass = x.get('assunto') if x.get('assunto') in cl.TAX.get(mat, []) else ('Outro' if mat else '')
        return {'id': 'tx-' + q['id'], 'banca': q['banca'], 'ano': q['ano'], 'num': q['num'], 'fase': q.get('fase', ''), 'materia': mat, 'assunto': ass,
                'enunciado': x['enunciado'].strip(), 'alts': [{'l': 'ABCDE'[i], 't': t} for i, t in enumerate(alts)], 'gab': q['gab'],
                'coment': str(x.get('resolucao') or '').strip(), 'imagens': recortar_figuras(im, x, q, arq), 'dep': 1 if x.get('depende_de_outro_texto') else 0,
                'prev': q.get('prev') or '', 'img': q['img'], 'tipo': 'real', 'fonte': 'Objetivo (lido por IA)'}
    except Exception as e:
        return falhou(q, f'erro no programa: {e!r}'[:200])

def principal():
    args, maxn, i = [], 10 ** 9, 1
    while i < len(sys.argv):
        if sys.argv[i] == '--max': maxn = int(sys.argv[i + 1]); i += 2; continue
        if not sys.argv[i].startswith('--'): args.append(sys.argv[i])
        i += 1
    *entradas, sai = args
    q = [x for e in entradas for x in json.load(open(e, encoding='utf-8'))]
    out = json.load(open(sai, encoding='utf-8')) if os.path.exists(sai) else []
    feitas = {x['id'] for x in out}
    if os.path.exists(sai + '.falhas.json'):
        FALHAS.update({k: v for k, v in json.load(open(sai + '.falhas.json', encoding='utf-8')).items() if isinstance(v, dict)})
    if '--amostra' in sys.argv:
        random.seed(5); por = {}
        for x in q: por.setdefault(x.get('materia') or '?', []).append(x)
        q = [y for m, l in por.items() for y in random.sample(l, min(4, len(l)))]
    q = [x for x in q if 'tx-' + x['id'] not in feitas and not FALHAS.get(x['id'], {}).get('def')][:maxn]
    carregar_uso()
    print(f'{time.strftime("%d/%m %H:%M")} {len(q)} questões a processar ({len(out)} já prontas)', flush=True)
    ok = falha = 0; t0 = time.time()

    def gravar():
        tmp = sai + '.tmp'
        json.dump(out, open(tmp, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':')); os.replace(tmp, sai)
        with TRAVA:
            json.dump(FALHAS, open(sai + '.falhas.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=0)

    with ThreadPoolExecutor(int(os.environ.get('THREADS', 4))) as ex:
        # na ordem em que terminam (uma questão demorada não segura o registro nem o salvamento das outras)
        for fut in as_completed([ex.submit(processa, x) for x in q]):
            r = fut.result()
            if r: out.append(r); ok += 1
            else: falha += 1
            if (ok + falha) % 50 == 0:
                gravar()
            if (ok + falha) % 25 == 0:
                ritmo = (ok + falha) / max(1, time.time() - t0) * 3600
                print(f'{time.strftime("%d/%m %H:%M")}  {ok + falha}/{len(q)} (ok {ok}, falhou {falha}) · {ritmo:.0f}/hora', flush=True)
    gravar()
    print(f'{time.strftime("%d/%m %H:%M")} PRONTO: {ok} ok, {falha} falharam, arquivo {sai}', flush=True)

if __name__ == '__main__':
    principal()
