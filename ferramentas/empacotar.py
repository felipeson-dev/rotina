"""Gera os pacotes para o iPad juntando as questões oficiais (objetivo-<banca>.json, modo imagem) com as já lidas pela IA
(transcrito.json, texto de verdade). Cada questão sai uma vez só, com o MESMO id da versão em imagem e "v": 2 quando está em texto:
o app troca a versão em imagem pela de texto ao importar de novo (e o histórico de acertos continua valendo).
Pode rodar quantas vezes quiser (por exemplo, a cada dia de transcrição): cada pacote novo melhora o anterior.
Uso: python empacotar.py
"""
import gzip, json, os, shutil, sys, time
SAIDA = r'C:\rotina-banco'
PACOTES_WEB = r'C:\rotina\pacotes'
TRANSCRITO = sys.argv[1] if len(sys.argv) > 1 else os.path.join(SAIDA, 'transcrito.json')
ANTES_ARQ = sys.argv[2] if len(sys.argv) > 2 else os.path.join(SAIDA, 'texto-antes.json')   # ids que já estavam em texto no site; se reprovarem agora, voltam para imagem com v=4
ANTES = set(json.load(open(ANTES_ARQ, encoding='utf-8'))) if os.path.exists(ANTES_ARQ) else set()
TOPOS = json.load(open(os.path.join(SAIDA, 'topos.json'), encoding='utf-8')) if os.path.exists(os.path.join(SAIDA, 'topos.json')) else {}   # esconder_resposta.py
GRUPOS = [  # mesmos grupos de oficiais.py
    ('6-oficiais-Fuvest-Unicamp-UNESP', ['fuvest', 'unicamp', 'unesp']),
    ('7-oficiais-Medicina-SP', ['unifesp', 'santacasa', 'alberteinstein', 'famerp', 'fmabc', 'famema', 'fmj', 'saocamilo', 'siriolibanes', 'unisa']),
    ('8-oficiais-outras-SP-e-exatas', ['pucsp', 'fgvsp', 'ita', 'fatec', 'ufscar', 'ufabc', 'insper', 'mackenzie']),
    ('9-oficiais-ENEM-com-resolucao', ['enem']),
    ('A-simulados', ['simulados']),   # simulados oficiais (pdf_provas.py); banca "Simulado ...": só aparecem na aba Simulados
    ('B-PUC-Campinas', ['puccamp']),  # PUC-Campinas Medicina, cadernos oficiais (pdf_puccamp.py), desde 17/11/2026
]

GRUPOS_DISC = [
    ('D1-discursivas-Fuvest-Unicamp-UNESP', ['fuvest', 'unicamp', 'unesp']),
    ('D2-discursivas-Medicina-SP', ['unifesp', 'santacasa', 'alberteinstein', 'famerp', 'fmabc', 'famema', 'fmj', 'saocamilo', 'siriolibanes']),
]

