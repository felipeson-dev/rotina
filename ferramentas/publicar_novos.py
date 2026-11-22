"""Publica no site SO o que mudou de imagem para texto, num pacote pequeno (os pacotes grandes nao sao regenerados: o iPad nao baixa ~110 MB de novo).
Passos: montar_texto_final.py (junta todas as leituras, confere contra a imagem, consenso de 2 leituras) -> empacotar.py numa pasta temporaria
-> pega as questoes que no site estao em imagem e agora tem texto aprovado -> pacote T<data>-texto-novo.json.gz (v maior troca a imagem pelo texto, mesmo id)
-> manifesto -> git commit + push.
Uso: python -P publicar_novos.py [--seco] [--min N]      (--seco: so conta, nao grava nem publica; --min: minimo de questoes novas para publicar, padrao 40)
"""
import gzip, hashlib, json, os, subprocess, sys, tempfile, time, shutil
sys.stdout.reconfigure(encoding='utf-8')
AQUI = os.path.dirname(os.path.abspath(__file__)); W = r'C:\rotina\pacotes'; REPO = r'C:\rotina'
SECO = '--seco' in sys.argv
MIN = int(sys.argv[sys.argv.index('--min') + 1]) if '--min' in sys.argv else 40
# ids que nao devem virar texto (leitura inventada so para o conferidor aceitar etc.)
EXCLUIR = {'obj-fgvsp2011_economia_1fase-089', 'obj-fgvsp2026_administracao-43', 'obj-fatec2023_2-04', 'obj-insper2015_1-01', 'obj-fatec2012-01', 'obj-insper2015_1-11', 'obj-mackenzie2016-46', 'obj-mackenzie2025-10', 'obj-mackenzie2025-11', 'obj-mackenzie2025-2dia-41', 'obj-mackenzie2025-2dia-60', 'obj-mackenzie2025-2dia-10', 'obj-mackenzie2025-2dia-11', 'obj-pucsp2019_2-01'}   # pucsp2019_2-01: imagem cortada, palavras reconstruídas pelo contexto   # 089: enunciado inventado; 2026-43: a resolução impressa é de outra questão
_REV = r'C:\rotina-banco\reverter-imagem.json'   # ids que ela marcou com "texto errado"/"imagem ruim" no app (aplicar_feedback.py): ficam em imagem
if os.path.exists(_REV): EXCLUIR = EXCLUIR | set(json.load(open(_REV, encoding='utf-8')))
GRANDES = ['6-oficiais-Fuvest-Unicamp-UNESP', '7-oficiais-Medicina-SP', '8-oficiais-outras-SP-e-exatas', '9-oficiais-ENEM-com-resolucao']

import re
def inventada(q):
    """alternativa-figura 'descrita' em texto para passar na conferência ("(desenho a: ...)", "[gráfico: ...]"): descrição inventada, fica em imagem."""
    if re.search(r'trecho cortado|cortad[oa] na imagem|ileg[ií]vel', ' '.join([q.get('enunciado') or '', q.get('coment') or ''] + [(a.get('t') if isinstance(a, dict) else str(a)) or '' for a in (q.get('alts') or [])]), re.I): return True   # marcador de leitura incompleta: fica em imagem
    return any(re.match(r'\s*[\(\[]?\s*(desenho|gr.fico|figura|imagem|diagrama|estrutura\s+[a-e]\b|alternativa\s+[a-e]\b|op..o\s+[a-e]\b)', (a.get('t') if isinstance(a, dict) else str(a)) or '', re.I) for a in (q.get('alts') or []))

def log(*a): print(time.strftime('%d/%m %H:%M'), *a, flush=True)
def carregar(pasta, nome):
    d = json.load(gzip.open(os.path.join(pasta, nome + '.json.gz'), 'rt', encoding='utf-8'))
    return d if isinstance(d, list) else d.get('questoes', [])

def principal():
    r = subprocess.run([sys.executable, '-P', os.path.join(AQUI, 'montar_texto_final.py')], capture_output=True, text=True, encoding='utf-8')
    log([l for l in r.stdout.splitlines() if l.startswith('texto final')][:1] or ('ERRO montar_texto_final: ' + r.stderr[-300:]))
    if r.returncode: return 1
    tmp = tempfile.mkdtemp(prefix='pub-'); web, ipad = os.path.join(tmp, 'web'), os.path.join(tmp, 'ipad'); os.makedirs(web); os.makedirs(ipad)
    env = dict(os.environ, EMP_WEB=web, EMP_IPAD=ipad, PYTHONIOENCODING='utf-8')
    r = subprocess.run([sys.executable, '-P', os.path.join(AQUI, 'empacotar.py'), r'C:\rotina-banco\transcrito-final.json'], capture_output=True, text=True, encoding='utf-8', env=env)
    if r.returncode: log('ERRO empacotar:', r.stderr[-300:]); return 1
    man = json.load(open(os.path.join(W, 'manifesto.json'), encoding='utf-8'))
    pub = {}
    for arq in man['arquivos']:
        if arq.startswith('D'): continue
        for q in carregar(W, arq[:-8]): pub[q['id']] = q          # pacotes mais novos na lista vencem
    novas = {}
    for n in GRANDES:
        for q in carregar(web, n):
            p = pub.get(q['id'])
            if q.get('modo') != 'objetivo' and p is not None and p.get('modo') == 'objetivo' and q['id'] not in EXCLUIR and not inventada(q): novas[q['id']] = q
    log('novas em texto:', len(novas))
    shutil.rmtree(tmp, ignore_errors=True)
    if len(novas) < MIN or SECO: log('nada a publicar' if len(novas) < MIN else 'modo seco'); return 0
    v = max([4] + [(pub[i].get('v') or 0) for i in novas]) + 1
    lista = [dict(q, v=v) for q in novas.values()]
    nome = time.strftime('T%Y%m%d%H%M') + '-texto-novo.json.gz'
    with gzip.open(os.path.join(W, nome), 'wt', encoding='utf-8', compresslevel=9) as g: json.dump(lista, g, ensure_ascii=False, separators=(',', ':'))
    agora = int(time.time())
    man['arquivos'].append(nome); man['por'][nome] = agora; man['v'] = agora
    man['hash'][nome] = hashlib.sha1(gzip.open(os.path.join(W, nome)).read()).hexdigest()[:16]; man['texto'] = man.get('texto', 0) + len(lista)
    json.dump(man, open(os.path.join(W, 'manifesto.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    log(nome, '%.1f MB' % (os.path.getsize(os.path.join(W, nome)) / 1e6), 'v=%d' % v)
    git = lambda *a: subprocess.run(['git', '-C', REPO, *a], capture_output=True, text=True, encoding='utf-8')
    git('add', 'pacotes/' + nome, 'pacotes/manifesto.json')
    c = git('commit', '-m', f'Pacote {nome[:-8]} (+{len(lista)} questoes em texto, conferidas automaticamente)\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>')
    p = git('push', 'origin', 'main'); log('commit:', (c.stdout.strip().splitlines() or ['?'])[0][:80], '| push:', 'ok' if p.returncode == 0 else p.stderr[-200:])
    return 0 if p.returncode == 0 else 1

if __name__ == '__main__':
    sys.exit(principal())
