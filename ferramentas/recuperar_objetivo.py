"""Recupera questões do Objetivo que a importação (objetivo.py) deixou de fora: compara a lista de questões de cada prova no site com as imagens
que já estão em objetivo-<banca>.json e refaz o mesmo recorte (OCR em cache) só das que faltam.
Uso: python -P recuperar_objetivo.py --listar     (grava C:\\rotina-banco\\recuperadas.json, sem tema, e mostra o que achou)
     python -P recuperar_objetivo.py --gravar     (precisa de C:\\rotina-banco\\assuntos-recuperadas.json {id: {m, a}}; encaixa as fichas no objetivo-<banca>.json)
"""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import objetivo as O

sys.stdout.reconfigure(encoding='utf-8')
BANCAS = ['fuvest', 'unicamp', 'alberteinstein', 'fmabc', 'famerp', 'santacasa', 'unifesp']
RECUP = os.path.join(O.SAIDA, 'recuperadas.json')
ASSUNTOS = os.path.join(O.SAIDA, 'assuntos-recuperadas.json')

def listar():
    paginas = json.load(open(os.path.join(O.SAIDA, 'cache', 'objetivo_paginas.json')))
    novas, falhas = [], []
    for banca in BANCAS:
        arq = os.path.join(O.SAIDA, f'objetivo-{banca}.json')
        atual = json.load(open(arq, encoding='utf-8'))
        imgs = {q['img'] for q in atual if q.get('fonte') == 'Objetivo'}
        ids = {q['id'] for q in atual}
        for pg in paginas.get(banca, []):
            ano = int(re.search(r'(\d{4})', pg).group(1))
            if ano < 2010:
                continue   # 2006-2009 são as "antigas" do reforço (novas/), com fluxo próprio
            lista =[e for e in O.entradas(banca, pg) if e[2] not in imgs]
            if not lista:
                continue
            pasta = os.path.join(O.CACHE, banca, pg)
            arqs = O.baixar(lista, pasta)
            o = O.ocr(pasta, [os.path.basename(a) for a in arqs])
            for (q, alt, url, mat), a in zip(lista, arqs):
                info = o.get(os.path.basename(a))
                c = info and O.cortar(info, False)
                qid = f'obj-{pg}-{q}'
                if not c or qid in ids:
                    falhas.append((qid, 'sem corte' if not c else 'id já usado por outra imagem')); continue
                corte, n, texto = c
                padrao = 4 if banca == 'unicamp' else 5
                n = max(n if n > padrao else padrao, 'ABCDE'.index(alt) + 1)
                novas.append({'id': qid, 'banca': O.NOME.get(banca, banca), 'ano': ano, 'fase': pg.replace(banca, ''), 'num': q, 'materia': mat, 'gab': alt, 'nalts': n, 'img': url,
                              'w': info['w'], 'h': info['h'], 'corte': corte, 'enunciado': texto, 'tipo': 'real', 'modo': 'objetivo', 'fonte': 'Objetivo', 'prev': None, '_arq': banca})
    json.dump(novas, open(RECUP, 'w', encoding='utf-8'), ensure_ascii=False)
    print(f'{len(novas)} questões recuperáveis; {len(falhas)} que continuam sem corte/id: {falhas[:10]}')
    from collections import Counter
    print(Counter((q['_arq'], q['fase']) for q in novas))

def gravar():
    novas = json.load(open(RECUP, encoding='utf-8'))
    ass = json.load(open(ASSUNTOS, encoding='utf-8'))
    faltam = [q['id'] for q in novas if q['id'] not in ass]
    if faltam:
        raise SystemExit(f'{len(faltam)} sem tema, não gravei: {faltam[:5]}')
    for banca in sorted({q['_arq'] for q in novas}):
        arq = os.path.join(O.SAIDA, f'objetivo-{banca}.json')
        L = json.load(open(arq, encoding='utf-8'))
        for q in (x for x in novas if x['_arq'] == banca):
            q = {k: v for k, v in q.items() if k != '_arq'}
            q['materia'], q['assunto'] = ass[q['id']]['m'], ass[q['id']]['a']
            num = int(re.sub(r'\D', '', str(q['num'])) or 0)
            mesma = [i for i, r in enumerate(L) if r.get('fase') == q['fase'] and r.get('fonte') == 'Objetivo']
            antes = [i for i in mesma if int(re.sub(r'\D', '', str(L[i]['num'])) or 0) < num]
            pos = (antes[-1] + 1) if antes else (mesma[0] if mesma else len(L))
            q['prev'] = L[pos - 1]['id'] if antes else None
            L.insert(pos, q)
            if pos + 1 < len(L) and L[pos + 1].get('fase') == q['fase']:
                L[pos + 1]['prev'] = q['id']
        json.dump(L, open(arq, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        print(f'{banca}: +{sum(1 for x in novas if x["_arq"] == banca)} (agora {len(L)})')

if __name__ == '__main__':
    gravar() if '--gravar' in sys.argv else listar()
