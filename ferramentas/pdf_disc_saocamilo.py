"""Discursivas (Prova I) da São Camilo, dos cadernos e critérios de correção em PDF. Cada questão vira uma imagem só: o enunciado em cima e,
embaixo, o trecho dos critérios de correção dela (o app mostra a parte de baixo como "padrão de resposta" depois que ela responde; "corte" é onde
começa). Sem critérios publicados, a parte de baixo é um aviso. O texto dos critérios também vai em "coment", para a correção pela IA.
Uso: python -P pdf_disc_saocamilo.py [--gravar]   (sem --gravar só confere: recortes em C:\\rotina-banco\\pdfs\\conferir-disc e texto em pdfs\\lidas-disc-saocamilo.json;
com ele precisa de C:\\rotina-banco\\assuntos-disc-saocamilo.json {id: {m, a}} e junta em objetivo-disc-saocamilo.json)
"""
import io, json, os, re, sys
import pymupdf
from PIL import Image, ImageDraw, ImageFont

sys.stdout.reconfigure(encoding='utf-8')
RAIZ = os.path.join(os.environ['USERPROFILE'], 'Downloads', 'provas_sao_camilo')
SAIDA = r'C:\rotina-banco'
IMGS = r'C:\rotina\pacotes\img\saocamilo-disc'
URL = 'https://felipeson-dev.github.io/rotina/pacotes/img/saocamilo-disc/'
ZOOM = 2.2
EDICOES = [  # fase, caderno da Prova I, critérios de correção (ou None)
    ('2016_1', r'2016-1\CUSC1501_prova-I.pdf', None),
    ('2018_1', r'2018-1\CUSC1702_prova-I.pdf', r'2018-1\CUSC1702_criterios-prova-I.pdf'),
    ('2018_2', r'2018-2\pacote-completo_extraido\CADERNO1_CUSC1801.pdf', None),
    ('2019_1', r'2019-1\CUSC1802_prova-I.pdf', r'2019-1\CUSC1802_criterios-prova-I.pdf'),
    ('2021_1', r'2021-1\CUSC1902_prova-I.pdf', r'2021-1\CUSC1902_criterios-prova-I.pdf'),
    ('2022_1', r'2022-1\CUSC2102_prova-I.pdf', r'2022-1\CUSC2102_criterios-prova-I.pdf'),
    ('2025_1', r'2025-1\CUSC2401_prova-I.pdf', None),
    ('2025_2', r'2025-2\CUSC2402_prova-I.pdf', None),
    ('2026_1', r'2026-1\CUSC2501_prova-I.pdf', None),
    ('2026_2', r'2026-2\CUSC2601_prova-I.pdf', r'2026-2\CUSC2601_criterios-prova-I.pdf'),
]   # 2024_2 já está no banco (vem do Objetivo, com a resolução)
ANC = re.compile(r'^QUEST[ÃA]O\s+(\d{1,2})$', re.I)
CABEC = re.compile(r'^(PROCESSO SELETIVO|\d\s*[ºo°]?\s*Semestre de \d{4}|Medicina)$', re.I)   # cabeçalho de cada página dos critérios
RUIDO = re.compile(r'^(RASCUNHO|RESOLU\S+ E RESPOSTA|CUSC\s*\d+.*|\d{6,}|.*\|\s*\d{3}-Prova.*|Confidencial.*|Pág\..*)$', re.I)

