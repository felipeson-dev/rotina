"""Junta a leitura do Gemini (hydrogen\\saida\\H*.json) e a do Claude (claude\\saida\\C*.json) ao texto já aprovado (transcrito-final.json): converte para o formato do
transcrito.json, recorta as figuras, passa tudo pela conferência (conferir_texto.py) e grava transcrito-final2.json, que é o que o empacotar.py deve receber.
A leitura nova (Hydrogen/Claude, conferida) vale mais do que a antiga (Flash Lite/Haiku). Quem reprova na conferência não entra: fica como estava.
Uso: python -P juntar_saidas.py
"""
import glob, json, os, re, sys, difflib
from collections import Counter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, r'C:\rotina-banco\libs'); sys.path.insert(0, r'C:\rotina-banco\hydrogen')
sys.dont_write_bytecode = True
os.environ.setdefault('GEMINI_KEYS', 'x')   # o transcrever.py só precisa da variável para importar; nada é enviado
sys.stdout.reconfigure(encoding='utf-8')
import conferir_texto as C
import transcrever as T
import montar_fila as M
from PIL import Image

SAIDA = r'C:\rotina-banco'
DOLAR = '$\\text{\\textdollar}$'   # "&#36;" aparece literal no app; isto o KaTeX desenha como $

def limpa(s):
    s = str(s or '').replace('&#36;', DOLAR).replace('&dollar;', DOLAR)
    return s

def banco():
    b = {}
    for a in glob.glob(os.path.join(SAIDA, 'objetivo-*.json')):
        if '-disc-' in a or 'amostra' in a or 'antes-pdf' in a: continue
        for q in json.load(open(a, encoding='utf-8')): b[q['id']] = q
    return b

def temas():
    t = {}
    for l in open(os.path.join(SAIDA, 'hydrogen', 'temas.txt'), encoding='utf-8'):
        if ':' in l:
            m, r = l.split(':', 1); t[m.strip()] = {x.strip() for x in r.split(' | ')} | {'Outro'}
    return t

