"""2ª leitura por outro modelo (Hydrogen, depois 3.8-flash) das questões que só o OCR reprovou (candidatos-segunda.json, feito por montar_texto_final.py).
Se a 2ª leitura concordar com a 1ª, o consenso (montar_texto_final.py) aprova a questão. Não gasta tokens do Claude. Pode rodar por dias: retoma.
Evita o 3.6-flash e o flash-lite de propósito: são os modelos que a IA do app da Uany usa. Chaves em GEMINI_KEYS (nunca gravadas em arquivo).
Uso: python -P ler_segunda.py [--max N]
"""
import json, os, sys, tempfile, time
os.environ['LIMITE_DIA'] = '1000000'   # a cota do dia de cada modelo quem diz e o Google (429); o contador local e so do flash-lite
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, r'C:\rotina-banco\libs')
sys.stdout.reconfigure(encoding='utf-8')
import transcrever as T
import glob
from concurrent.futures import ThreadPoolExecutor, as_completed
T.USO_ARQ = os.path.join(tempfile.gettempdir(), 'uso-segunda.json')
T.MODELOS[:] = ['gemini-4-hydrogen', 'gemini-3.8-flash']
SAIDA = r'C:\rotina-banco'; ARQ = os.path.join(SAIDA, 'segunda-leitura.json')
maxn = int(sys.argv[sys.argv.index('--max') + 1]) if '--max' in sys.argv else 10 ** 9

B = {}
for a in glob.glob(os.path.join(SAIDA, 'objetivo-*.json')):
    if '-disc-' in a or 'amostra' in a or 'antes-pdf' in a: continue
    for q in json.load(open(a, encoding='utf-8')): B[q['id']] = q
cand = json.load(open(os.path.join(SAIDA, 'candidatos-segunda.json'), encoding='utf-8'))
out = json.load(open(ARQ, encoding='utf-8')) if os.path.exists(ARQ) else []
feitas = {x['id'][3:] for x in out}
tentadas_arq = ARQ + '.tentadas.json'
tentadas = set(json.load(open(tentadas_arq, encoding='utf-8'))) if os.path.exists(tentadas_arq) else set()
fila = [i for i in cand if i in B and i not in feitas and i not in tentadas][:maxn]
T.carregar_uso()
print(f'{time.strftime("%d/%m %H:%M")} {len(fila)} questões para a 2ª leitura ({len(out)} já feitas)', flush=True)

def gravar():
    json.dump(out, open(ARQ + '.tmp', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':')); os.replace(ARQ + '.tmp', ARQ)
    json.dump(sorted(tentadas), open(tentadas_arq, 'w', encoding='utf-8'))

ok = n = 0
with ThreadPoolExecutor(int(os.environ.get('THREADS', 3))) as ex:
    for fut in as_completed({ex.submit(T.processa, B[i]): i for i in fila}):
        r = fut.result(); n += 1
        if r: out.append(r); ok += 1
        if n % 10 == 0: gravar(); print(f'{time.strftime("%d/%m %H:%M")}  {n}/{len(fila)} (lidas {ok})', flush=True)
        # as que a IA não conseguiu ler não são tentadas de novo
    # so as falhas DEFINITIVAS (ex.: recitation, gabarito diferente) nao sao tentadas de novo; erro de cota/IA tenta no proximo dia
    tentadas.update(i for i in fila if T.FALHAS.get(i, {}).get('def'))
gravar()
print(f'{time.strftime("%d/%m %H:%M")} FIM: {ok} lidas de {len(fila)}', flush=True)