def itens(d, prova):
    """Itens do documento em ordem de leitura (uma coluna): linhas de texto, imagens e desenhos pequenos, sem cabeçalho de página, rodapé, rascunho e código de barras."""
    s = []
    for np_, pg in enumerate(d):
        W, H = pg.rect.width, pg.rect.height
        desenhos = [dr['rect'] for dr in pg.get_drawings()]
        # caderno: a caixa "RESOLUÇÃO E RESPOSTA" (moldura larga) marca onde acaba o enunciado; o que está dela para baixo (e a marca d'água) fica de fora
        limite = min((r.y0 for r in desenhos if r.width > W * 0.7 and r.y0 > H * 0.4), default=H) if prova else H
        its = []
        for b in pg.get_text('dict')['blocks']:
            r = pymupdf.Rect(b['bbox'])
            if r.y0 > H * 0.945 or r.y0 >= limite - 4 or (b['type'] == 1 and (prova and r.y1 < H * 0.065 or not prova and r.y1 < H * 0.22)):
                continue   # rodapé, código de barras do topo e logotipo dos critérios
            if b['type'] == 1:
                its.append({'bb': r, 't': ''}); continue
            for l in b['lines']:
                t = ''.join(x['text'] for x in l['spans']).strip()
                if t and not RUIDO.match(t) and not (not prova and CABEC.match(t)):
                    its.append({'bb': pymupdf.Rect(l['bbox']), 't': t})
        for r in desenhos:
            if r.width > W * 0.7 or r.height > H * 0.5 or (r.width < 3 and r.height < 3) or r.y1 > H * 0.945 or r.y0 >= limite - 14 or (prova and r.y0 < H * 0.08) or (not prova and r.y1 < H * 0.22):
                continue
            its.append({'bb': pymupdf.Rect(r), 't': ''})
        its.sort(key=lambda i: (round(i['bb'].y0), i['bb'].x0))
        s += [{**i, 'p': np_} for i in its]
    return s

def regioes(s, por_pagina=False):
    """por_pagina (caderno): o texto-base acima do "QUESTÃO n", na mesma página, entra na questão; nos critérios a região começa no próprio título."""
    ancoras, prox = {}, 1
    for i, it in enumerate(s):
        m = ANC.match(it['t'])
        if m and int(m.group(1)) == prox:
            ancoras[prox] = i; prox += 1
    n = prox - 1
    out = {}
    for k in range(1, n + 1):
        if k + 1 in ancoras:
            fim = ancoras[k + 1] - 1
        else:   # a última vai até a página seguinte à dela (depois vêm só folhas de rascunho)
            fim = max(i for i, it in enumerate(s) if it['p'] <= s[ancoras[k]]['p'] + 1)
        ini = ancoras[k]
        if por_pagina and (k == 1 or s[ancoras[k - 1]]['p'] < s[ini]['p']):
            ini = next(i for i, it in enumerate(s) if it['p'] == s[ini]['p'])
        out[k] = (ini, fim)
    return out

def recorte(d, s, ini, fim, margem=5):
    por_pag = {}
    for it in s[ini:fim + 1]:
        por_pag.setdefault(it['p'], []).append(it['bb'])
    partes = []
    for p, bbs in sorted(por_pag.items()):
        r = pymupdf.Rect(min(b.x0 for b in bbs) - margem, min(b.y0 for b in bbs) - margem, max(b.x1 for b in bbs) + margem, max(b.y1 for b in bbs) + margem) & d[p].rect
        px = d[p].get_pixmap(matrix=pymupdf.Matrix(ZOOM, ZOOM), clip=r, alpha=False)
        partes.append(Image.open(io.BytesIO(px.tobytes('png'))).convert('RGB'))
    return partes

def empilha(partes, largura, gap=10):
    img = Image.new('RGB', (largura, sum(x.height for x in partes) + gap * (len(partes) - 1)), 'white')
    y = 0
    for x in partes:
        img.paste(x, (0, y)); y += x.height + gap
    return img

def aviso_sem_criterios(largura):
    img = Image.new('RGB', (largura, 150), 'white')
    f = ImageFont.truetype(r'C:\Windows\Fonts\arial.ttf', 34)
    d = ImageDraw.Draw(img)
    d.text((20, 30), 'A banca não divulgou os critérios de correção', font=f, fill=(90, 90, 90))
    d.text((20, 80), 'desta questão. Compare com o conteúdo esperado.', font=f, fill=(90, 90, 90))
    return img

