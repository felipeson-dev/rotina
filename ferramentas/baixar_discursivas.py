"""Baixa as questões DISCURSIVAS (2ª fase e provas com questões abertas) das provas resolvidas pelo Curso Objetivo, de 2015 em diante.
A resolução do professor vem na mesma imagem, depois de "Resolução": o app mostra a parte de cima como enunciado e, depois que ela
responde com a caneta, a parte de baixo como padrão de resposta. Saída: C:\\rotina-banco\\objetivo-disc-<banca>.json
Uso: python baixar_discursivas.py [banca ...]
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import objetivo as o

BANCAS = ['fuvest', 'unifesp', 'santacasa', 'alberteinstein', 'famerp', 'fmabc', 'famema', 'unicamp', 'unesp', 'fmj', 'saocamilo', 'siriolibanes']

if __name__ == '__main__':
    for b in sys.argv[1:] or BANCAS:
        try:
            o.processar(b, None, 2015, disc=True)
        except Exception as e:
            print(f'!! {b}: {e!r}'[:200], flush=True)
    print('PRONTO', flush=True)
