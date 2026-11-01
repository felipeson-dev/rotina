"""Questões objetivas dos cadernos em PDF da Vunesp (São Camilo): acha cada "QUESTÃO n" pelo texto do PDF, recorta a questão como imagem
(com o texto-base que vem antes dela e as figuras) e pega a resposta do gabarito oficial do próprio arquivo. Sem gabarito, a questão não entra.
Os recortes vão para C:\\rotina\\pacotes\\img\\saocamilo; o texto fica no enunciado (busca e IA). O assunto vem de C:\\rotina-banco\\assuntos-saocamilo.json.
Uso: python -P pdf_vunesp.py [--gravar]    (sem --gravar só confere; com ele junta em C:\\rotina-banco\\objetivo-saocamilo.json)
"""
import io, json, os, re, sys
import pymupdf
from PIL import Image

sys.stdout.reconfigure(encoding='utf-8')
RAIZ = os.path.join(os.environ['USERPROFILE'], 'Downloads', 'provas_sao_camilo')
SAIDA = r'C:\rotina-banco'
IMGS = r'C:\rotina\pacotes\img\saocamilo'
URL = 'https://felipeson-dev.github.io/rotina/pacotes/img/saocamilo/'
EDICOES = [  # fase, caderno da prova objetiva, arquivo com o gabarito
    ('2017_2', r'2017-2\CUSC1701_prova-II-objetiva.pdf', r'2017-2\CUSC1701_gabarito-prova-II.pdf'),
    ('2018_2', r'2018-2\CUSC1801_prova-II-objetiva.pdf', r'2018-2\CUSC1801_gabarito-prova-II.pdf'),
    ('2019_2', r'2019-2\CUSC1803_prova-II-objetiva.pdf', r'2019-2\CUSC1803_prova-II-objetiva.pdf'),
    ('2020_1', r'2020-1\CUSC1804_prova-II-objetiva.pdf', r'2020-1\CUSC1804_prova-II-objetiva.pdf'),
    ('2021_2', r'2021-2\CUSC2101_prova-e-gabarito-completo.pdf', r'2021-2\CUSC2101_prova-e-gabarito-completo.pdf'),
    ('2022_2', r'C:\rotina-banco\pdfs\saocamilo-2022-2\caderno2.pdf', r'C:\rotina-banco\pdfs\saocamilo-2022-2\gabarito.pdf'),
    ('2023_2', r'2023-2\CUSC2201_prova-II-objetiva-e-redacao.pdf', r'2023-2\CUSC2201_gabarito-prova-II.pdf'),
]
ZOOM = 2.4
ANCORA = re.compile(r'^QUEST[ÃA]O\s+(\d{1,2})$', re.I)
RODAPE = re.compile(r'cusc\s*\d+|confidencial até|^\d{1,2}$', re.I)
ALT_E = re.compile(r'^\(E\)')
PRE_TEXTO = re.compile(r'para responder|^(Leia|Examine|Analise|Observe)\b.*(quest|texto|figura|tira|gráfico|tabela)', re.I)

def gabarito(arq):
    d = pymupdf.open(arq)
    for pg in reversed(list(d)):   # nos arquivos completos o gabarito é a página depois da prova
        pares = re.findall(r'\b(\d{1,2})\s*-\s*([A-E]|\*|[Aa]nulada|X)(?![a-zçã])', re.sub(r'\s+', ' ', pg.get_text()))
        if len(pares) >= 30:
            return {int(n): l.upper() for n, l in pares}, re.search(r'VERS[ÃA]O\s*\d', pg.get_text() or '', re.I)
    return {}, None

def itens_pagina(pg):
    """Linhas de texto, imagens e desenhos da página, por coluna, de cima para baixo."""
    W, H = pg.rect.width, pg.rect.height
    its = []
    for b in pg.get_text('dict')['blocks']:
        if b['type'] == 1:
            its.append({'bb': pymupdf.Rect(b['bbox']), 't': ''})
            continue
        for l in b['lines']:
            t = ''.join(s['text'] for s in l['spans']).strip()
            if not t:
                continue
            r = pymupdf.Rect(l['bbox'])
            if RODAPE.search(t) and (r.y1 > H * 0.92 or r.y0 < H * 0.06):
                continue
            its.append({'bb': r, 't': t})
    for dr in pg.get_drawings():
        r = dr['rect']
        if r.height > H * 0.6 or r.width > W * 0.7 or (r.width < 3 and r.height < 3) or r.y1 > H * 0.93 or r.y0 < H * 0.03:
            continue   # divisória das colunas, moldura e rodapé
        its.append({'bb': pymupdf.Rect(r), 't': ''})
    meio = W / 2
    cols = ([], [])
    for it in its:
        cols[0 if (it['bb'].x0 + it['bb'].x1) / 2 < meio else 1].append(it)
    for c in cols:
        c.sort(key=lambda i: (round(i['bb'].y0), i['bb'].x0))
    return cols

def fluxo(d):
    """Todos os itens na ordem de leitura: página, coluna esquerda, coluna direita."""
    s = []
    for np_, pg in enumerate(d):
        for nc, col in enumerate(itens_pagina(pg)):
            for it in col:
                s.append({**it, 'p': np_, 'c': nc})
    return s

