"""Junta o texto lido por IA (Flash Lite em transcrito.json e Haiku da nuvem em nuvem\\transc_provas.json), passa cada questão pela conferência
automática contra a imagem (conferir_texto.py) e grava só as aprovadas em C:\\rotina-banco\\transcrito-final.json (formato do transcrito.json), pronto
para o empacotar.py. Quem reprova fica em imagem. Também grava texto-antes.json: os ids que já estavam em texto no site (as que reprovarem agora
voltam para imagem com "v" maior).
Uso: python -P montar_texto_final.py
"""
import glob, json, os, subprocess, sys
from collections import Counter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import conferir_texto as C
import re, difflib, unicodedata
from collections import defaultdict
import transcrever as T
from PIL import Image

sys.stdout.reconfigure(encoding='utf-8')
SAIDA = r'C:\rotina-banco'
NUVEM = os.path.join(SAIDA, 'nuvem', 'transc_provas.json')

# gabaritos investigados (claude/gabarito, certeza alta): 'ok' = o do banco está certo (libera a leitura de confiança baixa, que só estava baixa por a resolução impressa discordar);
# 'dif' = {id: letra certa} (o banco estava errado: corrige e libera)
_VER = os.path.join(SAIDA, 'gabaritos-verificados.json')
VER = json.load(open(_VER, encoding='utf-8')) if os.path.exists(_VER) else {'ok': [], 'dif': {}}
LIBERA = set(VER['ok']) | set(VER['dif'])

def banco():
    b = {}
    for a in glob.glob(os.path.join(SAIDA, 'objetivo-*.json')):
        if '-disc-' in a or 'amostra' in a or 'antes-pdf' in a: continue
        for q in json.load(open(a, encoding='utf-8')): b[q['id']] = q
    # prova com só 4 alternativas (a a d): em 20+ questões da mesma prova nenhuma tem gabarito E. O banco assume 5 e reprovava o texto correto.
    from collections import defaultdict
    por = defaultdict(list)
    for q in b.values(): por[(q.get('banca'), q.get('fase'))].append(q)
    for lista in por.values():
        if len(lista) >= 20 and not any(str(q.get('gab', '')).upper() == 'E' for q in lista):
            for q in lista: q['nalts'] = '4'
    for i, g in VER['dif'].items():
        if i in b: b[i]['gab'] = g
    return b

def do_haiku(h, q):
    alts = [{'l': 'ABCDE'[k], 't': str(t).strip()} for k, t in enumerate((h.get('alternativas') or [])[:5])]
    return {'id': 'tx-' + q['id'], 'banca': q['banca'], 'ano': q['ano'], 'num': q['num'], 'fase': q.get('fase', ''), 'materia': q.get('materia', ''), 'assunto': q.get('assunto', ''),
            'enunciado': str(h.get('enunciado') or '').strip(), 'alts': alts, 'gab': str(h.get('gabarito') or '').strip().upper()[:1] or q['gab'], 'coment': str(h.get('resolucao') or '').strip(),
            'imagens': [], 'dep': 1 if h.get('depende_de_outro_texto') else 0, 'prev': q.get('prev') or '', 'img': q['img'], 'tipo': 'real', 'fonte': 'Objetivo (lido por IA)'}

def figuras_de(h, q):
    """Recorta como imagem as figuras que o leitor marcou (box_2d), igual ao transcrever.py. Sem figura marcada ou sem a imagem em cache: []."""
    if not h.get('figuras'): return []
    slug = T.PASTA_DA_BANCA.get(q['banca'], q['banca'].lower())
    for arq in (os.path.join(T.o.CACHE, slug, slug + str(q.get('fase') or ''), re.sub(r'[^\w.-]', '_', q['img'].split('/resolucao-comentada/')[-1])), T.caminho(q), C.caminho(q)):
        if os.path.exists(arq):
            try: return T.recortar_figuras(Image.open(arq).convert('RGB'), h, q, arq)
            except Exception: return []
    return []

RE_FIG = re.compile(r'\W*\[?\s*(figura|gr[aá]fico|imagem|desenho|esquema|diagrama)[^\]]*\]?\W*$', re.I)

