"""Rotina autonoma para deixar o PC ligado: mantém a leitura por IA rodando e publica o que passar na conferência.
A cada ciclo (padrão 3 h): (1) garante que a leitura do Flash Lite (retomar-transcricao.ps1) esteja viva; (2) roda a 2ª leitura (ler_segunda.py, Hydrogen);
(3) publicar_novos.py (conferência automática + pacote pequeno + git push se houver 40+ questões novas). Não gasta tokens do Claude.
Para quando passam 'dias' dias, ou quando nada novo apareceu em 3 ciclos seguidos E a leitura do Flash Lite terminou. Log: C:\\rotina-banco\\log-noite.txt
Uso: python -P noite.py [--dias 6] [--horas 3]
"""
import json, os, subprocess, sys, time
sys.stdout.reconfigure(encoding='utf-8')
AQUI = os.path.dirname(os.path.abspath(__file__)); BANCO = r'C:\rotina-banco'
dias = float(sys.argv[sys.argv.index('--dias') + 1]) if '--dias' in sys.argv else 6
horas = float(sys.argv[sys.argv.index('--horas') + 1]) if '--horas' in sys.argv else 3
env = dict(os.environ, PYTHONIOENCODING='utf-8', PYTHONPATH=BANCO + r'\libs')
env['GEMINI_KEYS'] = ','.join(x.strip() for x in open(os.path.join(BANCO, '.chaves.txt'), encoding='utf-8') if x.strip())

def log(*a):
    linha = time.strftime('%d/%m %H:%M') + ' ' + ' '.join(str(x) for x in a)
    print(linha, flush=True)
    with open(os.path.join(BANCO, 'log-noite.txt'), 'a', encoding='utf-8') as f: f.write(linha + '\n')

def leitura_viva():
    r = subprocess.run(['powershell', '-NoProfile', '-Command', "(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'ferramentas.transcrever.py' }).Count"], capture_output=True, text=True)
    try: return int((r.stdout.strip() or '0')) > 0
    except Exception: return False

def fila_flash_lite():
    """quantas questoes ainda esperam a 1a leitura (aproximado pelo log do transcrever)."""
    try:
        for l in reversed(open(os.path.join(BANCO, 'log-transcrever.txt'), encoding='utf-8', errors='replace').read().splitlines()):
            if 'a processar' in l or 'PRONTO' in l: return l
    except Exception: pass
    return ''

def rodar(args, nome, limite=3 * 3600):
    try:
        r = subprocess.run([sys.executable, '-P'] + args, capture_output=True, text=True, encoding='utf-8', errors='replace', env=env, timeout=limite)
        saida = [l for l in (r.stdout or '').splitlines() if l.strip()][-3:]
        log(nome, 'rc=%d' % r.returncode, ' | '.join(s[:140] for s in saida)); return r.stdout or ''
    except subprocess.TimeoutExpired:
        log(nome, 'passou do tempo limite'); return ''

fim = time.time() + dias * 86400; sem_novidade = 0; ciclo = 0
log(f'noite.py começou: {dias} dias, ciclo de {horas} h')
while time.time() < fim:
    ciclo += 1
    if not leitura_viva():
        log('leitura do Flash Lite parada: religando')
        subprocess.Popen(['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', os.path.join(BANCO, 'retomar-transcricao.ps1')], creationflags=0x08000000, env=dict(os.environ, LIMITE_DIA='495'))
    rodar([os.path.join(AQUI, 'ler_segunda.py')], 'segunda leitura')
    saida = rodar([os.path.join(AQUI, 'publicar_novos.py')], 'publicar')
    novo = 'push: ok' in saida
    sem_novidade = 0 if novo else sem_novidade + 1
    log(f'ciclo {ciclo}: {"publicou" if novo else "nada novo"} | leitura viva: {leitura_viva()} | {fila_flash_lite()[:90]}')
    if sem_novidade >= 3 and not leitura_viva():
        log('nada novo em 3 ciclos e a leitura terminou: encerrando'); break
    time.sleep(horas * 3600)
log('noite.py terminou')
