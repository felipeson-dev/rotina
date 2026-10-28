"""Conserta os arquivos já baixados: provas de 2 dias/blocos tinham questões com o MESMO id (UNESP, ITA, FGV) e uma sumia ao importar.
Dá ids únicos (o 1º mantém o id antigo), refaz a "questão anterior" e reassocia as questões já lidas pela IA (transcrito.json)
pela imagem, que é única. Pode rodar quantas vezes quiser. Uso: python corrigir_ids.py
"""
import glob, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import objetivo as o

SAIDA = r'C:\rotina-banco'
novo_id = {}                               # imagem -> id certo
for arq in sorted(glob.glob(os.path.join(SAIDA, 'objetivo-*.json'))):
    if 'amostra' in arq:
        continue
    d = json.load(open(arq, encoding='utf-8'))
    antes = len({r['id'] for r in d})
    o.ids_unicos(d)
    for r in d:
        novo_id[r['img']] = (r['id'], r['prev'])
    json.dump(d, open(arq, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    if antes != len(d):
        print(f'{os.path.basename(arq)}: {len(d)} questões, ids únicos {antes} -> {len({r["id"] for r in d})}')

tx_arq = os.path.join(SAIDA, 'transcrito.json')
if os.path.exists(tx_arq):
    tx = json.load(open(tx_arq, encoding='utf-8')); mudou = 0
    for x in tx:
        i = novo_id.get(x.get('img'))
        if i and ('tx-' + i[0] != x['id'] or x.get('prev') != (i[1] or '')):
            x['id'] = 'tx-' + i[0]; x['prev'] = i[1] or ''; mudou += 1
    json.dump(tx, open(tx_arq, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'transcrito.json: {len(tx)} questões, {mudou} reassociadas')
