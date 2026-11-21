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
import re
import transcrever as T
from PIL import Image

sys.stdout.reconfigure(encoding='utf-8')
SAIDA = r'C:\rotina-banco'
NUVEM = os.path.join(SAIDA, 'nuvem', 'transc_provas.json')

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
    for arq in (os.path.join(T.o.CACHE, slug, slug + str(q.get('fase') or ''), re.sub(r'[^\w.-]', '_', q['img'].split('/resolucao-comentada/')[-1])), T.caminho(q)):
        if os.path.exists(arq):
            try: return T.recortar_figuras(Image.open(arq).convert('RGB'), h, q, arq)
            except Exception: return []
    return []

def principal():
    B = banco(); aprovadas, motivos, origem = {}, Counter(), Counter()
    cov = {}
    for x in json.load(open(os.path.join(SAIDA, 'transcrito.json'), encoding='utf-8')):
        i = x['id'][3:]
        if i not in B: continue
        ok, mot, y = C.conferir(B[i], x)
        if ok: aprovadas[i] = y; cov[i] = y['_cob'] or 0; origem['Flash Lite aprovadas'] += 1
        else: origem['Flash Lite reprovadas'] += 1; motivos.update(m.split(' (')[0] for m in mot)
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
            x = do_haiku(h, B[i]); x['imagens'] = figuras_de(h, B[i]); ok, mot, y = C.conferir(B[i], x)
            if ok:
                origem[rot + ' aprovadas'] += 1
                if i not in aprovadas or (y['_cob'] or 0) > cov.get(i, 0): aprovadas[i] = y; cov[i] = y['_cob'] or 0
            else: origem[rot + ' reprovadas'] += 1; motivos.update(rot + ': ' + m.split(' (')[0] for m in mot)
    final = []
    for i, y in aprovadas.items():
        y = {k: v for k, v in y.items() if not k.startswith('_')}; y['id'] = 'tx-' + i; final.append(y)
    json.dump(final, open(os.path.join(SAIDA, 'transcrito-final.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    print(dict(origem)); print('motivos:', dict(motivos.most_common(14)))
    print('texto final:', len(final), 'questões de', len(B), '(%.0f%%)' % (100 * len(final) / len(B)))
    print('por matéria:', dict(Counter(B[i['id'][3:]].get('materia') for i in final).most_common(13)))

if __name__ == '__main__':
    principal()