def recorte_alts(q):
    """Alternativas que são figuras: recorta da imagem da prova o bloco das alternativas (do rótulo "a)" até o fim da questão, que o OCR localiza) para ele aparecer como figura da questão."""
    arq = C.caminho(q); info = C.ocr_de(q) or {}
    if not os.path.exists(arq) or not info.get('linhas'): return None
    ln = [l for l in info['linhas'] if l.get('t')]
    corte = q.get('corte') or info.get('h')
    lab = lambda l, c: re.fullmatch(r'\W*' + c + r'\W{0,2}', l['t'].strip(), re.I) is not None
    ca = [l for l in ln if lab(l, 'a') and l['y'] < corte]
    ok = [l for l in ca if any((lab(m, 'b') or lab(m, 'c') or lab(m, 'd')) and l['y'] - 25 <= m['y'] <= l['y'] + max(450, 0.6 * corte) for m in ln)]
    ya = None
    if ok:
        ya = min(l['y'] for l in ok) if len(ok) == 1 else max(l['y'] for l in ok if l['y'] < corte - 20) if any(l['y'] < corte - 20 for l in ok) else None
    if ya is None:   # o OCR não achou o "a)": o bloco das alternativas começa depois da última linha de texto corrido do enunciado
        longas = [l for l in ln if len(l['t'].strip()) >= 28 and l['y'] + l['h'] < corte - 60]
        if not longas: return None
        ya = max(l['y'] + l['h'] for l in longas) + 6
        if corte - ya < 70 or (corte - ya) > 0.85 * corte: return None
    im = Image.open(arq).convert('RGB'); W, H = im.size
    topo, base = max(0, int(ya - 8)), min(int(corte), H)
    if base - topo < 40 or (base - topo) > 0.85 * H: return None
    return T.img_uri(im.crop((0, topo, W, base))), topo, H

def alts_figura(x, q, h=None):
    """Se todas as alternativas lidas são "[figura]" (ou vazias), a questão fica em texto + imagem do bloco das alternativas + botões só com a letra.
    As figuras que o leitor marcou DENTRO do bloco das alternativas viram duplicata dele: saem."""
    ts = [str(a.get('t', '')).strip() for a in x.get('alts') or []]
    if len(ts) < 2 or not all((not t) or RE_FIG.match(t) for t in ts): return x
    r = recorte_alts(q)
    if not r: return x
    rec, topo, H = r
    x = dict(x); x['alts'] = [dict(a, t='') for a in x['alts']]; x['alts_fig'] = True
    if h is not None and h.get('figuras'):
        def acima(f):
            c = T.caixa(f.get('box_2d') if isinstance(f, dict) else None)
            return bool(c) and c[0] / 1000 * H < topo - 5
        x['imagens'] = figuras_de(dict(h, figuras=[f for f in h['figuras'] if acima(f)]), q)
    x['imagens'] = list(x.get('imagens') or []) + [rec]
    return x

