"""Algumas imagens do Objetivo trazem a letra da resposta ao lado do número, acima de um traço. Acha esse traço e grava em
C:\\rotina-banco\\topos.json a altura onde a questão começa ({url da imagem: topo}); o empacotar.py passa isso ao app, que mostra a imagem só dali para baixo.
Só corta se acima do traço houver apenas o cabeçalho (linhas curtas), para nunca tirar texto da questão.
Uso: python -P esconder_resposta.py
"""
import glob, json, os, re, sys
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import objetivo as O

S = r'C:\rotina-banco'
SAIDA = os.path.join(S, 'topos.json')

def traco(arq):
    im = Image.open(arq).convert('L'); W, H = im.size
    alt = min(int(W * .42), H)
    px = im.crop((0, 0, W, alt)).load()
    for y in range(alt):
        if sum(1 for x in range(W) if px[x, y] < 110) >= W * .6:
            return y
    return None

def cabecalho_ok(q, y):
    # o OCR não pode ter lido texto corrido acima do traço
    for l in q.get('linhas') or []:
        if l.get('y', 9999) + l.get('h', 0) / 2 < y and len(l.get('t', '')) > 18:
            return False
    return True

def um(q):
    try:
        y = traco(q['_arq'])
        if y is None or y < 8 or y + 4 >= int(q['corte']) or not cabecalho_ok(q, y):
            return None
        return q['img'], y + 3
    except Exception:
        return None

def principal():
    Q = []
    for pasta in (S, os.path.join(S, 'novas')):
        for a in glob.glob(os.path.join(pasta, 'objetivo-*.json')):
            b = os.path.basename(a)[9:-5]
            if b.startswith('disc-') or 'amostra' in b or 'antes' in b:
                continue
            ocrs = {}
            for q in json.load(open(a, encoding='utf-8')):
                if q.get('fonte') != 'Objetivo':
                    continue
                d = os.path.join(O.CACHE, b, b + str(q.get('fase') or ''))
                q['_arq'] = os.path.join(d, re.sub(r'[^\w.-]', '_', q['img'].split('/resolucao-comentada/')[-1]))
                if d not in ocrs:
                    try: ocrs[d] = json.load(open(os.path.join(d, '_ocr.json'), encoding='utf-8-sig'))
                    except Exception: ocrs[d] = {}
                q['linhas'] = (ocrs[d].get(os.path.basename(q['_arq'])) or {}).get('linhas') or q.get('linhas') or []
                Q.append(q)
    with ThreadPoolExecutor(8) as ex:
        r = [x for x in ex.map(um, Q) if x]
    json.dump(dict(r), open(SAIDA, 'w', encoding='utf-8'), separators=(',', ':'))
    print(f'{len(Q)} imagens, traço achado em {len(r)}')

if __name__ == '__main__':
    principal()
