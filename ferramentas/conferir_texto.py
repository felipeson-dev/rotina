"""Conferência automática do texto lido pela IA contra a própria imagem da prova (OCR do Windows, que já está em cache): pega texto trocado de
questão, texto cortado e o quadro "Note e adote" perdido. Também conserta o caractere de controle que come comandos LaTeX (\\text virou TAB + "ext")
e checa gabarito, nº de alternativas, "[figura]", alternativas repetidas e $ sem par. Não gasta cota de IA.
Uso como módulo: conferir(q_banco, texto) -> (ok, motivos, texto_consertado)   (texto no formato de transcrito.json)
"""
import json, os, re, sys
sys.path.insert(0, r'C:\rotina\ferramentas'); sys.path.insert(0, r'C:\rotina-banco\libs')
import objetivo as O

PASTA_DA_BANCA = {v: k for k, v in O.NOME.items()}
_OCR = {}
CTRL = {'\t': 't', '\f': 'f', '\b': 'b', '\r': 'r', '\v': 'v', '\a': 'a'}
MIN_COBERTURA = 0.65   # texto trocado de questão dá ~0,1; figuras e tabelas têm texto no OCR que não vai para o enunciado, então não dá para exigir mais

def caminho(q):
    banca = PASTA_DA_BANCA.get(q['banca'], q['banca'].lower())
    pasta = q['id'].split('-', 1)[1].rsplit('-', 1)[0]
    return os.path.join(O.CACHE, banca, pasta, re.sub(r'[^\w.-]', '_', q['img'].split('/resolucao-comentada/')[-1]))

def ocr_de(q):
    arq = caminho(q); pasta = os.path.dirname(arq)
    if pasta not in _OCR:
        try: _OCR[pasta] = json.load(open(os.path.join(pasta, '_ocr.json'), encoding='utf-8-sig'))
        except Exception: _OCR[pasta] = {}
    return _OCR[pasta].get(os.path.basename(arq))

def tem_figura(q, info):
    """True se o enunciado da imagem tem um desenho (figura, gráfico, esquema) que o OCR não leu como texto: faixa de pelo menos 40 px com tinta fora das linhas lidas."""
    try:
        from PIL import Image
        im = Image.open(caminho(q)).convert('L')
    except Exception:
        return None
    corte = int(q.get('corte') or im.height)
    im = im.crop((0, 0, im.width, min(corte, im.height)))
    escuro = im.point(lambda p: 0 if p < 200 else 255).resize((1, im.height), Image.BOX)   # a marca d'água do Objetivo é clara (cinza ~220): não conta
    tinta = [v < 250 for v in escuro.getdata()]
    coberto = [False] * im.height
    for l in info.get('linhas') or []:
        if len((l.get('t') or '').strip()) < 18:
            continue          # rótulo curto (eixo, legenda) não é texto corrido: é parte do desenho (a tabela também cai aqui, de propósito)
        for y in range(max(0, int(l['y']) - 2), min(im.height, int(l['y'] + l['h']) + 3)):
            coberto[y] = True
    corrida = maior = 0
    for y in range(im.height):
        if tinta[y] and not coberto[y]:
            corrida += 1; maior = max(maior, corrida)
        else:
            corrida = 0
    return maior >= 40

def palavras(s):
    s = re.sub(r'\\[a-zA-Z]+', ' ', s)                       # comandos LaTeX não aparecem no OCR
    return {w for w in re.findall(r'[^\W\d_]{5,}', s.lower())}

# Comandos do KaTeX 0.16 (o do app) que começam com "n" ou "t": qualquer outro "\n..." ou "\t..." é quebra de linha/tab que o leitor gravou LITERAL (strings cruas do Python)
VALIDOS_N = {'nabla', 'ncong', 'ne', 'nearrow', 'neg', 'neq', 'newline', 'nexists', 'ngeq', 'ngtr', 'ni', 'nleftarrow', 'nleftrightarrow', 'nleq', 'nless', 'nmid', 'not', 'notin',
             'nparallel', 'nprec', 'nrightarrow', 'nsim', 'nsubseteq', 'nsucc', 'nsupseteq', 'nu', 'nVDash', 'nvDash', 'nvdash', 'nwarrow', 'nRightarrow', 'nLeftarrow', 'nLeftrightarrow', 'nshortmid'}
VALIDOS_T = {'tan', 'tanh', 'tau', 'tbinom', 'text', 'textbf', 'textit', 'textrm', 'textsf', 'texttt', 'textnormal', 'textup', 'textmd', 'textstyle', 'tfrac', 'theta', 'therefore',
             'thickapprox', 'thicksim', 'thinspace', 'tilde', 'times', 'tiny', 'to', 'top', 'triangle', 'triangledown', 'triangleleft', 'triangleright', 'tag'}
# comandos que o KaTeX do app NÃO entende (vermelho na tela); o que não tem troca fica como motivo de reprovação
BLOQUEADOS = {'CD', 'cline', 'multicolumn', 'abc', 'jpg', 'put', 'Considerando', 'a', 'b', 'n', 't'}
TROCAS = [(r'\\textdollar(?![a-zA-Z])', r'\\char36'), (r'\\sen(?![a-zA-Z])', r'\\operatorname{sen}'), (r'\\textquotedblleft', '“'), (r'\\textquotedblright', '”'), (r'\\textquotedblideal', '”'),
          (r'\\textsuperscript\{', '^{'), (r'\\vector(?![a-zA-Z])', r'\\vec'), (r'\\male(?![a-zA-Z])', '♂'), (r'\\female(?![a-zA-Z])', '♀'), ('&#36;', '$\\\\char36$'), ('&dollar;', '$\\\\char36$')]

