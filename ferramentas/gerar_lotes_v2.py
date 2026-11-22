"""Gera lotes de 10 questões (PNG + lista.json) em C:\\rotina-banco\\claude\\lotes\\Cnnnn para os agentes lerem com LEIA_LOTE.md.
Fontes, em ordem: 'texto-base' = candidatas-textos (lidas, mas reprovadas só por OCR e SEM o texto-base no texto) e 'nunca' = nunca lidas por nenhuma IA.
Uso: python -P gerar_lotes_v2.py QUANTOS_LOTES [texto-base|nunca]
"""
import glob, json, os, re, shutil, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, r'C:\rotina-banco\libs')
sys.stdout.reconfigure(encoding='utf-8')
from PIL import Image
import transcrever as T
import montar_texto_final as M
SAIDA = r'C:\rotina-banco'; LOTES = os.path.join(SAIDA, 'claude', 'lotes')
k = int(sys.argv[1]); fonte = sys.argv[2] if len(sys.argv) > 2 else 'texto-base'
B = M.banco()   # ja com a regra de 4 alternativas
ordem = ['ENEM', 'UNESP', 'Fuvest', 'Unicamp', 'Albert Einstein', 'Santa Casa', 'UNIFESP', 'FAMERP', 'FMABC', 'Famema', 'FMJ', 'Sirio', 'S\u00e3o Camilo', 'PUC-SP', 'FGV-SP', 'UFSCar', 'UFABC', 'FATEC', 'Insper', 'Mackenzie', 'ITA']
prio = lambda i: next((n for n, b in enumerate(ordem) if b.lower() in B[i]['banca'].lower()), 50)

def imagem(q):
    slug = T.PASTA_DA_BANCA.get(q['banca'], q['banca'].lower())
    for arq in (os.path.join(T.o.CACHE, slug, slug + str(q.get('fase') or ''), re.sub(r'[^\w.-]', '_', q['img'].split('/resolucao-comentada/')[-1])), T.caminho(q)):
        if os.path.exists(arq): return arq

feitos = set()   # ja em algum lote ou com saida do Claude nesta versao
for f in glob.glob(os.path.join(LOTES, 'C*', 'lista.json')): feitos |= {x['id'] for x in json.load(open(f, encoding='utf-8'))}
pulados = os.path.join(SAIDA, 'claude', 'v2-usados.json')
usados = set(json.load(open(pulados))) if os.path.exists(pulados) else set()
fin = {x['id'][3:] for x in json.load(open(os.path.join(SAIDA, 'transcrito-final.json'), encoding='utf-8'))}
if fonte == 'texto-base': ids = list(json.load(open(os.path.join(SAIDA, 'candidatos-textos.json'), encoding='utf-8')))
elif fonte == 'resto':   # tudo o que ainda esta em imagem e o Claude nunca leu (outra IA leu e a conferencia reprovou): ordem de prioridade, sem repetir lote
    mot = json.load(open(os.path.join(SAIDA, 'motivos-por-id.json'), encoding='utf-8'))
    FIG = ('"[figura]" no texto', 'alternativas repetidas', 'Haiku: "[figura]" no texto', 'Hydrogen: "[figura]" no texto', 'Hydrogen: alternativas repetidas', 'Claude: "[figura]" no texto')
    ids = sorted((i for i in B if not any(m in FIG or '[figura]' in m or 'repetidas' in m for m in mot.get(i, []))), key=prio)
else:
    tent = {x['id'][3:] for x in json.load(open(os.path.join(SAIDA, 'transcrito.json'), encoding='utf-8'))} | set(json.load(open(os.path.join(SAIDA, 'transcrito.json.falhas.json'), encoding='utf-8')))
    for pat in ('hydrogen/saida/H*.json', 'claude/saida/C*.json'):
        for f in glob.glob(os.path.join(SAIDA, pat)):
            try: tent |= {x['id'] for x in json.load(open(f, encoding='utf-8')) if x.get('id')}
            except Exception: pass
    ids = [i for i in B if i not in tent]
    ids.sort(key=prio, reverse=True) if fonte == 'nunca-fim' else ids.sort(key=prio)
ids = [i for i in ids if i in B and i not in fin and i not in usados and i not in feitos and imagem(B[i])]
if fonte == 'texto-base': ids.sort(key=lambda i: (prio(i), i))
num = max([int(re.search(r'C(\d+)', p).group(1)) for p in glob.glob(os.path.join(LOTES, 'C*'))] + [0])
novos = []
for j in range(k):
    grupo = ids[j * 10:(j + 1) * 10]
    if not grupo: break
    num += 1; nome = 'C%04d' % num; pasta = os.path.join(LOTES, nome); os.makedirs(pasta, exist_ok=True); lista = []
    for i in grupo:
        q = B[i]; arq = i[4:] + '.png'
        Image.open(imagem(q)).convert('RGB').save(os.path.join(pasta, arq), 'PNG')
        lista.append({'id': i, 'arquivo': arq, 'materia_caderno': q.get('materia', ''), 'tem_resolucao_na_imagem': True, 'nalts_esperado': int(q.get('nalts') or 5), 'gabarito_oficial': q.get('gab', '')})
    json.dump(lista, open(os.path.join(pasta, 'lista.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    novos += grupo; print(nome, len(grupo), B[grupo[0]]['banca'])
json.dump(sorted(usados | set(novos)), open(pulados, 'w'))
print('restam', len(ids) - len(novos), 'para lotes futuros')
