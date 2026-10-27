"""Monta arquivos de questões (JSON) para importar no app Rotina, a partir de conjuntos abertos do Hugging Face.
Uso:  python montar_banco.py [pasta_de_saida]            (padrão: C:\\rotina-banco)
      python montar_banco.py [pasta] --token hf_xxx      (inclui o conjunto grande, que exige conta gratuita)
Os arquivos NÃO ficam no repositório: são para uso pessoal de estudo (a licença dos conjuntos é desconhecida).
Formato de cada questão: id, banca, ano, area, materia, assunto, dif, enunciado, alts[{l,t}], gab, coment, fig
"""
import ast, json, os, re, sys, time, unicodedata, urllib.parse, urllib.request

SAIDA = next((a for a in sys.argv[1:] if not a.startswith('--') and not a.startswith('hf_')), r'C:\rotina-banco')
TOKEN = sys.argv[sys.argv.index('--token') + 1] if '--token' in sys.argv else None
os.makedirs(SAIDA, exist_ok=True)
VISTAS = set()

def get(url, tentativas=10):
    for i in range(tentativas):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'rotina-banco'} | ({'Authorization': 'Bearer ' + TOKEN} if TOKEN else {}))
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read().decode('utf-8'))
        except Exception as e:
            if i == tentativas - 1:
                raise
            limite = '429' in str(e)   # o servidor limita pedidos seguidos: espera mais
            time.sleep((25 + i * 20) if limite else (2 + i * 3))

