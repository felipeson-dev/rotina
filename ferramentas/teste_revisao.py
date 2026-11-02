"""Mede o Low como REVISOR do Flash Lite: monta um lote de 60 questões já lidas pelo Flash Lite (natureza e exatas), com erros plantados
em algumas, numa cópia. A lista dos erros plantados fica fora da pasta do Antigravity. Nada aqui mexe no banco.
Uso: python -P teste_revisao.py        (monta o lote R0001)
     python -P teste_revisao.py --medir (compara saida_revisao\\R0001.json com os erros plantados)
"""
import json, os, random, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import transcrever as T
from PIL import Image
from fila_antigravity import caminho
from preparar_antigravity import S, AG

PASTA = os.path.join(AG, 'revisao', 'R0001')
PLANTADOS = os.path.join(S, 'teste-plantados.json')   # fora de antigravity: o revisor não pode ver
SAIDA = os.path.join(AG, 'saida_revisao', 'R0001.json')
QUANTOS = {'Matemática': 20, 'Física': 20, 'Química': 10, 'Biologia': 10}
ASSUNTOS = {}

def troca_numero(txt, r):
    # muda um dígito de um número que esteja fora de comandos LaTeX; devolve None se não houver
    achados = [m for m in re.finditer(r'(?<![\\a-zA-Z{_^])\d+', txt)]
    if not achados:
        return None
    m = r.choice(achados)
    novo = str(int(m.group()) + r.randint(1, 3))
    return txt[:m.start()] + novo + txt[m.end():], m.group(), novo

def montar():
    r = random.Random(1101)
    tx = json.load(open(os.path.join(S, 'transcrito.json'), encoding='utf-8'))
    for q in tx:
        if q.get('assunto'):
            ASSUNTOS.setdefault(q['materia'], set()).add(q['assunto'])
    r.shuffle(tx)
    os.makedirs(PASTA, exist_ok=True)
    lista = []
    for mat, n in QUANTOS.items():
        pegos = 0
        for q in tx:
            if pegos == n:
                break
            if q.get('materia') != mat or not q.get('assunto'):
                continue
            arq = caminho(q, T.PASTA_DA_BANCA.get(q['banca'], q['banca'].lower()))
            if not os.path.exists(arq):
                continue
            nome = q['id'].replace('tx-obj-', '') + '.png'
            Image.open(arq).convert('RGB').save(os.path.join(PASTA, nome), 'PNG')
            lista.append({'id': q['id'][3:], 'arquivo': nome, 'materia': q['materia'], 'assunto': q['assunto'], 'gabarito': q['gab'],
                          'enunciado': q['enunciado'], 'alternativas': q['alts'], 'resolucao': q.get('coment', '')})
            pegos += 1
    r.shuffle(lista)
    plantados = []
    # 6 números trocados (3 no enunciado, 3 nas alternativas) e 3 temas errados
    for q in lista:
        tem = sum(p['tipo'] == 'numero_enunciado' for p in plantados)
        if tem < 3:
            x = troca_numero(q['enunciado'], r)
            if x:
                q['enunciado'] = x[0]; plantados.append({'id': q['id'], 'tipo': 'numero_enunciado', 'de': x[1], 'para': x[2]})
    usados = {p['id'] for p in plantados}
    for q in lista:
        if sum(p['tipo'] == 'numero_alternativa' for p in plantados) == 3:
            break
        if q['id'] in usados:
            continue
        a = q['alternativas'][r.randrange(len(q['alternativas']))]
        x = troca_numero(a['t'], r)
        if x:
            a['t'] = x[0]; usados.add(q['id']); plantados.append({'id': q['id'], 'tipo': 'numero_alternativa', 'de': x[1], 'para': x[2]})
    for q in lista:
        if sum(p['tipo'] == 'tema' for p in plantados) == 3:
            break
        if q['id'] in usados:
            continue
        outro = r.choice(sorted(ASSUNTOS[q['materia']] - {q['assunto']}))
        plantados.append({'id': q['id'], 'tipo': 'tema', 'de': q['assunto'], 'para': outro})
        q['assunto'] = outro; usados.add(q['id'])
    json.dump(lista, open(os.path.join(PASTA, 'lista.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    json.dump(plantados, open(PLANTADOS, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print(f'{len(lista)} questões em {PASTA}; {len(plantados)} erros plantados')

def medir():
    pl = json.load(open(PLANTADOS, encoding='utf-8'))
    ids_pl = {p['id'] for p in pl}
    ach = json.load(open(SAIDA, encoding='utf-8'))
    marcadas = {q['id']: q for q in ach if not q.get('ok')}
    pegos = [p for p in pl if p['id'] in marcadas]
    print(f'plantados: {len(pl)}; pegos: {len(pegos)}')
    for p in pl:
        print(' ', 'PEGOU ' if p['id'] in marcadas else 'PASSOU', p)
    outras = {k: v for k, v in marcadas.items() if k not in ids_pl}
    print(f'questões revisadas: {len(ach)}; apontadas fora dos plantados: {len(outras)}')
    for k, v in outras.items():
        print(' ', k, json.dumps(v, ensure_ascii=False)[:400])

if __name__ == '__main__':
    medir() if '--medir' in sys.argv else montar()
