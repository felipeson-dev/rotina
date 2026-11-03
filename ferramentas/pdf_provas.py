"""Provas em PDF que não vêm do Objetivo: FMABC 2020/2024/2025, Fuvest 2027 (1ª fase) e os simulados oficiais da Fuvest 2027.
Mesmo método do pdf_vunesp.py: acha cada número de questão pelo texto do PDF, recorta a questão como imagem (com o texto-base que vem antes
e as figuras) e pega a resposta do gabarito oficial. Questão sem resposta no gabarito (anulada) fica de fora.
Os simulados saem com banca "Simulado ...": o app não os põe nas listas, só na aba Simulados. Para outro simulado externo, nova linha em EDICOES.
Uso: python -P pdf_provas.py [--gravar]    (sem --gravar só confere: recortes em C:\\rotina-banco\\pdfs\\conferir2 e texto em pdfs\\lidas-provas.json;
com ele precisa de C:\\rotina-banco\\assuntos-provas.json {id: {m, a}} e grava imagens em pacotes\\img\\<pasta> e fichas em objetivo-<arq>.json)
"""
import io, json, os, re, sys
import pymupdf
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pdf_vunesp import texto, gabarito, ALT_E, PRE_TEXTO, ZOOM

sys.stdout.reconfigure(encoding='utf-8')
DL = os.path.join(os.environ['USERPROFILE'], 'Downloads')
SAIDA = r'C:\rotina-banco'
IMGS = r'C:\rotina\pacotes\img'
URL = 'https://felipeson-dev.github.io/rotina/pacotes/img/'
EDICOES = [  # arq = objetivo-<arq>.json; col = qual versão do gabarito (0 = a primeira) quando o arquivo traz várias lado a lado
    dict(arq='fmabc', banca='FMABC', ano=2020, fase='2020', perfil='fmabc', prova='FMABC 2020 - prova.pdf', gab='FMABC 2020 - gabarito.pdf', pasta='fmabc', pref='fmabc2020', fonte='FMABC (caderno oficial)'),
    dict(arq='fmabc', banca='FMABC', ano=2024, fase='2024', perfil='fmabc', prova='FMABC 2024 - prova.pdf', gab='FMABC 2024 - gabarito.pdf', pasta='fmabc', pref='fmabc2024', fonte='FMABC (caderno oficial)'),
    dict(arq='fmabc', banca='FMABC', ano=2025, fase='2025', perfil='fmabc', prova='FMABC 2025 - prova.pdf', gab='FMABC 2025 - gabarito.pdf', pasta='fmabc', pref='fmabc2025', fonte='FMABC (caderno oficial)'),
    dict(arq='fuvest', banca='Fuvest', ano=2027, fase='2027_1fase', perfil='fuvest', prova='fuvest2027_1fase_prova_V1.pdf', gab='FUVEST 2027 - 1ª fase - gabarito.pdf', col=0, pasta='fuvest', pref='fuvest2027_1fase', fonte='Fuvest (caderno oficial, prova V1)'),
    dict(arq='simulados', banca='Simulado Fuvest 1ª edição', ano=2027, fase='simfuvest2027_1', perfil='fuvest', prova='FUVEST 2027 - simulado 1ª edição versão S1 - prova.pdf', gab='FUVEST 2027 - simulado 1ª edição - gabarito.pdf', col=0, pasta='simulados', pref='simfuvest2027_1', fonte='Fuvest (simulado oficial, prova S1)'),
    dict(arq='simulados', banca='Simulado Fuvest 2ª edição', ano=2027, fase='simfuvest2027_2', perfil='fuvest', prova='prova-s1-simulado-fuvest-2027-2edicao.pdf', gab='FUVEST 2027 - simulado 2ª edição - gabarito.pdf', col=0, pasta='simulados', pref='simfuvest2027_2', fonte='Fuvest (simulado oficial, prova S1)'),
]
TOTAL = 80
# anuladas depois de o gabarito sair: o PDF baixado ainda traz a letra preliminar, então ficam de fora aqui (e são tiradas do arquivo ao gravar)
ANULADAS = {'fuvest2027_1fase': [23],      # erro de longitude de Porto de Galinhas (V1 23 = V2 3 = V3 66 = V4 45), anunciada em 02/11/2026
            'simfuvest2027_1': [51]}       # "Note e adote" com duas respostas possíveis (S1 51 = S2 32 = S3 10 = S4 70), gabarito de 27/04/2026