def conserta(s):
    if not s:
        return s
    s = ''.join(('\\' + CTRL[c]) if c in CTRL else c for c in s)
    s = re.sub(r'\\n([A-Za-z]*)', lambda m: m.group(0) if 'n' + m.group(1) in VALIDOS_N else '\n' + m.group(1), s)
    s = re.sub(r'\\t([A-Za-z]*)', lambda m: m.group(0) if 't' + m.group(1) in VALIDOS_T else ' ' + m.group(1), s)
    for a, b in TROCAS:
        s = re.sub(a, b, s)
    # cifrão de moeda ("R$ 5", "US$ 3", também "R\$"): vira $\char36$ (o KaTeX desenha "$" e os "$" ficam em número par); fora de fórmula só
    s = re.sub(r'\b(R|US)\\?\$(?=\s?\d)', lambda m: m.group(1) + '$\\char36$', s)
    s = s.replace('\\$', '$\\char36$')   # "\$" escapado pelo leitor: o app mostraria a barra
    if s.count('$') % 2:   # ainda ímpar: "$39 billion" solto (inglês); só mexe se sobrar $ colado em número
        s = re.sub(r'(?<![\w$\\])\$(?=\d)', '$\\\\char36$', s)
    return s

def latex_ruim(s):
    return sorted({c for c in re.findall(r'\\([A-Za-z]+)', s) if c in BLOQUEADOS})

def cobertura(q, enun, alts):
    info = ocr_de(q)
    pdf = bool(re.search(r'caderno oficial|simulado oficial', q.get('fonte') or '')) and len(q.get('enunciado') or '') > 80
    if pdf and not (info and info.get('linhas')):
        # provas lidas de PDF (São Camilo, FMABC, Fuvest 2027, simulados): o texto do próprio PDF faz o papel do OCR, e é exato
        ocr = palavras(q['enunciado']); ls = [{'t': q['enunciado']}]
    elif not info or not info.get('linhas'):
        return None, False, 0
    else:
        corte = q.get('corte') or info.get('h', 10 ** 6)
        ls = [l for l in info['linhas'] if l.get('t') and l['y'] + l['h'] / 2 < corte]
        ocr = palavras(' '.join(l['t'] for l in ls))
    if len(ocr) < 6:
        return None, False, 0
    tx = palavras(enun + ' ' + ' '.join(alts))
    nota_no_ocr = any(re.search(r'Note\s+e\s+adote', l['t'], re.I) for l in ls)
    nota_no_tx = bool(re.search(r'Note\s+e\s+adote', enun, re.I))
    # alternativa que descreve figura (a IA inventa a descrição): as palavras dela não estão na imagem
    inventadas = 0
    for a in alts:
        w = palavras(a)
        if len(w) >= 4 and len(w & ocr) / len(w) < 0.34:   # descrição inventada some quase toda; OCR ruim só perde palavras soltas
            inventadas += 1
    return len(ocr & tx) / len(ocr), nota_no_ocr and not nota_no_tx, inventadas

def conferir(q, x):
    """q = ficha do banco; x = texto lido {enunciado, alts:[{l,t}], gab, ...}. Devolve (ok, motivos, x consertado)."""
    x = dict(x)
    enun = conserta(x.get('enunciado') or '')
    alts = [dict(a, t=conserta(a['t'])) for a in x.get('alts') or []]
    x['enunciado'] = enun; x['alts'] = alts; x['coment'] = conserta(x.get('coment') or '')
    mot = []
    textos = [a['t'] for a in alts]
    todo = enun + ' ' + ' '.join(textos)
    if x.get('gab') and q.get('gab') and x['gab'] != q['gab']: mot.append('gabarito diferente do oficial')
    n = int(q.get('nalts') or 5)
    if len(alts) != n or not all(t.strip() for t in textos): mot.append('alternativas incompletas')
    if re.search(r'\[figura|\[imagem|\[gráfico', todo, re.I): mot.append('"[figura]" no texto')
    if len({re.sub(r'\s+', '', t) for t in textos}) < len(textos): mot.append('alternativas repetidas')   # sem minúscula: genótipos e fórmulas (AA x aa) diferem só pela caixa
    if re.search(r'(?i)^\s*(gr[aá]fico|figura|imagem)\s*[A-E]?\s*\.?\s*$', '\n'.join(textos), re.M): mot.append('alternativa só com rótulo')
    if enun.count('$') % 2 or any(t.count('$') % 2 for t in textos): mot.append('$ sem par')
    if re.search(r'\\n(?![a-zA-Z])', todo): mot.append('"\\n" literal')
    ruim = latex_ruim(todo + ' ' + x['coment'])
    if ruim: mot.append('LaTeX que o app não entende: ' + ','.join(ruim))
    if not enun.strip(): mot.append('enunciado vazio')
    cov, sem_nota, inventadas = cobertura(q, enun, textos)
    if cov is None: mot.append('sem OCR para conferir')
    else:
        if cov < MIN_COBERTURA: mot.append(f'texto não confere com a imagem ({cov:.2f})')
        if sem_nota: mot.append('faltou o quadro "Note e adote"')
        if inventadas: mot.append('alternativa que não está na imagem')
        if not x.get('imagens') and ocr_de(q) and tem_figura(q, ocr_de(q)):
            mot.append('tem figura que o texto não traz')
    x['_cob'] = None if cov is None else round(cov, 3)
    return (not mot), mot, x
