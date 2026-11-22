"""Gera lotes MENORES (5 questões) com o que o Claude ainda não leu: (a) ids de lotes cujo agente foi barrado antes de gravar e (b) provas lidas de PDF (imagem na pasta do site).
Uso: python -P gerar_lotes_faltantes.py QUANTOS_LOTES [tamanho=5]
"""
import glob, json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, r'C:\rotina-banco\libs')
sys.stdout.reconfigure(encoding='utf-8')
from PIL import Image
import conferir_texto as C
import montar_texto_final as M
SAIDA = r'C:\rotina-banco'; LOTES = os.path.join(SAIDA, 'claude', 'lotes')
k = int(sys.argv[1]); tam = int(sys.argv[2]) if len(sys.argv) > 2 else 5
B = M.banco()
fin = {x['id'][3:] for x in json.load(open(os.path.join(SAIDA, 'transcrito-final.json'), encoding='utf-8'))}
lei = set()
for f in glob.glob(os.path.join(SAIDA, 'claude', 'saida', 'C*.json')):
    try: lei |= {h['id'] for h in json.load(open(f, encoding='utf-8'))}
    except Exception: pass
usados_f = os.path.join(SAIDA, 'claude', 'v3-usados.json')
usados = set(json.load(open(usados_f))) if os.path.exists(usados_f) else set()
ids = [i for i in B if i not in fin and i not in lei and i not in usados and os.path.exists(C.caminho(B[i]))]
ids.sort(key=lambda i: (B[i]['banca'], B[i].get('fase') or '', i))
num = max([int(re.search(r'C(\d+)', p).group(1)) for p in glob.glob(os.path.join(LOTES, 'C*'))] + [0])
novos = []
for j in range(k):
    grupo = ids[j * tam:(j + 1) * tam]
    if not grupo: break
    num += 1; nome = 'C%04d' % num; pasta = os.path.join(LOTES, nome); os.makedirs(pasta, exist_ok=True); lista = []
    for i in grupo:
        q = B[i]; arq = i[4:] + '.png'
        Image.open(C.caminho(q)).convert('RGB').save(os.path.join(pasta, arq), 'PNG')
        lista.append({'id': i, 'arquivo': arq, 'materia_caderno': q.get('materia', ''), 'tem_resolucao_na_imagem': bool(q.get('corte') and q.get('h') and int(q['corte']) < int(q['h'])), 'nalts_esperado': int(q.get('nalts') or 5), 'gabarito_oficial': q.get('gab', '')})
    json.dump(lista, open(os.path.join(pasta, 'lista.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    novos += grupo; print(nome, len(grupo), B[grupo[0]]['banca'])
json.dump(sorted(usados | set(novos)), open(usados_f, 'w'))
print('restam', len(ids) - len(novos), 'para lotes futuros')
