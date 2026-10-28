"""Questões oficiais (com gabarito e resolução comentada em imagem) das provas resolvidas pelo Curso Objetivo.
Para cada questão de múltipla escolha: baixa a imagem da resolução (enunciado + resolução), lê o texto com o OCR do Windows,
acha onde termina o enunciado (antes de "Resolução") e grava só os dados: o app mostra a imagem direto do site, recortada
na parte do enunciado; depois de responder, mostra a resolução. Uso pessoal de estudo.
Uso: python objetivo.py <banca> [<banca> ...] [--fase 1fase] [--de 2010]
Saída: C:\\rotina-banco\\objetivo-<banca>.json
"""
import json, os, re, subprocess, sys, time, urllib.request, html as H, statistics
from concurrent.futures import ThreadPoolExecutor

SAIDA = r'C:\rotina-banco'
CACHE = os.path.join(SAIDA, 'cache', 'objetivo')
UA = {'User-Agent': 'Mozilla/5.0'}
BASE = 'https://www.curso-objetivo.br/vestibular/resolucao-comentada/'
SUF = os.environ.get('SUFIXO', '')
OCR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ocr.ps1')
NOME = {'fuvest': 'Fuvest', 'unesp': 'UNESP', 'unicamp': 'Unicamp', 'unifesp': 'UNIFESP', 'santacasa': 'Santa Casa', 'alberteinstein': 'Albert Einstein', 'famema': 'FAMEMA',
        'fmj': 'FMJ', 'famerp': 'FAMERP', 'fmabc': 'FMABC', 'pucsp': 'PUC-SP', 'fgvsp': 'FGV-SP', 'ita': 'ITA', 'ime': 'IME', 'fatec': 'FATEC', 'insper': 'Insper', 'ufscar': 'UFSCar',
        'ufabc': 'UFABC', 'saocamilo': 'São Camilo', 'siriolibanes': 'Sírio-Libanês', 'unisa': 'UNISA', 'mackenzie': 'Mackenzie', 'enem': 'ENEM', 'unb': 'UnB'}
MATERIAS = {'portugu': 'Português', 'literatura': 'Literatura', 'ingl': 'Inglês', 'matem': 'Matemática', 'fís': 'Física', 'fis': 'Física', 'quím': 'Química', 'quim': 'Química',
            'biol': 'Biologia', 'hist': 'História', 'geog': 'Geografia', 'filos': 'Filosofia', 'sociol': 'Sociologia'}

def get(url, binario=False, tentativas=5):
    for i in range(tentativas):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                d = r.read()
                return d if binario else d.decode('utf-8', 'replace')
        except Exception:
            if i == tentativas - 1:
                return None
            time.sleep(3 + i * 4)

def materia_do_titulo(t):
    # cabeçalho com duas matérias ("Português e Inglês", "História e Geografia"): fica em branco e a IA decide pela questão
    t = t.lower()
    achadas = {v for k, v in MATERIAS.items() if k in t}
    return achadas.pop() if len(achadas) == 1 else ''

def ids_unicos(lista):
    """Provas de 2 dias ou blocos na mesma página numeram as questões de 01 de novo: o 2º "01" ganha o nome da pasta da imagem
    (ex.: obj-unesp2021_1fase-2dia-01). O primeiro mantém o id antigo, para não perder o que já foi lido. Refaz o "prev" (questão
    anterior da mesma prova), que com ids repetidos apontava para a questão errada."""
    vistos, ant, fase_ant = set(), None, object()
    for r in lista:
        if r['id'] in vistos:
            pasta = re.sub(r'\W', '', r['img'].rstrip('/').split('/')[-2]) or 'b'
            base = r['id'].rsplit('-', 1)
            novo, n = f'{base[0]}-{pasta}-{base[1]}', 2
            while novo in vistos:
                novo, n = f'{base[0]}-{pasta}{n}-{base[1]}', n + 1
            r['id'] = novo
        vistos.add(r['id'])
        if r.get('fase') != fase_ant:
            ant, fase_ant = None, r.get('fase')
        r['prev'] = ant; ant = r['id']
    return lista

def entradas(banca, pagina):
    """Lista (questao, alternativa, url, materia_do_cabecalho) de uma prova, sem repetir imagens."""
    html = get(BASE + f'{banca}/{pagina}.aspx')
    m = html and re.search(r'data-prova="(\d+)"', html)
    if not m:
        return []
    t = get(f'https://sistemas.objetivo.br/ResolucaoComentadaApi/templates/prova/{m.group(1)}') or ''
    out, vistas, cab = [], set(), ''
    for x in re.finditer(r'class="rc__titulo-materia"[^>]*>(.*?)</td>|data-alternativa="([^"]*)"\s+data-questao="([^"]*)"\s+data-url="([^"]*)"', t, re.S):
        if x.group(1) is not None:
            cab = H.unescape(re.sub('<[^>]+>', '', x.group(1))).strip()
            continue
        alt, q, url = x.group(2).strip().upper(), x.group(3).strip(), x.group(4).strip().replace('http://', 'https://')
        if alt not in ('A', 'B', 'C', 'D', 'E') or url in vistas:
            continue
        vistas.add(url)
        out.append((q, alt, url, materia_do_titulo(cab)))
    return out

def baixar(lista, pasta):
    os.makedirs(pasta, exist_ok=True)
    def um(item):
        q, alt, url, mat = item
        arq = os.path.join(pasta, re.sub(r'[^\w.-]', '_', url.split('/resolucao-comentada/')[-1]))
        if not os.path.exists(arq):
            d = get(url, binario=True)
            if d:
                open(arq, 'wb').write(d)
        return arq
    with ThreadPoolExecutor(6) as ex:
        return list(ex.map(um, lista))

