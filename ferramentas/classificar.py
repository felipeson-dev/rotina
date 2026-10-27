"""Classifica a matéria das questões que vieram sem matéria (ex.: "Conhecimentos Gerais"), usando o Gemini flash lite,
em lotes de 40. As chaves vêm da variável de ambiente GEMINI_KEYS (separadas por vírgula); nunca ficam em arquivo.
Uso: python classificar.py C:\\rotina-banco\\objetivo-fuvest.json [...]
"""
import json, os, re, sys, time, urllib.request

CHAVES = [k for k in os.environ.get('GEMINI_KEYS', '').split(',') if k]
MATS = ['Português', 'Literatura', 'Inglês', 'Espanhol', 'Matemática', 'Física', 'Química', 'Biologia', 'História', 'Geografia', 'Filosofia', 'Sociologia', 'Artes']
MODELOS = ['gemini-3.5-flash-lite', 'gemini-3.6-flash']

def pergunta(lote):
    itens = '\n'.join(f'{i}: ' + re.sub(r'\s+', ' ', t)[:420] for i, t in lote)
    prompt = (f'Classifique a matéria principal de cada questão de vestibular (texto obtido por OCR, pode ter erros). '
              f'Use exatamente uma destas: {", ".join(MATS)}. Responda SÓ com JSON: {{"r":[{{"i":0,"m":"Matemática"}}]}}\n\n{itens}')
    corpo = json.dumps({'contents': [{'role': 'user', 'parts': [{'text': prompt}]}], 'generationConfig': {'responseMimeType': 'application/json', 'temperature': 0, 'maxOutputTokens': 4000}}).encode()
    for modelo in MODELOS:
        for k in CHAVES:
            for tent in range(3):
                try:
                    req = urllib.request.Request(f'https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent', data=corpo, headers={'Content-Type': 'application/json', 'x-goog-api-key': k})
                    j = json.loads(urllib.request.urlopen(req, timeout=90).read())
                    txt = ''.join(p.get('text', '') for p in j['candidates'][0]['content']['parts'])
                    return {int(x['i']): x['m'] for x in json.loads(txt).get('r', []) if x.get('m') in MATS}
                except urllib.error.HTTPError as e:
                    if e.code == 429:
                        break   # cota desta chave/modelo: tenta a próxima
                    time.sleep(3 + tent * 5)
                except Exception:
                    time.sleep(3 + tent * 5)
    return {}

for arq in sys.argv[1:]:
    d = json.load(open(arq, encoding='utf-8'))
    falta = [(i, q['enunciado']) for i, q in enumerate(d) if not q.get('materia')]
    print(f'{os.path.basename(arq)}: {len(falta)} sem matéria', flush=True)
    for n in range(0, len(falta), 40):
        lote = falta[n:n + 40]
        r = pergunta([(j, t) for j, (_, t) in enumerate(lote)])
        for j, (i, _) in enumerate(lote):
            if j in r:
                d[i]['materia'] = r[j]
        if n % 400 == 0:
            print(f'  {n + len(lote)}/{len(falta)}', flush=True)
            json.dump(d, open(arq, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    json.dump(d, open(arq, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    from collections import Counter
    print('  matérias:', dict(Counter(q.get('materia') or '(sem)' for q in d).most_common()), flush=True)