def linhas(ds, config, split, total=None, passo=100):
    q = urllib.parse.quote(ds, safe='')
    cache = os.path.join(SAIDA, 'cache'); os.makedirs(cache, exist_ok=True)   # guarda cada página: se parar, continua de onde estava
    if total is None:
        total = get(f'https://datasets-server.huggingface.co/size?dataset={q}&config={config}')['size']['config']['num_rows']
    for off in range(0, total, passo):
        arq = os.path.join(cache, f"{ds.replace('/', '_')}_{config}_{off}.json")
        if os.path.exists(arq):
            with open(arq, encoding='utf-8') as f:
                d = json.load(f)
        else:
            d = get(f'https://datasets-server.huggingface.co/rows?dataset={q}&config={config}&split={split}&offset={off}&length={passo}')
            with open(arq, 'w', encoding='utf-8') as f:
                json.dump(d, f, ensure_ascii=False)
            time.sleep(1.5)
        for r in d['rows']:
            yield r['row']
        if (off // passo) % 10 == 0:
            print(f'  {ds}: {min(off + passo, total)}/{total}', flush=True)

def limpa(s):
    s = (s or '').replace('\xa0', ' ').replace('\r', '')
    s = re.sub(r'[ \t]+\n', '\n', s)
    return re.sub(r'\n{3,}', '\n\n', s).strip()

def chave(enun, gab):
    t = unicodedata.normalize('NFKD', enun.lower())
    return re.sub(r'[^a-z0-9]', '', t)[:120] + gab

MATERIAS = [('portugu', 'Português'), ('portuguese', 'Português'), ('english', 'Inglês'), ('inglês', 'Inglês'), ('math', 'Matemática'), ('matem', 'Matemática'), ('phys', 'Física'), ('fís', 'Física'),
            ('chem', 'Química'), ('quím', 'Química'), ('biol', 'Biologia'), ('hist', 'História'), ('geog', 'Geografia'), ('philos', 'Filosofia'), ('filos', 'Filosofia'), ('sociol', 'Sociologia'), ('liter', 'Literatura')]
AREA = {'Biologia': 'ciencias-natureza', 'Química': 'ciencias-natureza', 'Física': 'ciencias-natureza', 'Matemática': 'matematica', 'História': 'ciencias-humanas', 'Geografia': 'ciencias-humanas',
        'Filosofia': 'ciencias-humanas', 'Sociologia': 'ciencias-humanas', 'Português': 'linguagens', 'Literatura': 'linguagens', 'Inglês': 'linguagens'}

def materia_de(texto):
    if isinstance(texto, (list, tuple)):
        texto = ' '.join(map(str, texto))
    t = (texto or '').lower()
    for k, v in MATERIAS:
        if k in t:
            return v
    return ''

def monta(id_, banca, ano, materia, enun, alts, gab, assunto='', dif='', coment='', fonte=''):
    enun = limpa(enun)
    gab = str(gab).strip().upper()
    alts = [limpa(a) for a in alts]
    if len(enun) < 25 or len(alts) < 2 or gab not in 'ABCDE' or len(gab) != 1 or 'ABCDE'.index(gab) >= len(alts) or any(not a for a in alts):
        return None
    k = chave(enun, gab)
    if k in VISTAS:
        return None
    VISTAS.add(k)
    fig = 1 if re.search(r'\b(imagem|figura|charge|tirinha|gr[aá]fico|mapa|ilustra|tabela|quadro|foto)\b', enun.lower()) and len(enun) < 700 else 0
    return {'id': id_, 'banca': banca, 'ano': ano, 'area': AREA.get(materia, ''), 'materia': materia, 'assunto': assunto, 'dif': dif, 'fig': fig,
            'enunciado': enun, 'alts': [{'l': 'ABCDE'[i], 't': t} for i, t in enumerate(alts)], 'gab': gab, 'coment': coment, 'fonte': fonte}

def salvar(nome, itens):
    p = os.path.join(SAIDA, nome)
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(itens, f, ensure_ascii=False, separators=(',', ':'))
    print(f'>> {nome}: {len(itens)} questões, {os.path.getsize(p) / 1e6:.1f} MB', flush=True)

def ano_de(s):
    m = re.search(r'(19|20)\d{2}', s or '')
    return int(m.group(0)) if m else 0

def canon(titulo):
    """Nome da banca sem fase, dia, caderno, turno etc. (UECE 2° Fase 2° Dia -> UECE). Mantém 'Medicina'."""
    base = re.split(r'\s+(?:(?:19|20)\d{2}|\d+\s*[°ºo]|Caderno|Inverno|Ver[aã]o|Tarde|Manh[aã]|Noite|Demais|Geral|PSC|PAS|Tipo|Prova|Dia\b|Fase|Etapa|Semestre|-\s)', titulo.strip())[0]
    base = re.sub(r'\s*[-–]\s*Quest.*$', '', base).strip(' -–')
    base = re.sub(r'\s*\(.*?\)\s*$', '', base).strip()
    if re.search(r'medicina', titulo, re.I) and not re.search(r'medicina', base, re.I):
        base += ' Medicina'
    alias = {'FUVEST': 'Fuvest', 'Fuvest': 'Fuvest', 'USP': 'USP'}
    return alias.get(base, base) or titulo
# ---------- Unicamp 2019-2025 (Objetivo) ----------
def unicamp():
    out = []
    for r in linhas('letmarchezi/unicamp_2019_2025', 'default', 'train'):
        if r.get('image_type'):
            continue
        m = materia_de(r.get('category_en') or r.get('category_original_lang'))
        opts = r['options'] if isinstance(r['options'], list) else []
        try:
            gab = 'ABCDE'[int(r['answer'])]
        except Exception:
            continue
        q = monta(f"unicamp-{r['file_name']}-{r['original_question_num']}", 'Unicamp', ano_de(r['file_name']), m, r['question'], opts, gab, fonte='letmarchezi/unicamp_2019_2025')
        if q:
            out.append(q)
    salvar('unicamp.json', out)

# ---------- BLUEX (USP e Unicamp), só questões sem figura ----------
def bluex():
    out = []
    for r in linhas('portuguese-benchmark-datasets/BLUEX', 'default', 'questions'):
        if r.get('has_associated_images'):
            continue
        alts = r['alternatives'] if isinstance(r['alternatives'], list) else []
        alts = [re.sub(r'^\s*[a-eA-E]\)\s*', '', a) for a in alts]
        parts = str(r['id']).split('_')
        banca = parts[0].upper().replace('UNICAMP', 'Unicamp')
        q = monta(f"bluex-{r['id']}", banca, int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 0, materia_de(r.get('subject')), r['question'], alts, r['answer'], fonte='BLUEX')
        if q:
            out.append(q)
    salvar('usp-unicamp-bluex.json', out)

# ---------- ENEM 2024 (Maritaca) ----------
def enem2024():
    out = []
    for r in linhas('maritaca-ai/enem', '2024', 'train', total=90):
        if r.get('figures'):
            continue
        q = monta(f"enem2024-{r['id']}", 'ENEM', 2024, '', r['question'], r['alternatives'], r['label'], fonte='maritaca-ai/enem')
        if q:
            out.append(q)
    salvar('enem-2024.json', out)

# ---------- 15 mil questões de vestibulares do país inteiro (História e Geografia) ----------
def ceia():
    out = []
    for r in linhas('CEIA-POSITIVO/vestibular-gen_qa', 'default', 'train'):
        o = r['original_question']
        alts = o['alternatives']
        letras = [l for l in 'ABCDE' if alts.get(l) is not None]
        if o['answer'] != 'E' and (alts.get('E') or '').strip().lower().startswith('nenhuma das anteriores'):
            letras = letras[:4]
        titulo = o.get('titulo') or ''
        banca = canon(titulo)
        try:
            tags = ' · '.join(ast.literal_eval(o.get('tags') or '[]'))
        except Exception:
            tags = ''
        m = materia_de(o.get('subject'))
        q = monta(f"ceia-{r['question_index']}", banca, ano_de(titulo), m, o['question'], [alts[l] for l in letras], o['answer'], assunto=tags, dif=o.get('dificuldade', ''), fonte='CEIA-POSITIVO/vestibular-gen_qa')
        if q:
            out.append(q)
    salvar('vestibulares-humanas.json', out)

# ---------- 65 mil questões (todas as matérias): exige conta gratuita no Hugging Face ----------
def grande():
    out = []
    for r in linhas('Fazzioni/Vestibular_65k_sem_imagem', 'default', 'train'):
        if r.get('image'):
            continue
        alts = r['alternativas']
        letras = [l for l in 'ABCDE' if alts.get(l)]
        titulo = r.get('titulo') or ''
        banca = canon(titulo)
        try:
            tags = ' · '.join(ast.literal_eval(r.get('tags') or '[]'))
        except Exception:
            tags = ''
        m = materia_de(r.get('disciplina'))
        q = monta(f"v65k-{r['id']}", banca, ano_de(titulo), m, r['pergunta'], [alts[l] for l in letras], r['resposta'], assunto=tags, dif=r.get('dificuldade', ''), fonte='Fazzioni/Vestibular_65k')
        if q:
            out.append(q)
    salvar('vestibulares-65k.json', out)

if __name__ == '__main__':
    etapas = [unicamp, bluex, enem2024, ceia] + ([grande] if TOKEN else [])
    if '--so' in sys.argv:  # ex.: --so bluex,unicamp
        pedidas = sys.argv[sys.argv.index('--so') + 1].split(',')
        etapas = [f for f in etapas + [grande] if f.__name__ in pedidas]
    for f in etapas:
        print('==', f.__name__, flush=True)
        try:
            f()
        except Exception as e:
            print('!! falhou', f.__name__, repr(e)[:200], flush=True)
    print('PRONTO', flush=True)
