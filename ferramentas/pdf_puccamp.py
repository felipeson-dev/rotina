"""PUC-Campinas Medicina (cadernos oficiais): Prova Geral (50 objetivas, todas as matérias) + Prova Específica (20 objetivas de Química e Biologia).
Mesmo método do pdf_provas.py: acha cada número de questão ("12." na margem esquerda), recorta a questão como imagem (com o texto-base que
vem antes e as figuras) e pega a resposta do gabarito oficial. A Específica recomeça em 1: as questões dela ficam como 51 a 70.
Uso: python -P pdf_puccamp.py [--gravar]
  sem --gravar: recortes em C:\\rotina-banco\\puc-campinas\\conferir e textos em C:\\rotina-banco\\puc-campinas\\lidas.json
  com --gravar: precisa de C:\\rotina-banco\\puc-campinas\\assuntos.json {id: {m, a}}; grava imagens em C:\\rotina\\pacotes\\img\\puccamp e fichas em C:\\rotina-banco\\objetivo-puccamp.json
"""
import io, json, os, re, sys
import pymupdf
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pdf_vunesp import ALT_E, PRE_TEXTO, ZOOM

sys.stdout.reconfigure(encoding='utf-8')
BASE = r'C:\rotina-banco\puc-campinas'
PDF = os.path.join(BASE, 'pdf')
IMGS = r'C:\rotina\pacotes\img\puccamp'
URL = 'https://felipeson-dev.github.io/rotina/pacotes/img/puccamp/'
EDICOES = [   # ano = ano do vestibular (a prova é aplicada no fim do ano anterior)
    dict(ano=2027, prova='2027.pdf', gab_geral='2027g.pdf', gab_esp='2027e.pdf', pref='puccamp2027'),
    dict(ano=2026, prova='2026.pdf', gab_geral='2026g.pdf', gab_esp='2026e.pdf', pref='puccamp2026'),
]
GABARITO_MAO = {}   # pref -> {n: letra}, para gabarito que só vem como imagem (preenchido lendo a imagem)
if os.path.exists(os.path.join(BASE, 'gabaritos-mao.json')):
    GABARITO_MAO = {k: {int(n): l for n, l in v.items()} for k, v in json.load(open(os.path.join(BASE, 'gabaritos-mao.json'), encoding='utf-8')).items()}

def gabarito(arq):
    """Pares número -> letra na ordem de leitura ("1 B 11 C 21 C ...")."""
    ws = [w[4] for pg in pymupdf.open(arq) for w in pg.get_text('words')]
    g = {}
    for a, b in zip(ws, ws[1:]):
        if re.fullmatch(r'\d{1,2}', a) and re.fullmatch(r'[A-E*]|Anulada|ANULADA', b):
            g.setdefault(int(a), b[0] if b[0] in 'ABCDE' else '*')
    return g

def fluxo(d):
    s = []
    for p, pg in enumerate(d):
        W, H = pg.rect.width, pg.rect.height
        its = []
        for b in pg.get_text('dict')['blocks']:
            if b['type'] == 1:
                its.append({'bb': pymupdf.Rect(b['bbox']), 't': '', 'f': ''}); continue
            for l in b['lines']:
                t = ''.join(sp['text'] for sp in l['spans']).strip()
                if not t: continue
                r = pymupdf.Rect(l['bbox'])
                if r.y1 < 28 or re.match(r'PUCCAMP-\d\d', t) or (r.y0 > H * 0.95): continue    # cabeçalho, código e nº da página
                its.append({'bb': r, 't': t, 'f': l['spans'][0]['font']})
        for dr in pg.get_drawings():
            r = dr['rect']
            if r.height > H * 0.6 or r.width > W * 0.8 or (r.width < 3 and r.height < 3) or r.y1 > H * 0.95 or r.y0 < 28: continue
            its.append({'bb': pymupdf.Rect(r), 't': '', 'f': ''})
        its.sort(key=lambda i: (round(i['bb'].y0), i['bb'].x0))
        s += [{**it, 'p': p, 'c': 0} for it in its]
    return s

def numero(it):
    m = re.fullmatch(r'(\d{1,2})\.', it['t'])
    return int(m.group(1)) if m and it['bb'].x0 < 45 else None

def regioes(s):
    """Âncoras 1..50 (Geral) e depois 1..20 (Específica, viram 51..70)."""
    anc, prox, parte = {}, 1, 0
    for i, it in enumerate(s):
        n = numero(it)
        if n is None: continue
        if parte == 0 and n == prox:
            anc[prox] = i; prox += 1
            if prox == 51: parte, prox = 1, 1
        elif parte == 1 and n == prox and prox <= 20:
            anc[50 + prox] = i; prox += 1
    total = len(anc)
    out, inicio = {}, None
    for n in sorted(anc):
        a = anc[n]
        if inicio is None or n == 51:
            inicio = next(i for i, it in enumerate(s) if it['p'] == s[a]['p'])
        lim = anc.get(n + 1, len(s))
        if n == 50 and 51 in anc:   # a Geral acaba antes da página de instruções da Específica
            lim = next((i for i in range(a, anc[51]) if s[i]['p'] > s[a]['p'] and re.search(r'PROVA ESPEC|Prova Espec|REDAÇÃO|Redação', s[i]['t'])), anc[51])
        es = [i for i in range(a, lim) if ALT_E.match(s[i]['t'])]
        if es:
            fim = es[-1]; base = s[fim]['bb'].y1
            for j in range(fim + 1, lim):
                it = s[j]
                if it['p'] != s[fim]['p'] or it['bb'].y0 - base > 11 or PRE_TEXTO.search(it['t']): break
                fim = j; base = max(base, it['bb'].y1)
        else:
            fim = lim - 1
        out[n] = (inicio, fim, a, bool(es))
        inicio = fim + 1
    return out, total