def gabarito_colunas(arq, col):
    """Fuvest: as versões (V1..V4 ou S1..S4) ficam lado a lado, duas colunas de 40 questões por versão."""
    nums, letras = [], []
    for pg in pymupdf.open(arq):
        for w in pg.get_text('words'):
            if re.fullmatch(r'\d{1,2}', w[4]): nums.append(w)
            elif re.fullmatch(r'[A-E*]', w[4]): letras.append(w)
    xs = sorted(w[0] for w in nums)
    grupos = []
    for x in xs:
        if grupos and x - grupos[-1][-1] <= 15: grupos[-1].append(x)
        else: grupos.append([x])
    if len(grupos) < 2 * (col + 1):
        return {}
    lim = [(min(g) - 1, max(g) + 1) for g in grupos]
    g = {}
    for ci in (2 * col, 2 * col + 1):
        for w in nums:
            if not lim[ci][0] <= w[0] <= lim[ci][1]:
                continue
            achou = [l for l in letras if abs(l[1] - w[1]) < 3 and 0 < l[0] - w[2] < 60]
            if achou:
                g.setdefault(int(w[4]), min(achou, key=lambda l: l[0] - w[2])[4])
    return g

def itens_pagina(pg, perfil):
    W, H = pg.rect.width, pg.rect.height
    its = []
    for b in pg.get_text('dict')['blocks']:
        if b['type'] == 1:
            its.append({'bb': pymupdf.Rect(b['bbox']), 't': '', 'f': ''})
            continue
        for l in b['lines']:
            t = ''.join(s['text'] for s in l['spans']).replace('¬', ' ').strip()   # o simulado da 1ª edição usa "¬" no lugar do espaço
            if not t:
                continue
            r = pymupdf.Rect(l['bbox'])
            if (perfil == 'fuvest' and r.y1 < 42) or (perfil == 'fmabc' and r.y0 > H * 0.95):
                continue   # título da página (Fuvest) e rodapé com código e nº da página (FMABC)
            its.append({'bb': r, 't': t, 'f': l['spans'][0]['font']})
    for dr in pg.get_drawings():
        r = dr['rect']
        if r.height > H * 0.6 or r.width > W * 0.7 or (r.width < 3 and r.height < 3) or r.y1 > H * 0.93 or r.y0 < H * 0.05:
            continue
        its.append({'bb': pymupdf.Rect(r), 't': '', 'f': ''})
    cols = ([], [])
    for it in its:
        cols[0 if (it['bb'].x0 + it['bb'].x1) / 2 < W / 2 else 1].append(it)
    for c in cols:
        c.sort(key=lambda i: (round(i['bb'].y0), i['bb'].x0))
    return cols

def fluxo(d, perfil):
    s = []
    for np_, pg in enumerate(d):
        for nc, col in enumerate(itens_pagina(pg, perfil)):
            for it in col:
                s.append({**it, 'p': np_, 'c': nc})
    return s

def numero(it, perfil):
    """Número da questão se o item é o número dela: "{10}" na Fuvest; na FMABC, o número em negrito ao lado da palavra "questão"."""
    if perfil == 'fuvest':
        m = re.fullmatch(r'\{(\d{1,2})\}', it['t'])
    else:
        x = it['bb'].x0
        m = re.fullmatch(r'(\d{1,2})', it['t']) if 'Bold' in it['f'] and (88 <= x <= 96 or 358 <= x <= 368) else None
    return int(m.group(1)) if m else None

def regioes(s, perfil):
    ancoras, prox = {}, 1
    for i, it in enumerate(s):
        if numero(it, perfil) == prox and prox <= TOTAL:
            ancoras[prox] = i; prox += 1
    if prox != TOTAL + 1:
        raise RuntimeError(f'achei só até a questão {prox - 1} de {TOTAL}')
    out, inicio = {}, None
    for n in range(1, TOTAL + 1):
        a = ancoras[n]
        if inicio is None:
            inicio = next(i for i, it in enumerate(s) if it['p'] == s[a]['p'])
        lim = ancoras.get(n + 1, len(s))
        es = [i for i in range(a, lim) if ALT_E.match(s[i]['t'])]
        if es:
            fim = es[-1]; base = s[fim]['bb'].y1
            for j in range(fim + 1, lim):
                it = s[j]
                if it['p'] != s[fim]['p'] or it['c'] != s[fim]['c'] or it['bb'].y0 - base > 11 or PRE_TEXTO.search(it['t']):
                    break
                fim = j; base = max(base, it['bb'].y1)
        else:   # alternativas em figura: vai até a próxima questão
            fim = lim - 1
        out[n] = (inicio, fim, a, bool(es))
        inicio = fim + 1
    return out

def recorte(d, s, ini, fim):
    """Como o do pdf_vunesp, mas uma questão com figura/tabela de página inteira sai num recorte só por página (senão a figura aparece duas vezes)."""
    por_pag = {}
    for it in s[ini:fim + 1]:
        por_pag.setdefault(it['p'], []).append(it)
    partes = []
    for p, its in sorted(por_pag.items()):
        largo = any(it['bb'].width > d[p].rect.width * 0.55 for it in its)
        grupos = {0: its} if largo else {}
        if not largo:
            for it in its:
                grupos.setdefault(it['c'], []).append(it)
        for c, g in sorted(grupos.items()):
            bbs = [it['bb'] for it in g]
            r = pymupdf.Rect(min(b.x0 for b in bbs) - 5, min(b.y0 for b in bbs) - 5, max(b.x1 for b in bbs) + 5, max(b.y1 for b in bbs) + 6) & d[p].rect
            px = d[p].get_pixmap(matrix=pymupdf.Matrix(ZOOM, ZOOM), clip=r, alpha=False)
            partes.append(Image.open(io.BytesIO(px.tobytes('png'))).convert('RGB'))
    W = max(x.width for x in partes)
    img = Image.new('RGB', (W, sum(x.height for x in partes) + 16 * (len(partes) - 1)), 'white')
    y = 0
    for x in partes:
        img.paste(x, (0, y)); y += x.height + 16
    return img, len(partes)