def ocr(pasta):
    saida = os.path.join(pasta, '_ocr.json')
    if not os.path.exists(saida):
        subprocess.run(['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', OCR, pasta, saida], check=False, capture_output=True)
    try:
        return json.load(open(saida, encoding='utf-8-sig'))
    except Exception:
        return {}

ALT = re.compile(r'^\(?([a-eA-E])\)\s*')
def cortar(info):
    """Acha a altura onde termina o enunciado. Devolve (corte, n_alternativas, texto) ou None."""
    # o OCR devolve as linhas por bloco/coluna: em ordem de altura, "Resolução" fica depois das alternativas em colunas
    ls = sorted((l for l in info.get('linhas') or [] if l.get('t')), key=lambda l: (l['y'], l.get('x', 0)))
    if len(ls) < 3:
        return None
    ys = [l['y'] for l in ls]
    i_resp = next((i for i, l in enumerate(ls) if re.match(r'^\s*Resposta', l['t'])), len(ls))
    alts = [i for i, l in enumerate(ls[:i_resp]) if ALT.match(l['t'])]
    # "Resolução" que vale é a que vem depois das alternativas (o enunciado pode ter "Resolução do CONAMA")
    i_res = next((i for i, l in enumerate(ls) if re.match(r'^\s*Resol\s*u', l['t'], re.I) and l['y'] >= 120 and (not alts or i > alts[-1])), None)
    letras = sorted({ALT.match(ls[i]['t']).group(1).lower() for i in alts})
    if i_res is not None and i_res > 0:
        corte = ls[i_res]['y'] - 6
        fim = i_res
    else:
        if not alts:
            return None
        passos = [b - a for a, b in zip(ys, ys[1:]) if b > a]
        normal = statistics.median(passos) if passos else 20
        ult = alts[-1]
        fim = next((j for j in range(ult + 1, i_resp) if ys[j] - ys[j - 1] > 2.1 * normal), None)
        if fim is None:
            return None
        corte = (ys[fim - 1] + ls[fim - 1]['h'] + ys[fim]) // 2
    if corte < 120:
        return None
    texto = '\n'.join(l['t'] for l in ls[:fim])
    texto = re.sub(r'^\s*\d+\s*\n', '', texto)
    n = len(letras) if letras and letras[0] == 'a' and len(letras) >= 4 else 0
    return corte, n, texto

def processar(banca, fase=None, desde=0):
    paginas = json.load(open(os.path.join(SAIDA, 'cache', 'objetivo_paginas.json'))).get(banca, [])
    out, falhas = [], 0
    for pg in paginas:
        ano = int(re.search(r'(\d{4})', pg).group(1))
        if ano < desde or (fase and fase not in pg and re.search(r'\dfase', pg)):
            continue
        if os.environ.get('SO_CACHE') and not os.path.exists(os.path.join(CACHE, banca, pg, '_ocr.json')):
            continue   # modo amostra: só o que já está baixado e lido
        lista = entradas(banca, pg)
        if not lista:
            continue
        pasta = os.path.join(CACHE, banca, pg)
        arqs = baixar(lista, pasta)
        o = ocr(pasta)
        padrao = 4 if banca == 'unicamp' else 5
        anterior = None
        for (q, alt, url, mat), arq in zip(lista, arqs):
            info = o.get(os.path.basename(arq))
            c = info and cortar(info)
            if not c:
                falhas += 1
                continue
            corte, n, texto = c
            n = max(n if n > padrao else padrao, 'ABCDE'.index(alt) + 1)   # o OCR às vezes perde uma alternativa
            out.append({'id': f'obj-{pg}-{q}', 'banca': NOME.get(banca, banca), 'ano': ano, 'fase': pg.replace(banca, ''), 'num': q, 'materia': mat, 'gab': alt,
                        'nalts': n, 'img': url, 'w': info['w'], 'h': info['h'], 'corte': corte, 'enunciado': texto, 'tipo': 'real', 'modo': 'objetivo', 'fonte': 'Objetivo', 'prev': anterior})
            anterior = out[-1]['id']   # o texto-base de um grupo de questões costuma estar na primeira do grupo
        print(f'  {pg}: {len(lista)} questões, total {len(out)}, falhas {falhas}', flush=True)
    ids_unicos(out)
    # refazer uma banca não perde o assunto já classificado (a chave é a imagem, que é única)
    arq = os.path.join(SAIDA, f'objetivo-{banca}{SUF}.json')
    if os.path.exists(arq):
        velho = {r['img']: r for r in json.load(open(arq, encoding='utf-8'))}
        for r in out:
            v = velho.get(r['img'])
            if v and v.get('assunto') and (not r['materia'] or v.get('materia') == r['materia']):
                r['assunto'] = v['assunto']; r['materia'] = v.get('materia') or r['materia']
    json.dump(out, open(arq, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'>> {banca}: {len(out)} questões (falhas de recorte: {falhas})', flush=True)

if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    fase = sys.argv[sys.argv.index('--fase') + 1] if '--fase' in sys.argv else None
    desde = int(sys.argv[sys.argv.index('--de') + 1]) if '--de' in sys.argv else 0
    for b in args:
        if b in (fase, str(desde)):
            continue
        processar(b, fase, desde)
    print('PRONTO', flush=True)