def regioes(s, total):
    ancoras, prox = {}, 1
    for i, it in enumerate(s):
        m = ANCORA.match(it['t'])
        if m and int(m.group(1)) == prox and prox <= total:
            ancoras[prox] = i; prox += 1
    if prox != total + 1:
        raise RuntimeError(f'achei só até a questão {prox - 1} de {total}')
    out, inicio = {}, None
    for n in range(1, total + 1):
        a = ancoras[n]
        if inicio is None:   # 1ª questão: o texto-base começa no topo da página dela
            inicio = next(i for i, it in enumerate(s) if it['p'] == s[a]['p'])
        lim = ancoras.get(n + 1, len(s))
        es = [i for i in range(a, lim) if ALT_E.match(s[i]['t'])]
        if es:
            fim = es[-1]
            base = s[fim]['bb'].y1
            for j in range(fim + 1, lim):
                it = s[j]
                if it['p'] != s[fim]['p'] or it['c'] != s[fim]['c'] or it['bb'].y0 - base > 11 or PRE_TEXTO.search(it['t']):
                    break
                fim = j; base = max(base, it['bb'].y1)
        else:   # sem "(E)" escrito (alternativas em figura): vai até a próxima questão
            fim = lim - 1
        out[n] = (inicio, fim, a, bool(es))
        inicio = fim + 1
        # entre as questões pode sobrar o começo de página em branco; a próxima começa no item seguinte
    return out

def recorte(d, s, ini, fim):
    """Imagem da questão: um pedaço por coluna, um embaixo do outro."""
    partes, grupos = [], {}
    for it in s[ini:fim + 1]:
        grupos.setdefault((it['p'], it['c']), []).append(it['bb'])
    for (p, c), bbs in sorted(grupos.items()):
        r = pymupdf.Rect(min(b.x0 for b in bbs) - 5, min(b.y0 for b in bbs) - 5, max(b.x1 for b in bbs) + 5, max(b.y1 for b in bbs) + 6) & d[p].rect
        px = d[p].get_pixmap(matrix=pymupdf.Matrix(ZOOM, ZOOM), clip=r, alpha=False)
        partes.append(Image.open(io.BytesIO(px.tobytes('png'))).convert('RGB'))
    W = max(x.width for x in partes)
    img = Image.new('RGB', (W, sum(x.height for x in partes) + 16 * (len(partes) - 1)), 'white')
    y = 0
    for x in partes:
        img.paste(x, (0, y)); y += x.height + 16
    return img, len(partes)

def texto(s, ini, fim, a):
    ls = [it['t'] for i, it in enumerate(s[ini:fim + 1], ini) if it['t'] and i != a]
    return '\n'.join(ls)

def principal(gravar):
    assuntos = {}
    p = os.path.join(SAIDA, 'assuntos-saocamilo.json')
    if os.path.exists(p):
        assuntos = json.load(open(p, encoding='utf-8'))
    os.makedirs(IMGS, exist_ok=True)
    tudo, avisos = [], []
    for fase, cad, gab in EDICOES:
        d = pymupdf.open(os.path.join(RAIZ, cad))
        g, _ = gabarito(os.path.join(RAIZ, gab))
        total = max(g)
        s = fluxo(d)
        rg = regioes(s, total)
        ant, bytes_ = None, 0
        for n in range(1, total + 1):
            ini, fim, a, tem_e = rg[n]
            txt = texto(s, ini, fim, a)
            letras = re.findall(r'(?m)^\(([A-E])\)', txt)
            if g.get(n) not in tuple('ABCDE'):
                avisos.append(f'{fase}-{n:02d}: sem resposta no gabarito ({g.get(n)}), fica de fora'); continue
            img, npartes = recorte(d, s, ini, fim)
            if letras != list('ABCDE'):
                avisos.append(f'{fase}-{n:02d}: alternativas lidas {"".join(letras) or "(nenhuma)"}')
            if npartes > 2 or img.height > 2600:
                avisos.append(f'{fase}-{n:02d}: {npartes} pedaços, {img.width}x{img.height}')
            nome = f'{fase}-{n:02d}.webp'
            b = io.BytesIO(); img.save(b, 'WEBP', quality=62, method=6)
            bytes_ += b.tell()
            if gravar:
                open(os.path.join(IMGS, nome), 'wb').write(b.getvalue())
            else:
                os.makedirs(os.path.join(SAIDA, 'pdfs', 'conferir'), exist_ok=True)
                open(os.path.join(SAIDA, 'pdfs', 'conferir', nome), 'wb').write(b.getvalue())
            qid = f'obj-saocamilo{fase}-{n:02d}'
            x = assuntos.get(qid, {})
            tudo.append({'id': qid, 'banca': 'São Camilo', 'ano': int(fase[:4]), 'fase': fase, 'num': f'{n:02d}', 'materia': x.get('m', ''), 'assunto': x.get('a', ''), 'gab': g[n], 'nalts': 5,
                         'img': URL + nome, 'w': img.width, 'h': img.height, 'corte': img.height, 'enunciado': txt, 'tipo': 'real', 'modo': 'objetivo', 'fonte': 'Vunesp (caderno oficial)', 'prev': ant})
            ant = qid
        print(f'{fase}: {total} no gabarito, {sum(1 for q in tudo if q["fase"] == fase)} recortadas, {bytes_ / 1e6:.1f} MB', flush=True)
        d.close()
    print('\nAVISOS:', *avisos or ['nenhum'], sep='\n  ')
    json.dump(tudo, open(os.path.join(SAIDA, 'pdfs', 'lidas-saocamilo.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    if gravar:
        faltam = [q['id'] for q in tudo if not q['assunto']]
        if faltam:
            raise SystemExit(f'{len(faltam)} questões sem assunto: não gravei (o app baixaria tudo de novo a cada abertura).')
        arq = os.path.join(SAIDA, 'objetivo-saocamilo.json')
        velhas = [q for q in json.load(open(arq, encoding='utf-8')) if q.get('fonte') == 'Objetivo']
        json.dump(velhas + tudo, open(arq, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        print(f'gravado: {len(velhas)} do Objetivo + {len(tudo)} dos PDFs')

if __name__ == '__main__':
    principal('--gravar' in sys.argv)