def principal():
    B, TM = banco(), temas()
    antigo = {x['id'][3:]: x for x in json.load(open(os.path.join(SAIDA, 'transcrito-final.json'), encoding='utf-8'))}
    novas = {}
    for origem, padrao in (('Gemini', r'hydrogen\saida\H*.json'), ('Claude', r'claude\saida\C*.json')):
        for f in sorted(glob.glob(os.path.join(SAIDA, padrao))):
            try:
                for x in json.load(open(f, encoding='utf-8')):
                    if x.get('id') and not x.get('erro') and x.get('enunciado'): novas[x['id']] = (origem, x)
            except Exception as e:
                print('arquivo ilegível', f, e)
    c = Counter(); motivos = Counter(); finais = dict(antigo); confirmadas = divergentes = 0
    # questões cujo enunciado depende de um trecho SUBLINHADO na prova (o sublinhado não vai para o texto): ficam como imagem
    arq_ex = os.path.join(SAIDA, 'claude', 'excluir_sublinhado.json')
    excluir = set(json.load(open(arq_ex, encoding='utf-8'))) if os.path.exists(arq_ex) else set()
    for i, (origem, x) in novas.items():
        if i in excluir: c['sublinhado (fica imagem)'] += 1; continue
        q = B.get(i)
        if not q: c['id fora do banco'] += 1; continue
        alts = [{'l': 'ABCDE'[k], 't': limpa(a).strip()} for k, a in enumerate((x.get('alternativas') or [])[:5])]
        enun = limpa(x['enunciado']).strip(); coment = limpa(x.get('resolucao')).strip()
        qq = dict(q)
        if len(alts) == 4 and 'einstein' in str(q.get('banca', '')).lower(): qq['nalts'] = 4   # Einstein 2016-2018 tem 4 alternativas; o banco dizia 5
        p = M.local_do_png(q)
        imagens = []
        if x.get('figuras') and p:
            try:
                im = Image.open(p).convert('RGB')
                imagens = T.recortar_figuras(im, {'figuras': x['figuras']}, q, p)
            except Exception as e:
                motivos['erro ao recortar figura'] += 1
        lido = {'enunciado': enun, 'alts': alts, 'gab': (x.get('gabarito') or '').strip().upper()[:1], 'coment': coment, 'imagens': imagens or (['f'] * len(x.get('figuras') or []))}
        ok, mot, y = C.conferir(qq, lido)
        if x.get('figuras') and not imagens: ok = False; mot.append('figura declarada mas não recortada')
        if not ok:
            c[origem + ' reprovadas'] += 1; motivos.update(re.sub(r' \(.*', '', m) for m in mot); continue
        mat, ass = x.get('materia'), x.get('assunto')
        if mat not in TM or ass not in TM.get(mat, set()): mat, ass = q.get('materia', ''), q.get('assunto', '')
        novo = {'id': 'tx-' + i, 'banca': q['banca'], 'ano': q['ano'], 'num': q['num'], 'fase': q.get('fase', ''), 'materia': mat, 'assunto': ass, 'enunciado': y['enunciado'],
                'alts': y['alts'], 'gab': q['gab'], 'coment': y['coment'], 'imagens': imagens, 'dep': 1 if x.get('depende_de_outro_texto') else 0, 'prev': q.get('prev') or '', 'img': q['img'],
                'tipo': 'real', 'fonte': 'Objetivo (lido por IA)'}
        if i in antigo:
            a = antigo[i]; sa = ' '.join(a['enunciado'].split()) + ' ' + ' '.join(t['t'] for t in a['alts']); sn = ' '.join(novo['enunciado'].split()) + ' ' + ' '.join(t['t'] for t in novo['alts'])
            if difflib.SequenceMatcher(None, sa, sn, autojunk=False).ratio() >= 0.95: confirmadas += 1
            else: divergentes += 1
        finais[i] = novo; c[origem + ' aprovadas'] += 1
    # o texto antigo (Flash Lite/Haiku) também passa pela limpeza e pela conferência de novo: quem reprova agora volta para imagem
    reprov_antigo = 0
    for i in [k for k in finais if k not in novas]:
        q = B.get(i)
        if not q: continue
        a = finais[i]
        ok, mot, y = C.conferir(q, {'enunciado': a['enunciado'], 'alts': a['alts'], 'gab': a.get('gab'), 'coment': a.get('coment') or '', 'imagens': a.get('imagens') or []})
        if not ok and any(m.startswith(('LaTeX', '"\\n"', '$ sem par')) for m in mot):
            del finais[i]; reprov_antigo += 1; motivos.update('antigo: ' + re.sub(r' \(.*', '', m) for m in mot); continue
        a.update({'enunciado': y['enunciado'], 'alts': y['alts'], 'coment': y['coment']})
    c['texto antigo que voltou para imagem'] = reprov_antigo
    # --- auditoria de 15/11 (leitores Sonnet comparando com a imagem) ---
    # (1) nas leituras divergentes, vale a que o auditor achou mais fiel
    for f in glob.glob(os.path.join(SAIDA, 'auditoria', 'saida', 'D*.json')):
        for r in json.load(open(f, encoding='utf-8')):
            i = r['id'][4:] if r['id'].startswith('obj-') and r['id'] not in antigo else r['id']
            if r.get('melhor') == 'A' and r['id'] in antigo and r['id'] in finais:
                finais[r['id']] = antigo[r['id']]; c['auditoria: voltou p/ leitura antiga'] += 1
    # (2) correções pontuais confirmadas (id -> [(trecho errado, trecho certo)])
    PATCHES = {
        'obj-fuvest2022_1fase-68': [('tornando a estrutura mais preenchida e o vidro mais flexível', 'tornando a estrutura menos preenchida e o vidro mais flexível')],
        'obj-unicamp2018_1fase-37': [('sofred', 'sofrem')],
        'obj-unicamp2018_1fase-25': [('Considering o texto', 'Considerando o texto')],
        'obj-saocamilo2020_1-06': [('havia acolhida', 'havia acolhido')],
        'obj-enem2022_1dia-042': [('ser ter', 'se ter')],
        # segunda auditoria (15/11)
        'obj-enem2024_1dia-095': [('Los últimos dias del sitio', 'Los últimos días del sitio')],
        'obj-fuvest2016_1fase-84': [('coincidiu com o transição', 'coincidiu com a transição')],
        'obj-unesp2025_1fase-43': [('Européia', 'Europeia')],
        'obj-unicamp2015_1fase-28': [('gurpos', 'grupos')],
        'obj-enem2021_2_2dia-146': [('a partir das medidas de uma folha A0 são 595 mm', 'a partir das medidas de uma folha A0. As medidas de uma folha A0 são 595 mm')],
    }
    # frase final que faltava no enunciado (id -> trecho a acrescentar, se ainda não estiver lá)
    ACRESCENTAR = {'obj-famerp2018-43': 'Os resultados mostrados no gráfico permitem concluir que:'}
    for i, frase in ACRESCENTAR.items():
        a = finais.get(i)
        if a and frase not in a['enunciado']:
            a['enunciado'] = a['enunciado'].rstrip() + '\n\n' + frase; c['frase final acrescentada'] += 1
    for i, trocas in PATCHES.items():
        a = finais.get(i)
        if not a: continue
        for velho, novo_t in trocas:
            n = 0
            for campo in ('enunciado', 'coment'):
                if velho in (a.get(campo) or ''): a[campo] = a[campo].replace(velho, novo_t); n += 1
            for alt in a['alts']:
                if velho in alt['t']: alt['t'] = alt['t'].replace(velho, novo_t); n += 1
            c['correcao pontual aplicada' if n else 'correcao pontual SEM efeito'] += 1
    # (3) sem confirmação do auditor ou com id ambíguo: volta para imagem
    for f in ('excluir_enem_repetidos.json',):
        p = os.path.join(SAIDA, 'claude', f)
        if os.path.exists(p):
            for i in json.load(open(p, encoding='utf-8')):
                if finais.pop(i, None): c['id repetido do ENEM: texto retirado'] += 1
    for i in ('obj-unesp2011_2-87', 'obj-fuvest2022_1fase-68x'):
        if finais.pop(i, None): c['numeros incertos: volta p/ imagem'] += 1
    for i in excluir:
        finais.pop(i, None)
    # (4) LaTeX cru: o app só desenha fórmula entre $...$ (a tela mostraria "-\frac{6}{7}" literal)
    CMD = re.compile(r'\\(?!char36)[A-Za-z]+')
    DUPLA = re.compile(r'\\\\([A-Za-z]{2,})')
    fora = lambda s: re.sub(r'\$[^$\n]+?\$', ' ', re.sub(r'\$\$.*?\$\$', ' ', s or '', flags=re.S))
    for i in list(finais):
        a = finais[i]
        a['enunciado'] = DUPLA.sub(r'\\\1', a['enunciado'] or ''); a['coment'] = DUPLA.sub(r'\\\1', a.get('coment') or '')
        for alt in a['alts']:
            alt['t'] = DUPLA.sub(r'\\\1', alt['t'])
            if '$' not in alt['t'] and CMD.search(alt['t']):
                alt['t'] = '$' + alt['t'].strip() + '$'; c['alternativa com LaTeX cru embrulhada em $'] += 1
        if CMD.search(fora(a['enunciado'])) or any(CMD.search(fora(alt['t'])) for alt in a['alts']):
            del finais[i]; c['LaTeX cru na pergunta: volta p/ imagem'] += 1; continue
        if CMD.search(fora(a['coment'])):
            a['coment'] = ''; c['comentario com LaTeX cru: removido'] += 1
    json.dump(list(finais.values()), open(os.path.join(SAIDA, 'transcrito-final2.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    print(dict(c)); print('motivos de reprovação:', dict(motivos.most_common(10)))
    print(f'texto antigo {len(antigo)} -> final {len(finais)} | releituras que bateram com o texto antigo: {confirmadas} | que divergiram: {divergentes}')

if __name__ == '__main__':
    principal()