def principal():
    B = banco(); aprovadas, motivos, origem = {}, Counter(), Counter()
    cov = {}; leit = defaultdict(list)   # leit[id] = todas as leituras (aprovadas ou não), para o consenso
    for x in json.load(open(os.path.join(SAIDA, 'transcrito.json'), encoding='utf-8')):
        i = x['id'][3:]
        if i not in B: continue
        ok, mot, y = C.conferir(B[i], x); leit[i].append(('Flash Lite', ok, mot, y))
        if ok: aprovadas[i] = y; cov[i] = y['_cob'] or 0; origem['Flash Lite aprovadas'] += 1
        else: origem['Flash Lite reprovadas'] += 1; motivos.update(m.split(' (')[0] for m in mot)
    seg = os.path.join(SAIDA, 'segunda-leitura.json')   # 2ª leitura (outro modelo) das questões que só o OCR reprovou: entra no consenso
    if os.path.exists(seg):
        for x in json.load(open(seg, encoding='utf-8')):
            i = x['id'][3:]
            if i not in B: continue
            ok, mot, y = C.conferir(B[i], x); leit[i].append(('Segunda leitura', ok, mot, y))
            if ok:
                origem['Segunda leitura aprovadas'] += 1
                if i not in aprovadas or (y['_cob'] or 0) > cov.get(i, 0): aprovadas[i] = y; cov[i] = y['_cob'] or 0
            else: origem['Segunda leitura reprovadas'] += 1
    # outras leituras por IA, no mesmo formato (enunciado/alternativas/gabarito/resolucao...): Haiku da nuvem, Hydrogen (hydrogen/saida) e Claude (claude/saida)
    fontes = []
    if os.path.exists(NUVEM): fontes.append(('Haiku', json.load(open(NUVEM, encoding='utf-8'))))
    for rot, padrao in (('Hydrogen', os.path.join(SAIDA, 'hydrogen', 'saida', 'H*.json')), ('Claude', os.path.join(SAIDA, 'claude', 'saida', 'C*.json'))):
        lista = []
        for f in sorted(glob.glob(padrao)):
            try: lista += json.load(open(f, encoding='utf-8'))
            except Exception: pass
        fontes.append((rot, lista))
    for rot, lista in fontes:
        for h in lista:
            i = h.get('id')
            if i not in B or h.get('erro') or not h.get('enunciado'): continue
            if str(h.get('confianca', '')).lower() == 'baixa' and i not in LIBERA: continue   # o próprio leitor disse que não tem certeza: fica em imagem
            x = do_haiku(h, B[i]);
            if i in VER['dif']: x['gab'] = B[i]['gab']   # gabarito corrigido depois de investigado
            if i in LIBERA and x.get('gab') != B[i]['gab']: x['gab'] = B[i]['gab']   # a leitura trazia a letra antiga ou a da resolução impressa
            x['imagens'] = figuras_de(h, B[i]); x = alts_figura(x, B[i], h); ok, mot, y = C.conferir(B[i], x); leit[i].append((rot, ok, mot, y))
            if ok:
                origem[rot + ' aprovadas'] += 1
                if i not in aprovadas or (y['_cob'] or 0) > cov.get(i, 0): aprovadas[i] = y; cov[i] = y['_cob'] or 0
            else: origem[rot + ' reprovadas'] += 1; motivos.update(rot + ': ' + m.split(' (')[0] for m in mot)
    # CONSENSO: o OCR do cache às vezes falta ou vem corrompido e a conferência reprova texto certo ("texto não confere", "sem OCR", "alternativa que não está na imagem").
    # Se DUAS leituras de leitores diferentes reprovaram só por isso e concordam entre si (enunciado, alternativas e gabarito), vale como conferida.
    # As demais checagens (gabarito oficial, nº de alternativas, figura, "[figura]", $ sem par, alternativas repetidas) continuam bloqueando.
    consenso_ids = []
    OCR_MOT = ('texto não confere com a imagem', 'sem OCR para conferir', 'alternativa que não está na imagem')
    def norma(t): return re.sub(r'[^a-z0-9]', '', unicodedata.normalize('NFD', str(t or '').lower()))
    def igual(a, b, lim):
        a, b = norma(a), norma(b)
        return bool(a) and bool(b) and difflib.SequenceMatcher(None, a, b, autojunk=False).ratio() >= lim
    for i, L in leit.items():
        if i in aprovadas or len(L) < 2: continue
        boas = [r for r in L if not r[1] and r[2] and all(m.split(' (')[0] in OCR_MOT for m in r[2])]
        achou = False
        for a in range(len(boas)):
            for b in range(a + 1, len(boas)):
                if achou or boas[a][0] == boas[b][0]: continue
                ya, yb = boas[a][3], boas[b][3]
                if ya['gab'] == yb['gab'] and len(ya['alts']) == len(yb['alts']) and igual(ya['enunciado'], yb['enunciado'], .97)                         and all(igual(p['t'], q['t'], .95) for p, q in zip(ya['alts'], yb['alts'])):
                    aprovadas[i] = ya if len(ya['enunciado']) >= len(yb['enunciado']) else yb; origem['Consenso de 2 leituras'] += 1; achou = True; consenso_ids.append(i)
    cand2 = []; textos_cand = {}
    for i, L in leit.items():
        if i in aprovadas: continue
        so_ocr = [r for r in L if not r[1] and r[2] and all(m.split(' (')[0] in OCR_MOT for m in r[2])]
        if so_ocr and len({r[0] for r in L}) < 2: cand2.append(i); textos_cand[i] = {k: v for k, v in so_ocr[0][3].items() if not k.startswith('_')}
    # motivos de reprovação de TODAS as leituras de cada questão (gerar_lotes_v2 'resto' pula as de alternativas em figura: ficam em imagem de verdade)
    json.dump({i: sorted({m.split(' (')[0] for r in L if not r[1] for m in r[2]}) for i, L in leit.items() if i not in aprovadas},
              open(os.path.join(SAIDA, 'motivos-por-id.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    json.dump(cand2, open(os.path.join(SAIDA, 'candidatos-segunda.json'), 'w', encoding='utf-8'))
    json.dump(textos_cand, open(os.path.join(SAIDA, 'candidatos-textos.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    # revisor (agente que comparou a imagem com o texto e deu OK): vale como conferida
    ver = os.path.join(SAIDA, 'verificadas.json')
    if os.path.exists(ver):
        for i, y in json.load(open(ver, encoding='utf-8')).items():   # {id: texto} (o texto fica guardado aqui porque a candidata some da lista depois de aprovada)
            if i not in aprovadas and i in B: aprovadas[i] = y; origem['Verificadas por revisor'] += 1
    print('candidatas a 2ª leitura:', len(cand2))
    json.dump(consenso_ids, open(os.path.join(SAIDA, 'consenso-ids.json'), 'w', encoding='utf-8'))
    final = []
    for i, y in aprovadas.items():
        y = {k: v for k, v in y.items() if not k.startswith('_')}; y['id'] = 'tx-' + i; final.append(y)
    json.dump(final, open(os.path.join(SAIDA, 'transcrito-final.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    print(dict(origem)); print('motivos:', dict(motivos.most_common(14)))
    print('texto final:', len(final), 'questões de', len(B), '(%.0f%%)' % (100 * len(final) / len(B)))
    print('por matéria:', dict(Counter(B[i['id'][3:]].get('materia') for i in final).most_common(13)))

if __name__ == '__main__':
    principal()
