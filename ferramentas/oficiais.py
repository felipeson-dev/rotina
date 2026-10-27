"""Roda tudo sozinho: baixa as questões oficiais (Objetivo) de várias bancas, classifica a matéria com a IA e gera os pacotes
para o iPad em C:\\rotina-banco\\para-o-ipad. Pode parar e rodar de novo: o que já foi baixado fica no cache.
Uso: set GEMINI_KEYS=chave1,chave2  e  python oficiais.py
"""
import gzip, json, os, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.argv = [sys.argv[0]]
import objetivo as o

SAIDA = r'C:\rotina-banco'
GRUPOS = [  # (nome do pacote, bancas, fase)
    ('6-oficiais-Fuvest-Unicamp-UNESP', [('fuvest', '1fase'), ('unicamp', '1fase'), ('unesp', None)]),
    ('7-oficiais-Medicina-SP', [('unifesp', None), ('santacasa', None), ('alberteinstein', None), ('famema', None), ('fmj', None), ('saocamilo', None), ('siriolibanes', None), ('unisa', None)]),
    ('8-oficiais-outras-SP-e-exatas', [('pucsp', None), ('fgvsp', '1fase'), ('ita', None), ('fatec', None), ('ufscar', None), ('ufabc', None), ('insper', None), ('mackenzie', None)]),
    ('9-oficiais-ENEM-com-resolucao', [('enem', None)]),
]

def log(*a):
    print(time.strftime('%H:%M:%S'), *a, flush=True)

def roda(item):
    banca, fase = item
    arq = os.path.join(SAIDA, f'objetivo-{banca}.json')
    if os.path.exists(arq) and os.path.getsize(arq) > 100:
        log('já existe', banca); return arq
    try:
        o.processar(banca, fase, 2010)   # só provas de 2010 em diante: o estilo de antes de 2010 é bem diferente
    except Exception as e:
        log('!! falhou', banca, repr(e)[:200])
    return arq

for nome, bancas in GRUPOS:
    log('== grupo', nome)
    with ThreadPoolExecutor(3) as ex:
        arqs = [a for a in ex.map(roda, bancas) if os.path.exists(a)]
    if os.environ.get('GEMINI_KEYS'):
        subprocess.run([sys.executable, '-I', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'classificar.py'), *arqs])
    tudo = []
    for a in arqs:
        tudo += json.load(open(a, encoding='utf-8'))
    os.makedirs(os.path.join(SAIDA, 'para-o-ipad'), exist_ok=True)
    p = os.path.join(SAIDA, 'para-o-ipad', nome + '.json.gz')
    with gzip.open(p, 'wt', encoding='utf-8', compresslevel=9) as f:
        json.dump(tudo, f, ensure_ascii=False, separators=(',', ':'))
    log(f'>> pacote {nome}: {len(tudo)} questões, {os.path.getsize(p) / 1e6:.1f} MB')
log('PRONTO')
