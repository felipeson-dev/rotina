"""Provas de antes de 2010 no Objetivo: baixa as imagens, lê com o OCR e grava em C:\\rotina-banco\\novas\\objetivo-<banca>.json, FORA do banco.
Só entram no app depois de avaliadas (assunto e se está desatualizada). Pode rodar de novo: o que já baixou fica no cache.
Uso: python -P baixar_antigas.py unesp unifesp fuvest ufscar pucsp mackenzie
"""
import json, os, re, sys
import objetivo as O

NOVAS = os.path.join(O.SAIDA, 'novas')

def principal(bancas):
    os.makedirs(NOVAS, exist_ok=True)
    paginas = json.load(open(os.path.join(O.SAIDA, 'cache', 'objetivo_paginas.json')))
    for b in bancas:
        out, falhas = [], 0
        for pg in paginas.get(b, []):
            m = re.search(r'(\d{4})', pg)
            if not m or int(m.group(1)) >= 2010:
                continue
            lista = O.entradas(b, pg)
            if not lista:
                continue
            pasta = os.path.join(O.CACHE, b, pg)
            arqs = O.baixar(lista, pasta)
            o = O.ocr(pasta, [os.path.basename(a) for a in arqs])
            ant = None
            for (q, alt, url, mat), arq in zip(lista, arqs):
                info = o.get(os.path.basename(arq))
                c = info and O.cortar(info)
                if not c:
                    falhas += 1
                    continue
                corte, n, texto = c
                n = max(n if n > 5 else 5, 'ABCDE'.index(alt) + 1)
                out.append({'id': f'obj-{pg}-{q}', 'banca': O.NOME.get(b, b), 'ano': int(m.group(1)), 'fase': pg.replace(b, ''), 'num': q, 'materia': mat, 'gab': alt, 'nalts': n,
                            'img': url, 'w': info['w'], 'h': info['h'], 'corte': corte, 'enunciado': texto, 'linhas': info.get('linhas') or [], 'tipo': 'real', 'modo': 'objetivo', 'fonte': 'Objetivo', 'prev': ant})
                ant = out[-1]['id']
            print(f'  {pg}: {len(lista)} questões, total {len(out)}, falhas {falhas}', flush=True)
        O.ids_unicos(out)
        json.dump(out, open(os.path.join(NOVAS, f'objetivo-{b}.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        print(f'>> {b}: {len(out)} questões (falhas de recorte: {falhas})', flush=True)
    print('PRONTO', flush=True)

if __name__ == '__main__':
    principal(sys.argv[1:])
