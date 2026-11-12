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

sys.stdout.reconfigure(encoding='utf-8')
SAIDA = r'C:\rotina-banco'
NUVEM = os.path.join(SAIDA, 'nuvem', 'transc_provas.json')

def banco():
    b = {}
    for a in glob.glob(os.path.join(SAIDA, 'objetivo-*.json')):
        if '-disc-' in a or 'amostra' in a or 'antes-pdf' in a: continue
        for q in json.load(open(a, encoding='utf-8')): b[q['id']] = q
    return b

def do_haiku(h, q):
    alts = [{'l': 'ABCDE'[k], 't': str(t).strip()} for k, t in enumerate((h.get('alternativas') or [])[:5])]
    return {'id': 'tx-' + q['id'], 'banca': q['banca'], 'ano': q['ano'], 'num': q['num'], 'fase': q.get('fase', ''), 'materia': q.get('materia', ''), 'assunto': q.get('assunto', ''),
            'enunciado': str(h.get('enunciado') or '').strip(), 'alts': alts, 'gab': str(h.get('gabarito') or '').strip().upper()[:1] or q['gab'], 'coment': str(h.get('resolucao') or '').strip(),
            'imagens': [], 'dep': 1 if h.get('depende_de_outro_texto') else 0, 'prev': q.get('prev') or '', 'img': q['img'], 'tipo': 'real', 'fonte': 'Objetivo (lido por IA)'}

def principal():
    B = banco(); aprovadas, motivos, origem = {}, Counter(), Counter()
    cov = {}
    for x in json.load(open(os.path.join(SAIDA, 'transcrito.json'), encoding='utf-8')):
        i = x['id'][3:]
        if i not in B: continue
        ok, mot, y = C.conferir(B[i], x)
        if ok: aprovadas[i] = y; cov[i] = y['_cob'] or 0; origem['Flash Lite aprovadas'] += 1
        else: origem['Flash Lite reprovadas'] += 1; motivos.update(m.split(' (')[0] for m in mot)
    if os.path.exists(NUVEM):
        for h in json.load(open(NUVEM, encoding='utf-8')):
            i = h['id']
            if i not in B: continue
            x = do_haiku(h, B[i]); ok, mot, y = C.conferir(B[i], x)
            if ok:
                origem['Haiku aprovadas'] += 1
                if i not in aprovadas or (y['_cob'] or 0) > cov.get(i, 0): aprovadas[i] = y; cov[i] = y['_cob'] or 0
            else: origem['Haiku reprovadas'] += 1; motivos.update('Haiku: ' + m.split(' (')[0] for m in mot)
    final = []
    for i, y in aprovadas.items():
        y = {k: v for k, v in y.items() if not k.startswith('_')}; y['id'] = 'tx-' + i; final.append(y)
    json.dump(final, open(os.path.join(SAIDA, 'transcrito-final.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    print(dict(origem)); print('motivos:', dict(motivos.most_common(14)))
    print('texto final:', len(final), 'questões de', len(B), '(%.0f%%)' % (100 * len(final) / len(B)))
    print('por matéria:', dict(Counter(B[i['id'][3:]].get('materia') for i in final).most_common(13)))

if __name__ == '__main__':
    principal()
