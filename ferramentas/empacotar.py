"""Gera os pacotes para o iPad juntando as questões oficiais (objetivo-<banca>.json, modo imagem) com as já lidas pela IA
(transcrito.json, texto de verdade). Cada questão sai uma vez só, com o MESMO id da versão em imagem e "v": 2 quando está em texto:
o app troca a versão em imagem pela de texto ao importar de novo (e o histórico de acertos continua valendo).
Pode rodar quantas vezes quiser (por exemplo, a cada dia de transcrição): cada pacote novo melhora o anterior.
Uso: python empacotar.py
"""
import gzip, json, os, sys, time
SAIDA = r'C:\rotina-banco'
TRANSCRITO = sys.argv[1] if len(sys.argv) > 1 else os.path.join(SAIDA, 'transcrito.json')
GRUPOS = [  # mesmos grupos de oficiais.py
    ('6-oficiais-Fuvest-Unicamp-UNESP', ['fuvest', 'unicamp', 'unesp']),
    ('7-oficiais-Medicina-SP', ['unifesp', 'santacasa', 'alberteinstein', 'famerp', 'fmabc', 'famema', 'fmj', 'saocamilo', 'siriolibanes', 'unisa']),
    ('8-oficiais-outras-SP-e-exatas', ['pucsp', 'fgvsp', 'ita', 'fatec', 'ufscar', 'ufabc', 'insper', 'mackenzie']),
    ('9-oficiais-ENEM-com-resolucao', ['enem']),
]

GRUPOS_DISC = [
    ('D1-discursivas-Fuvest-Unicamp-UNESP', ['fuvest', 'unicamp', 'unesp']),
    ('D2-discursivas-Medicina-SP', ['unifesp', 'santacasa', 'alberteinstein', 'famerp', 'fmabc', 'famema', 'fmj', 'saocamilo', 'siriolibanes']),
]

def principal():
    tx = {x['id'][3:]: x for x in json.load(open(TRANSCRITO, encoding='utf-8'))} if os.path.exists(TRANSCRITO) else {}
    total_t = total_i = 0
    for nome, bancas in GRUPOS:
        orig = []
        for b in bancas:
            a = os.path.join(SAIDA, f'objetivo-{b}.json')
            if os.path.exists(a) and os.path.getsize(a) > 10:
                orig += json.load(open(a, encoding='utf-8'))
        if not orig:
            continue
        por_id = {r['id']: r for r in orig}

        def origem(i):
            # texto-base de um grupo ("leia o texto para as questões 06 a 09") fica na primeira do grupo: sobe enquanto a anterior também depende de outra
            vistos = set()
            while i in por_id and i not in vistos and tx.get(i, {}).get('dep') and por_id[i].get('prev') in por_id:
                vistos.add(i); i = por_id[i]['prev']
            return i
        saida, n_txt = [], 0
        for r in orig:
            t = tx.get(r['id'])
            if not t:
                saida.append({k: v for k, v in r.items() if k != 'assunto_local'}); continue                         # ainda não lida (ou não deu): fica no modo imagem
            q = {k: v for k, v in t.items() if k != 'dep'}
            q['id'] = r['id']; q['v'] = 2
            q['prev'] = origem(r['prev']) if r.get('prev') in por_id else ''
            # depende do texto de outra questão: com a anterior no pacote, o app mostra um botão para ler o texto dela
            q['dep'] = 1 if t.get('dep') and q['prev'] else 0
            q['fig'] = 1 if t.get('dep') and not q['prev'] else 0
            q['materia'] = t.get('materia') or r.get('materia') or ''
            q['assunto'] = t.get('assunto') or r.get('assunto') or ''
            saida.append(q); n_txt += 1
        p = os.path.join(SAIDA, 'para-o-ipad', nome + '.json.gz')
        tmp = p + '.tmp'
        with gzip.open(tmp, 'wt', encoding='utf-8', compresslevel=9) as f:
            json.dump(saida, f, ensure_ascii=False, separators=(',', ':'))
        os.replace(tmp, p)
        total_t += n_txt; total_i += len(saida) - n_txt
        print(f'{nome}: {len(saida)} questões · {n_txt} em texto · {len(saida) - n_txt} em imagem · {os.path.getsize(p) / 1e6:.1f} MB', flush=True)
    print(f'{time.strftime("%d/%m %H:%M")} total: {total_t} em texto, {total_i} em imagem', flush=True)
    # discursivas (imagem do enunciado + resolução do Objetivo como padrão de resposta)
    for nome, bancas in GRUPOS_DISC:
        lista = []
        for b in bancas:
            a = os.path.join(SAIDA, f'objetivo-disc-{b}.json')
            if os.path.exists(a) and os.path.getsize(a) > 10:
                lista += [{k: v for k, v in r.items() if k != 'assunto_local'} for r in json.load(open(a, encoding='utf-8'))]
        if not lista:
            continue
        p = os.path.join(SAIDA, 'para-o-ipad', nome + '.json.gz')
        with gzip.open(p + '.tmp', 'wt', encoding='utf-8', compresslevel=9) as f:
            json.dump(lista, f, ensure_ascii=False, separators=(',', ':'))
        os.replace(p + '.tmp', p)
        print(f'{nome}: {len(lista)} discursivas · {os.path.getsize(p) / 1e6:.1f} MB', flush=True)

if __name__ == '__main__':
    principal()
