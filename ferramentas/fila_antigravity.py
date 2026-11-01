"""Monta os lotes de 60 questões para o Antigravity em C:\\rotina-banco\\antigravity\\lotes\\Lnnnn (PNG + lista.json).
Ordem: 1) natureza e exatas de SP + ENEM ainda sem texto (incluindo as que o flash-lite recusou); 2) provas antigas de C:\\rotina-banco\\novas.
Nada aqui mexe no banco. Pode rodar de novo: não refaz lote que já existe.
Uso: python -P fila_antigravity.py
"""
import json, os, re, sys
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import transcrever as T
from PIL import Image
from preparar_antigravity import S, AG, SP_ENEM, NAT

TAM = 60
ORDEM_NOVAS = ['fuvest', 'unesp', 'unifesp', 'ufscar', 'pucsp', 'mackenzie']

def caminho(q, banca):
    # provas de 2 dias têm id com o nome da pasta da imagem (ids_unicos): o caminho vem da banca + fase, não do id
    return os.path.join(T.o.CACHE, banca, banca + str(q.get('fase') or ''), re.sub(r'[^\w.-]', '_', q['img'].split('/resolucao-comentada/')[-1]))

def carregar(pasta, bancas):
    out, faltou = [], 0
    for b in bancas:
        a = os.path.join(pasta, f'objetivo-{b}.json')
        if os.path.exists(a):
            for q in json.load(open(a, encoding='utf-8')):
                if not str(q.get('fonte', 'Objetivo')).startswith('Objetivo'):
                    continue
                q['_arq'] = caminho(q, b)
                if os.path.exists(q['_arq']):
                    out.append(q)
                else:
                    faltou += 1
    print(f'{pasta}: {len(out)} com imagem, {faltou} sem imagem no cache')
    return out

def grava(item):
    q, destino = item
    if not os.path.exists(destino):
        Image.open(q['_arq']).convert('RGB').save(destino, 'PNG')

def principal():
    tx = {x['id'][3:] for x in json.load(open(os.path.join(S, 'transcrito.json'), encoding='utf-8'))}
    atuais = [q for q in carregar(S, SP_ENEM) if q.get('materia') in NAT and q['id'] not in tx]
    antigas = carregar(os.path.join(S, 'novas'), ORDEM_NOVAS)
    fila = atuais + antigas
    trabalhos = []
    raiz = os.path.join(AG, 'lotes')
    for n in range(0, len(fila), TAM):
        nome = f'L{n // TAM + 1:04d}'
        pasta = os.path.join(raiz, nome)
        os.makedirs(pasta, exist_ok=True)
        lista = []
        for q in fila[n:n + TAM]:
            arq = q['id'].replace('obj-', '') + '.png'
            lista.append({'id': q['id'], 'arquivo': arq, 'materia_caderno': q.get('materia') or ''})
            trabalhos.append((q, os.path.join(pasta, arq)))
        json.dump(lista, open(os.path.join(pasta, 'lista.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    with ThreadPoolExecutor(8) as ex:
        list(ex.map(grava, trabalhos))
    print(f'{len(fila)} questões em {(len(fila) + TAM - 1) // TAM} lotes ({len(atuais)} atuais de natureza e exatas, depois {len(antigas)} antigas)')

if __name__ == '__main__':
    principal()
