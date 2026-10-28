"""Classifica cada questão por MATÉRIA e ASSUNTO (do plano de estudos do app: base.js) usando o Gemini lite, em lotes de 40, a partir do
texto lido por OCR. Assim dá para filtrar "funções do 2º grau" e achar todas. Retoma de onde parou (pula as já classificadas).
As chaves vêm da variável de ambiente GEMINI_KEYS (separadas por vírgula); nunca ficam em arquivo.
Uso: python classificar.py C:\\rotina-banco\\objetivo-fuvest.json [...]
"""
import json, os, re, sys, time, urllib.request

CHAVES = [k for k in os.environ.get('GEMINI_KEYS', '').split(',') if k]
MODELOS = ['gemini-3.5-flash-lite', 'gemini-3.6-flash']
BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'base.js')

def taxonomia():
    js = open(BASE, encoding='utf-8').read()
    ini = js.index('const CONTEUDO = {'); fim = js.index('\n};', ini)
    tax = {}
    for m in re.finditer(r"'([^']+)':\s*\[(.*?)\]\s*,?\s*\n", js[ini:fim + 3], re.S):
        tax[m.group(1)] = re.findall(r"'((?:[^'\\]|\\.)*)'", m.group(2))
    tax['Artes'] = []
    return tax

TAX = taxonomia()
MATS = list(TAX.keys())
TEXTO_TAX = '\n'.join(f'{m}: ' + ' | '.join(a) if a else f'{m}: (sem lista)' for m, a in TAX.items())

def pergunta(lote):
    itens = '\n'.join(f'{i}: ' + (f'[matéria: {m}] ' if m else '') + re.sub(r'\s+', ' ', t)[:450] for i, m, t in lote)
    prompt = ('Classifique cada questão de vestibular (texto lido por OCR, pode ter erros) pela MATÉRIA e pelo ASSUNTO. '
              'O assunto deve ser EXATAMENTE um dos itens da lista da matéria (copie igual). Se nenhum servir, use "Outro". '
              f'A matéria indicada vem do caderno da prova e pode estar errada quando o caderno junta matérias (ex.: Português e Literatura, História e Geografia): corrija pela questão.\n\nMatérias e assuntos:\n{TEXTO_TAX}\n\n'
              'Responda SÓ com JSON: {"r":[{"i":0,"m":"Matemática","a":"Funções do 2º grau"}]}\n\nQuestões:\n' + itens)
    corpo = json.dumps({'contents': [{'role': 'user', 'parts': [{'text': prompt}]}], 'generationConfig': {'responseMimeType': 'application/json', 'temperature': 0, 'maxOutputTokens': 5000}}).encode()
    for modelo in MODELOS:
        for k in CHAVES:
            for tent in range(3):
                try:
                    req = urllib.request.Request(f'https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent', data=corpo, headers={'Content-Type': 'application/json', 'x-goog-api-key': k})
                    j = json.loads(urllib.request.urlopen(req, timeout=120).read())
                    txt = ''.join(p.get('text', '') for p in j['candidates'][0]['content']['parts'])
                    out = {}
                    for x in json.loads(txt).get('r', []):
                        m = x.get('m'); a = x.get('a') or ''
                        if m in MATS:
                            out[int(x['i'])] = (m, a if a in TAX.get(m, []) else '')
                    return out
                except urllib.error.HTTPError as e:
                    if e.code == 429:
                        break
                    time.sleep(3 + tent * 5)
                except Exception:
                    time.sleep(3 + tent * 5)
    return {}

from concurrent.futures import ThreadPoolExecutor
for arq in sys.argv[1:]:
    d = json.load(open(arq, encoding='utf-8'))
    falta = [(i, q.get('materia') or '', q['enunciado']) for i, q in enumerate(d) if not q.get('assunto')]
    print(f'{os.path.basename(arq)}: {len(falta)} a classificar de {len(d)}', flush=True)
    lotes = [falta[n:n + 40] for n in range(0, len(falta), 40)]
    def roda(lote):
        return lote, pergunta([(j, m, t) for j, (_, m, t) in enumerate(lote)])
    feitos = 0
    with ThreadPoolExecutor(4) as ex:      # 4 pedidos ao mesmo tempo
        for lote, r in ex.map(roda, lotes):
            for j, (i, _, _) in enumerate(lote):
                if j in r:
                    m, a = r[j]
                    # a IA pode corrigir a matéria do caderno quando o assunto que ela achou é mesmo dessa outra matéria
                    if not d[i].get('materia') or (a and d[i]['materia'] != m):
                        d[i]['materia'] = m
                    if d[i]['materia'] == m:
                        d[i]['assunto'] = a or 'Outro'
            feitos += 1
            if feitos % 10 == 0:
                print(f'  {min(feitos * 40, len(falta))}/{len(falta)}', flush=True)
                json.dump(d, open(arq, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    json.dump(d, open(arq, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    from collections import Counter
    print('  matérias:', dict(Counter(q.get('materia') or '(sem)' for q in d).most_common()), flush=True)
    print('  assuntos classificados:', sum(1 for q in d if q.get('assunto') and q['assunto'] != 'Outro'), 'de', len(d), flush=True)