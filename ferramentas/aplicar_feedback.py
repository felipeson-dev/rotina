"""Lê o relatório "ERROS DO ROTINA" que a Uany manda pelo app (botão "Enviar para o Felipe") e age em cada linha.
Cada linha:  id | tipo | prova nº | dia | modo texto/imagem | gabarito do app → certo | observação
  Texto errado / Imagem cortada ou ilegível -> a questão volta para IMAGEM (entra em C:\\rotina-banco\\reverter-imagem.json; depois rode reverter_para_imagem.py --gravar)
  Gabarito errado -> vai para C:\\rotina-banco\\feedback-gabarito.json (com a letra que ela sugeriu) para investigar (claude\\gabarito) antes de mudar
  Tema errado / Outro -> C:\\rotina-banco\\feedback-outros.json (lista para corrigir à mão)
Uso: python -P aplicar_feedback.py relatorio.txt      (ou:  Get-Clipboard | python -P aplicar_feedback.py -)
"""
import json, os, sys, time
sys.stdout.reconfigure(encoding='utf-8')
SAIDA = r'C:\rotina-banco'
src = sys.argv[1] if len(sys.argv) > 1 else '-'
texto = sys.stdin.read() if src == '-' else open(src, encoding='utf-8').read()

def carregar(nome, padrao):
    p = os.path.join(SAIDA, nome)
    return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else padrao
rev = set(carregar('reverter-imagem.json', [])); gab = carregar('feedback-gabarito.json', {}); outros = carregar('feedback-outros.json', {})
n = {'imagem': 0, 'gabarito': 0, 'outros': 0, 'ignoradas': 0}
for linha in texto.splitlines():
    c = [x.strip() for x in linha.split('|')]
    if len(c) < 3 or not c[0].startswith('obj-'): n['ignoradas'] += 1; continue
    i, tipo = c[0], c[1].lower()
    nota = c[-1] if len(c) >= 7 else ''
    if 'texto' in tipo or 'imagem' in tipo:
        rev.add(i); n['imagem'] += 1
        if nota: outros[i] = {'tipo': c[1], 'nota': nota, 'dia': time.strftime('%Y-%m-%d')}
    elif 'gabarito' in tipo:
        certa = ''
        for x in c:
            if '→ certo' in x: certa = x.split('→ certo')[-1].strip()[:1]
        gab[i] = {'sugerido': certa if certa and certa != '?' else '', 'nota': nota, 'prova': c[2], 'dia': time.strftime('%Y-%m-%d')}; n['gabarito'] += 1
    else:
        outros[i] = {'tipo': c[1], 'nota': nota, 'prova': c[2], 'dia': time.strftime('%Y-%m-%d')}; n['outros'] += 1
json.dump(sorted(rev), open(os.path.join(SAIDA, 'reverter-imagem.json'), 'w', encoding='utf-8'), indent=1)
json.dump(gab, open(os.path.join(SAIDA, 'feedback-gabarito.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(outros, open(os.path.join(SAIDA, 'feedback-outros.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(n)
print('Próximo passo: python -P reverter_para_imagem.py --gravar   (volta para imagem as de texto/imagem errada e publica)')