def principal():
    tx = {x['id'][3:]: x for x in json.load(open(TRANSCRITO, encoding='utf-8'))} if os.path.exists(TRANSCRITO) else {}
    total_t = total_i = 0
    os.makedirs(PACOTES_WEB, exist_ok=True)
    arquivos_gerados = []
    for nome, bancas in GRUPOS:
        orig = []
        for b in bancas:
            a = os.path.join(SAIDA, f'objetivo-{b}.json')
            if os.path.exists(a) and os.path.getsize(a) > 10:
                orig += json.load(open(a, encoding='utf-8'))
        if not orig:
            continue
        por_id = {r['id']: r for r in orig}

        def origem(i):
            # texto-base de um grupo ("leia o texto para as questões 06 a 09") fica na primeira do grupo: sobe enquanto a anterior também depende de outra
            vistos = set()
            while i in por_id and i not in vistos and tx.get(i, {}).get('dep') and por_id[i].get('prev') in por_id:
                vistos.add(i); i = por_id[i]['prev']
            return i
        saida, n_txt = [], 0
        for r in orig:
            t = tx.get(r['id'])
            if not t:
                # ainda não lida (ou não deu): fica no modo imagem. "topo" esconde a faixa do número, onde algumas imagens trazem a letra da resposta; v=1 faz o iPad trocar a versão já baixada
                img = {k: v for k, v in r.items() if k != 'assunto_local'}
                if r.get('img') in TOPOS: img['topo'] = TOPOS[r['img']]; img['v'] = 1
                if r['id'] in ANTES: img['v'] = 4   # estava em texto no site e não passou na conferência: v maior troca o texto de volta pela imagem
                saida.append(img); continue
            q = {k: v for k, v in t.items() if k != 'dep'}
            q['id'] = r['id']; q['v'] = 4   # v=4: texto conferido contra a imagem (conferir_texto.py); leva também a imagem recortada, para ela poder alternar no app
            for k in ('w', 'h', 'corte'): q[k] = r.get(k) or 0
            if r.get('img') in TOPOS: q['topo'] = TOPOS[r['img']]
            q['prev'] = origem(r['prev']) if r.get('prev') in por_id else ''
            # depende do texto de outra questão: com a anterior no pacote, o app mostra um botão para ler o texto dela
            q['dep'] = 1 if t.get('dep') and q['prev'] else 0
            q['fig'] = 1 if t.get('dep') and not q['prev'] else 0
            q['materia'] = t.get('materia') or r.get('materia') or ''
            q['assunto'] = t.get('assunto') or r.get('assunto') or ''
            saida.append(q); n_txt += 1
        p = os.path.join(SAIDA, 'para-o-ipad', nome + '.json.gz')
        tmp = p + '.tmp'
        with gzip.open(tmp, 'wt', encoding='utf-8', compresslevel=9) as f:
            json.dump(saida, f, ensure_ascii=False, separators=(',', ':'))
        os.replace(tmp, p)
        shutil.copy2(p, os.path.join(PACOTES_WEB, nome + '.json.gz'))
        arquivos_gerados.append(nome + '.json.gz')
        total_t += n_txt; total_i += len(saida) - n_txt
        print(f'{nome}: {len(saida)} questões · {n_txt} em texto · {len(saida) - n_txt} em imagem · {os.path.getsize(p) / 1e6:.1f} MB', flush=True)
    print(f'{time.strftime("%d/%m %H:%M")} total: {total_t} em texto, {total_i} em imagem', flush=True)
    # discursivas (imagem do enunciado + resolução do Objetivo como padrão de resposta)
    for nome, bancas in GRUPOS_DISC:
        lista = []
        for b in bancas:
            a = os.path.join(SAIDA, f'objetivo-disc-{b}.json')
            if os.path.exists(a) and os.path.getsize(a) > 10:
                lista += [{k: v for k, v in r.items() if k != 'assunto_local'} for r in json.load(open(a, encoding='utf-8'))]
        if not lista:
            continue
        p = os.path.join(SAIDA, 'para-o-ipad', nome + '.json.gz')
        with gzip.open(p + '.tmp', 'wt', encoding='utf-8', compresslevel=9) as f:
            json.dump(lista, f, ensure_ascii=False, separators=(',', ':'))
        os.replace(p + '.tmp', p)
        shutil.copy2(p, os.path.join(PACOTES_WEB, nome + '.json.gz'))
        arquivos_gerados.append(nome + '.json.gz')
        print(f'{nome}: {len(lista)} discursivas · {os.path.getsize(p) / 1e6:.1f} MB', flush=True)
    # versão POR PACOTE: pacote com o mesmo conteúdo de antes mantém a versão (o iPad não baixa de novo); só o que mudou ganha versão nova
    agora = int(time.time())
    ant_man = {}
    try: ant_man = json.load(open(os.path.join(PACOTES_WEB, 'manifesto.json'), encoding='utf-8'))
    except Exception: pass
    ant_hash = ant_man.get('hash', {}); ant_por = ant_man.get('por', {}); por, hashes = {}, {}
    import hashlib
    # pacotes feitos à mão (não gerados aqui), como C-recuperadas.json.gz: continuam no manifesto
    for extra in ant_man.get('arquivos', []):
        if extra not in arquivos_gerados and os.path.exists(os.path.join(PACOTES_WEB, extra)): arquivos_gerados.append(extra)
    for arq in arquivos_gerados:
        h = hashlib.sha1(gzip.open(os.path.join(PACOTES_WEB, arq)).read()).hexdigest()[:16]   # conteúdo, não o .gz (o .gz guarda a hora em que foi feito)
        hashes[arq] = h
        por[arq] = ant_por.get(arq, ant_man.get('v', agora)) if ant_hash.get(arq) == h else agora
    manifesto = {'v': agora, 'total': total_t + total_i, 'texto': total_t, 'arquivos': arquivos_gerados, 'por': por, 'hash': hashes}
    with open(os.path.join(PACOTES_WEB, 'manifesto.json'), 'w', encoding='utf-8') as f:
        json.dump(manifesto, f, ensure_ascii=False)

if __name__ == '__main__':
    principal()
