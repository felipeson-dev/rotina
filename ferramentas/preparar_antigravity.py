"""Prepara em C:\\rotina-banco\\antigravity um lote de questões em imagem (PNG) para o Antigravity ler com o próprio modelo, sem usar as chaves.
A resposta oficial não vai no lote: depois comparo o que ele leu com o gabarito. Nada aqui mexe no banco nem no transcrito.json.
Uso: python -P preparar_antigravity.py piloto
"""
import glob, json, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import transcrever as T
from PIL import Image

S = r'C:\rotina-banco'
AG = os.path.join(S, 'antigravity')
SP_ENEM = ['fuvest', 'unifesp', 'santacasa', 'alberteinstein', 'famerp', 'fmabc', 'famema', 'fmj', 'saocamilo', 'siriolibanes', 'unisa', 'unesp', 'unicamp', 'enem']
NAT = {'Biologia', 'Química', 'Física', 'Matemática'}

INSTR = '''# Tarefa: transformar questões de vestibular em texto

Cada PNG da pasta do lote é uma questão de vestibular (parte de cima) seguida da resolução de um professor (depois da palavra "Resolução").
Olhe CADA imagem de verdade, uma por uma, com a sua própria visão. Não use OCR, nem programa que chame outra IA ou API, nem chaves de API.

Para cada imagem, gere um objeto com estes campos:
- "id": o id que está em lista.json para esse arquivo.
- "enunciado": SÓ a questão, sem as alternativas e sem a resolução, fiel à imagem, com fórmulas em LaTeX entre $...$. Tabela simples vira tabela markdown. Inclua o texto-base se ele estiver na imagem. Não invente, não corrija e não complete nada.
- "alternativas": lista só com o TEXTO de cada alternativa, na ordem, sem a letra. Se a alternativa for uma figura, escreva "[figura]".
- "gabarito": a letra certa segundo a resolução da imagem ("Resposta:", o texto da resolução ou a letra ao lado do número, no topo). Se não der para saber, "".
- "resolucao": a resolução do professor em texto, com LaTeX, sem a linha "Resposta".
- "figuras": para cada figura, gráfico, mapa, esquema, foto ou desenho da QUESTÃO (não da resolução, não texto comum, não tabela simples), {"box_2d":[ymin,xmin,ymax,xmax],"legenda":"..."}, em escala 0 a 1000 sobre a imagem inteira. Sem figura: [].
- "depende_de_outro_texto": true se a questão remete a um texto ou figura que NÃO está nesta imagem; senão false.
- "materia" e "assunto": copiados EXATAMENTE da lista em assuntos.txt, escolhidos pelo que a questão realmente cobra, lendo também a resolução. Não escolha só por uma palavra que aparece no texto. "materia_caderno" em lista.json é só uma dica e pode estar errada. Se nenhum assunto servir, "Outro".
- "desatualizada": true só se a questão hoje levaria a uma resposta errada ou sem sentido (lei, classificação ou nomenclatura que mudaram, dado "atual" que deixou de ser, ortografia anterior ao acordo como objeto da pergunta, obra que saiu das leituras). Questão antiga mas ainda correta é false.
- "motivo_desatualizada": uma frase, ou "".
- "confianca": "alta", "media" ou "baixa" na sua leitura; "baixa" se a imagem estiver ilegível ou cortada.
- "erro": "" ou o motivo, se não conseguiu ler ou se recusou. Nesse caso, deixe os outros campos vazios e siga para a próxima.

Regras:
- Grave em saida/<nome do lote>.json uma lista JSON válida em UTF-8. Salve a cada 10 questões. Se parar, retome pelos ids que ainda faltam.
- Não mexa em nenhum arquivo fora de C:\\rotina-banco\\antigravity. Não faça commit nem push. Não use nada de C:\\rotina.
- Não pule questões nem resuma. Se o limite acabar, pare e diga até qual id chegou.
- No fim, informe: quantas leu, quantas com erro e quantas com confiança baixa.
'''

def png(q, destino):
    Image.open(T.caminho(q)).convert('RGB').save(destino, 'PNG', optimize=True)

def principal(nome):
    todas = []
    for b in SP_ENEM:
        a = os.path.join(S, f'objetivo-{b}.json')
        if os.path.exists(a):
            todas += [q for q in json.load(open(a, encoding='utf-8')) if str(q.get('fonte', 'Objetivo')).startswith('Objetivo') and os.path.exists(T.caminho(q))]
    tx = {x['id'][3:]: x for x in json.load(open(os.path.join(S, 'transcrito.json'), encoding='utf-8'))}
    fal = json.load(open(os.path.join(S, 'transcrito.json.falhas.json'), encoding='utf-8'))
    random.seed(11)
    nat = [q for q in todas if q.get('materia') in NAT]
    ja = [q for q in nat if q['id'] in tx and tx[q['id']].get('imagens')]
    novas = [q for q in nat if q['id'] not in tx and q['id'] not in fal]
    recusadas = [q for q in todas if fal.get(q['id'], {}).get('def')]
    grupo = random.sample(ja, min(20, len(ja))) + random.sample(novas, min(30, len(novas))) + random.sample(recusadas, min(10, len(recusadas)))
    pasta = os.path.join(AG, nome)
    os.makedirs(pasta, exist_ok=True); os.makedirs(os.path.join(AG, 'saida'), exist_ok=True)
    lista = []
    for q in grupo:
        arq = q['id'].replace('obj-', '') + '.png'
        png(q, os.path.join(pasta, arq))
        lista.append({'id': q['id'], 'arquivo': arq, 'materia_caderno': q.get('materia') or ''})
    json.dump(lista, open(os.path.join(pasta, 'lista.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    open(os.path.join(AG, 'INSTRUCOES.md'), 'w', encoding='utf-8').write(INSTR)
    open(os.path.join(AG, 'assuntos.txt'), 'w', encoding='utf-8').write(T.cl.TEXTO_TAX)
    print(f'{nome}: {len(grupo)} questões ({min(20, len(ja))} já lidas, {min(30, len(novas))} novas, {min(10, len(recusadas))} recusadas) | fila SP+ENEM sem texto: {len(novas)} de natureza e exatas')
    print('sem texto em SP+ENEM (todas as matérias):', sum(1 for q in todas if q['id'] not in tx))

if __name__ == '__main__':
    principal(sys.argv[1])