def recorte(d, s, ini, fim):
    por_pag = {}
    for it in s[ini:fim + 1]: por_pag.setdefault(it['p'], []).append(it)
    partes = []
    for p, its in sorted(por_pag.items()):
        bbs = [it['bb'] for it in its]
        r = pymupdf.Rect(min(b.x0 for b in bbs) - 5, min(b.y0 for b in bbs) - 5, max(b.x1 for b in bbs) + 5, max(b.y1 for b in bbs) + 6) & d[p].rect
        px = d[p].get_pixmap(matrix=pymupdf.Matrix(ZOOM, ZOOM), clip=r, alpha=False)
        partes.append(Image.open(io.BytesIO(px.tobytes('png'))).convert('RGB'))
    W = max(x.width for x in partes)
    img = Image.new('RGB', (W, sum(x.height for x in partes) + 16 * (len(partes) - 1)), 'white')
    y = 0
    for x in partes: img.paste(x, (0, y)); y += x.height + 16
    return img, len(partes)

def texto(s, ini, fim):
    out = []
    for it in s[ini:fim + 1]:
        if it['t']: out.append(it['t'])
    return '\n'.join(out)

def principal(gravar):
    p = os.path.join(BASE, 'assuntos.json')
    assuntos = json.load(open(p, encoding='utf-8')) if os.path.exists(p) else {}
    tudo, avisos = [], []
    for ed in EDICOES:
        d = pymupdf.open(os.path.join(PDF, ed['prova']))
        g = {**gabarito(os.path.join(PDF, ed['gab_geral']))}
        g.update({50 + n: l for n, l in gabarito(os.path.join(PDF, ed['gab_esp'])).items()})
        g.update(GABARITO_MAO.get(ed['pref'], {}))
        s = fluxo(d)
        rg, total = regioes(s)
        if total != 70: avisos.append(f'{ed["pref"]}: achei {total} de 70 questões')
        destino = IMGS if gravar else os.path.join(BASE, 'conferir', ed['pref'])
        os.makedirs(destino, exist_ok=True)
        ant, bytes_, feitas = None, 0, 0
        for n in sorted(rg):
            ini, fim, a, tem_e = rg[n]
            txt = texto(s, ini, fim)
            if g.get(n) not in tuple('ABCDE'):
                avisos.append(f'{ed["pref"]}-{n:02d}: sem resposta no gabarito ({g.get(n)}), fica de fora'); continue
            img, npartes = recorte(d, s, ini, fim)
            letras = re.findall(r'(?m)^\(([A-E])\)', txt)
            if letras != list('ABCDE'): avisos.append(f'{ed["pref"]}-{n:02d}: alternativas lidas {"".join(letras) or "(nenhuma)"}')
            if npartes > 2 or img.height > 2600: avisos.append(f'{ed["pref"]}-{n:02d}: {npartes} pedaços, {img.width}x{img.height}')
            nome = f'{ed["pref"]}-{n:02d}.webp'
            b = io.BytesIO(); img.save(b, 'WEBP', quality=62, method=6)
            bytes_ += b.tell(); feitas += 1
            open(os.path.join(destino, nome), 'wb').write(b.getvalue())
            qid = f'obj-{ed["pref"]}-{n:02d}'
            x = assuntos.get(qid, {})
            prova = 'Prova Específica' if n > 50 else 'Prova Geral'
            tudo.append({'id': qid, 'banca': 'PUC-Campinas', 'ano': ed['ano'], 'fase': str(ed['ano']), 'num': f'{n:02d}', 'materia': x.get('m', ''), 'assunto': x.get('a', ''), 'gab': g[n], 'nalts': 5,
                         'img': URL + nome, 'w': img.width, 'h': img.height, 'corte': img.height, 'enunciado': txt, 'tipo': 'real', 'modo': 'objetivo',
                         'fonte': f'PUC-Campinas Medicina {ed["ano"]} ({prova}, caderno oficial)', 'prev': ant})
            ant = qid
        print(f'{ed["pref"]}: {len(g)} no gabarito, {feitas} recortadas, {bytes_ / 1e6:.1f} MB', flush=True)
        d.close()
    print('\nAVISOS:', *avisos or ['nenhum'], sep='\n  ')
    json.dump(tudo, open(os.path.join(BASE, 'lidas.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    if gravar:
        faltam = [q['id'] for q in tudo if not q['assunto']]
        if faltam: raise SystemExit(f'{len(faltam)} questões sem assunto: não gravei.')
        json.dump(tudo, open(r'C:\rotina-banco\objetivo-puccamp.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        print('gravado objetivo-puccamp.json:', len(tudo))

if __name__ == '__main__':
    principal('--gravar' in sys.argv)