def principal(gravar):
    p = os.path.join(SAIDA, 'assuntos-provas.json')
    assuntos = json.load(open(p, encoding='utf-8')) if os.path.exists(p) else {}
    tudo, avisos = [], []
    for ed in EDICOES:
        d = pymupdf.open(os.path.join(DL, ed['prova']))
        if ed['perfil'] == 'fuvest':
            g = gabarito_colunas(os.path.join(DL, ed['gab']), ed['col'])
        else:
            g, _ = gabarito(os.path.join(DL, ed['gab']))
        s = fluxo(d, ed['perfil'])
        rg = regioes(s, ed['perfil'])
        destino = os.path.join(IMGS, ed['pasta']) if gravar else os.path.join(SAIDA, 'pdfs', 'conferir2', ed['pasta'])
        os.makedirs(destino, exist_ok=True)
        ant, bytes_, feitas = None, 0, 0
        for n in range(1, TOTAL + 1):
            ini, fim, a, tem_e = rg[n]
            txt = texto(s, ini, fim, a)
            if n in ANULADAS.get(ed['pref'], []):
                avisos.append(f'{ed["pref"]}-{n:02d}: anulada pela banca, fica de fora'); continue
            if g.get(n) not in tuple('ABCDE'):
                avisos.append(f'{ed["pref"]}-{n:02d}: sem resposta no gabarito ({g.get(n)}), fica de fora'); continue
            img, npartes = recorte(d, s, ini, fim)
            letras = re.findall(r'(?m)^\(([A-E])\)', txt)
            if letras != list('ABCDE'):
                avisos.append(f'{ed["pref"]}-{n:02d}: alternativas lidas {"".join(letras) or "(nenhuma)"}')
            if npartes > 2 or img.height > 2600:
                avisos.append(f'{ed["pref"]}-{n:02d}: {npartes} pedaços, {img.width}x{img.height}')
            nome = f'{ed["pref"]}-{n:02d}.webp'
            b = io.BytesIO(); img.save(b, 'WEBP', quality=62, method=6)
            bytes_ += b.tell(); feitas += 1
            open(os.path.join(destino, nome), 'wb').write(b.getvalue())
            qid = f'obj-{ed["pref"]}-{n:02d}'
            x = assuntos.get(qid, {})
            tudo.append({'id': qid, 'banca': ed['banca'], 'ano': ed['ano'], 'fase': ed['fase'], 'num': f'{n:02d}', 'materia': x.get('m', ''), 'assunto': x.get('a', ''), 'gab': g[n], 'nalts': 5,
                         'img': URL + ed['pasta'] + '/' + nome, 'w': img.width, 'h': img.height, 'corte': img.height, 'enunciado': txt, 'tipo': 'real', 'modo': 'objetivo', 'fonte': ed['fonte'], 'prev': ant, '_arq': ed['arq']})
            ant = qid
        print(f'{ed["pref"]}: {len(g)} no gabarito, {feitas} recortadas, {bytes_ / 1e6:.1f} MB', flush=True)
        d.close()
    print('\nAVISOS:', *avisos or ['nenhum'], sep='\n  ')
    os.makedirs(os.path.join(SAIDA, 'pdfs'), exist_ok=True)
    json.dump(tudo, open(os.path.join(SAIDA, 'pdfs', 'lidas-provas.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    if gravar:
        faltam = [q['id'] for q in tudo if not q['assunto']]
        if faltam:
            raise SystemExit(f'{len(faltam)} questões sem assunto: não gravei.')
        for arq in sorted({q['_arq'] for q in tudo}):
            novas = [{k: v for k, v in q.items() if k != '_arq'} for q in tudo if q['_arq'] == arq]
            f = os.path.join(SAIDA, f'objetivo-{arq}.json')
            velhas = json.load(open(f, encoding='utf-8')) if os.path.exists(f) and os.path.getsize(f) > 10 else []
            ids = {q['id'] for q in novas} | {f'obj-{p}-{n:02d}' for p, ns in ANULADAS.items() for n in ns}
            json.dump([q for q in velhas if q['id'] not in ids] + novas, open(f, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
            print(f'gravado objetivo-{arq}.json: {len(velhas)} que já havia + {len(novas)}')

if __name__ == '__main__':
    principal('--gravar' in sys.argv)
