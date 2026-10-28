"""Baixa as bancas que ficaram de fora da primeira lista (links em maiúsculas no site, ex.: FMABC/FMABC2018.aspx, ou página
que não respondeu na hora): FMABC, FAMERP e Mackenzie. Tenta de novo quando o site do Objetivo não responde.
Uso: python baixar_faltantes.py [banca ...]
"""
import json, os, re, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import objetivo as o

LISTA = os.path.join(o.SAIDA, 'cache', 'objetivo_paginas.json')

def paginas(banca):
    for tentativa in range(8):
        html = o.get(o.BASE + f'{banca}.aspx', tentativas=2)
        if html:
            # o link pode vir em maiúsculas e com ou sem o caminho completo; o site aceita o nome em minúsculas
            return sorted({p.lower() for p in re.findall(rf'{banca}/({banca}[0-9a-z_\-]+)\.aspx', html, re.I)})
        print(f'  {banca}: site não respondeu, tentando de novo em {60 * (tentativa + 1)} s', flush=True)
        time.sleep(60 * (tentativa + 1))
    return []

if __name__ == '__main__':
    bancas = sys.argv[1:] or ['fmabc', 'famerp', 'mackenzie']
    lista = json.load(open(LISTA, encoding='utf-8'))
    for b in bancas:
        ps = paginas(b)
        print(f'{b}: {len(ps)} provas na lista', flush=True)
        if not ps:
            continue
        lista[b] = ps
        json.dump(lista, open(LISTA, 'w', encoding='utf-8'), indent=1)
        o.processar(b, None, 2010)
    print('PRONTO', flush=True)
