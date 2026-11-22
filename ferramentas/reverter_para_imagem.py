"""Devolve para IMAGEM as questões que estão publicadas em texto e que caíram nas regras de exclusão (publicar_novos.EXCLUIR, `inventada()`
e C:\\rotina-banco\\reverter-imagem.json, alimentado pelo aplicar_feedback.py). Gera um pacote R<data>-volta-imagem (v maior) e publica.
Uso: python -P reverter_para_imagem.py [--gravar]     (sem --gravar só conta)
"""
import gzip, hashlib, json, os, subprocess, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, r'C:\rotina-banco\libs')
sys.stdout.reconfigure(encoding='utf-8')
import publicar_novos as P
W = r'C:\rotina\pacotes'; REPO = r'C:\rotina'
man = json.load(open(f'{W}/manifesto.json', encoding='utf-8'))
def carregar(n):
    d = json.load(gzip.open(f'{W}/{n}', 'rt', encoding='utf-8')); return d if isinstance(d, list) else d.get('questoes', [])
img, txt = {}, {}
for arq in man['arquivos']:
    if arq.startswith('D'): continue
    for q in carregar(arq):
        if q.get('modo') == 'objetivo': img.setdefault(q['id'], q)      # versão em imagem (dos pacotes grandes)
        else: txt[q['id']] = q                                         # versão em texto (os pacotes mais novos vencem)
ruins = [i for i, q in txt.items() if (P.inventada(q) or i in P.EXCLUIR) and i in img]
print('publicadas em texto que devem voltar para imagem:', len(ruins))
if '--gravar' not in sys.argv or not ruins: sys.exit(0)
vmax = max((txt[i].get('v') or 0) for i in ruins) + 1
lista = [dict(img[i], v=vmax) for i in ruins]
nome = time.strftime('R%Y%m%d%H%M') + '-volta-imagem.json.gz'
with gzip.open(f'{W}/{nome}', 'wt', encoding='utf-8', compresslevel=9) as g: json.dump(lista, g, ensure_ascii=False, separators=(',', ':'))
agora = int(time.time())
man['arquivos'].append(nome); man['por'][nome] = agora; man['v'] = agora
man['hash'][nome] = hashlib.sha1(gzip.open(f'{W}/{nome}').read()).hexdigest()[:16]; man['texto'] = max(0, man.get('texto', 0) - len(lista))
json.dump(man, open(f'{W}/manifesto.json', 'w', encoding='utf-8'), ensure_ascii=False)
git = lambda *a: subprocess.run(['git', '-C', REPO, *a], capture_output=True, text=True, encoding='utf-8')
git('add', 'pacotes/' + nome, 'pacotes/manifesto.json')
git('commit', '-m', f'Pacote {nome[:-8]} (volta {len(lista)} questoes para imagem)\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>')
print(nome, len(lista), 'v=', vmax, '| push:', 'ok' if git('push', 'origin', 'main').returncode == 0 else 'FALHOU')