def texto(s, ini, fim):
    return '\n'.join(it['t'] for it in s[ini:fim + 1] if it['t'] and not ANC.match(it['t']))

def principal(gravar):
    p = os.path.join(SAIDA, 'assuntos-disc-saocamilo.json')
    assuntos = json.load(open(p, encoding='utf-8')) if os.path.exists(p) else {}
    tudo, avisos = [], []
    destino = IMGS if gravar else os.path.join(SAIDA, 'pdfs', 'conferir-disc')
    os.makedirs(destino, exist_ok=True)
    for fase, prova, crit in EDICOES:
        d = pymupdf.open(os.path.join(RAIZ, prova)); s = itens(d, True); rq = regioes(s, True)
        dc = pymupdf.open(os.path.join(RAIZ, crit)) if crit else None
        sc = itens(dc, False) if dc else []; rc = regioes(sc) if dc else {}
        if dc and set(rc) != set(rq):
            avisos.append(f'{fase}: {len(rq)} questões no caderno e {len(rc)} nos critérios')
        ant, feitas = None, 0
        for n in sorted(rq):
            ini, fim = rq[n]
            enun = recorte(d, s, ini, fim)
            if not enun:
                avisos.append(f'{fase}-{n:02d}: sem conteúdo'); continue
            larg = max(x.width for x in enun)
            topo = empilha(enun, larg)
            if topo.height > 3200:
                avisos.append(f'{fase}-{n:02d}: enunciado com {topo.height}px (conferir)')
            coment = ''
            if n in rc:
                partes = recorte(dc, sc, *rc[n])
                base = empilha(partes, max(x.width for x in partes)); coment = texto(sc, *rc[n])
            else:
                base = aviso_sem_criterios(larg)
            W = max(topo.width, base.width)
            img = Image.new('RGB', (W, topo.height + 30 + base.height), 'white')
            img.paste(topo, (0, 0)); img.paste(base, (0, topo.height + 30))
            nome = f'{fase}-{n:02d}.webp'
            b = io.BytesIO(); img.save(b, 'WEBP', quality=62, method=6)
            open(os.path.join(destino, nome), 'wb').write(b.getvalue()); feitas += 1
            qid = f'disc-saocamilo{fase}-{n:02d}'; x = assuntos.get(qid, {})
            tudo.append({'id': qid, 'banca': 'São Camilo', 'ano': int(fase[:4]), 'fase': fase, 'num': f'{n:02d}', 'materia': x.get('m', ''), 'gab': '', 'nalts': 0, 'img': URL + nome, 'w': img.width, 'h': img.height,
                         'corte': topo.height + 15, 'enunciado': texto(s, ini, fim), 'coment': coment[:3500], 'tipo': 'disc', 'modo': 'objetivo', 'fonte': 'São Camilo (caderno oficial)', 'prev': ant, 'assunto': x.get('a', ''), 'assunto_local': '1'})
            ant = qid
        print(f'{fase}: {len(rq)} questões, {feitas} recortadas, critérios: {"sim (" + str(len(rc)) + ")" if dc else "não divulgados"}', flush=True)
    print('\nAVISOS:', *avisos or ['nenhum'], sep='\n  ')
    os.makedirs(os.path.join(SAIDA, 'pdfs'), exist_ok=True)
    json.dump(tudo, open(os.path.join(SAIDA, 'pdfs', 'lidas-disc-saocamilo.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    if gravar:
        faltam = [q['id'] for q in tudo if not q['assunto']]
        if faltam:
            raise SystemExit(f'{len(faltam)} questões sem assunto: não gravei.')
        f = os.path.join(SAIDA, 'objetivo-disc-saocamilo.json')
        velhas = [q for q in json.load(open(f, encoding='utf-8')) if q.get('fonte') == 'Objetivo']
        json.dump(velhas + tudo, open(f, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        print(f'gravado: {len(velhas)} do Objetivo + {len(tudo)} dos PDFs')

if __name__ == '__main__':
    principal('--gravar' in sys.argv)
