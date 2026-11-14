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
    for i, (origem, x) in novas.items():
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
    json.dump(list(finais.values()), open(os.path.join(SAIDA, 'transcrito-final2.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    print(dict(c)); print('motivos de reprovação:', dict(motivos.most_common(10)))
    print(f'texto antigo {len(antigo)} -> final {len(finais)} | releituras que bateram com o texto antigo: {confirmadas} | que divergiram: {divergentes}')

if __name__ == '__main__':
    principal()
