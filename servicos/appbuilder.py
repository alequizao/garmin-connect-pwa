#!/opt/garmin-sync/venv/bin/python3
"""Fila de compilação do app Rastreador Alequizão por dispositivo (aba App do site).
Para cada pedido em relogio_apps com status 'pendente': cria o dispositivo no Traccar (se não existir),
compila o .prg com o token próprio e grava em garmin/app/builds/<token>.prg."""
import sys, os, re, time, shutil, subprocess, logging, pymysql, requests
sys.path.insert(0, '/opt/garmin-sync'); import conf_garmin as conf
FONTE = conf.get('compilador', 'fonte', '/opt/ciq/app')
SAIDA = conf.get('compilador', 'saida', '/www/wwwroot/alequizao.com/garmin/app/builds')
SDK_MANAGER = conf.get('compilador', 'sdk_manager', '/opt/ciq/connect-iq-sdk-manager')
CHAVE = conf.get('compilador', 'chave', '/opt/ciq/dev.der')
FONTE_WALKIE = conf.get('compilador', 'fonte_walkie', '/opt/ciq/walkie')
FONTE_MIMEI = conf.get('compilador', 'fonte_mimei', '/opt/ciq/mimei')
URL_MIMEI = conf.get('app', 'url_mimei', 'https://alequizao.com/garmin/mimei.php')
URL_WALKIE = conf.get('app', 'url_walkie', 'https://alequizao.com/garmin/walkie.php')
TRACCAR = conf.get('traccar', 'api', 'http://127.0.0.1:8082/api')
AUTH = (conf.get('traccar', 'usuario'), conf.get('traccar', 'senha'))
logging.basicConfig(filename='/var/log/garmin-appbuilder.log', level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger()

def sdk():
    return subprocess.run([SDK_MANAGER, 'sdk', 'current-path'], capture_output=True, text=True, env=dict(os.environ, HOME='/root')).stdout.strip()

def traccar_device(nome, unico):
    r = requests.get(f'{TRACCAR}/devices', params={'uniqueId': unico}, auth=AUTH, timeout=15)
    r.raise_for_status()
    if r.json(): return r.json()[0]['id'], False
    r = requests.post(f'{TRACCAR}/devices', json={'name': nome, 'uniqueId': unico, 'category': 'person'}, auth=AUTH, timeout=15)
    r.raise_for_status(); return r.json()['id'], True

def compilar(p):
    tmp = f'/tmp/ciq-build-{p["id"]}'
    shutil.rmtree(tmp, ignore_errors=True); shutil.copytree({'walkie': FONTE_WALKIE, 'mimei': FONTE_MIMEI, 'ben10': '/opt/ciq/ben10', 'omnitrix': '/opt/ciq/omnitrix', 'tama': '/opt/ciq/tama'}.get(p.get('tipo'), FONTE), tmp)
    modelo = p['modelo'] or 'fr165'
    if not os.path.isfile(f'/root/.Garmin/ConnectIQ/Devices/{modelo}/compiler.json'): raise Exception(f'Modelo {modelo} não encontrado')
    mf = f'{tmp}/manifest.xml'; m = open(mf).read()
    m = re.sub(r'<iq:products>.*?</iq:products>', f'<iq:products><iq:product id="{modelo}"/></iq:products>', m, flags=re.S)
    m = re.sub(r'minApiLevel="[0-9.]+"', 'minApiLevel="2.4.0"', m); open(mf, 'w').write(m)
    mc = f'{tmp}/source/' + {'walkie': 'RadioApp.mc', 'mimei': 'MeMimeiApp.mc', 'ben10': 'Ben10App.mc', 'omnitrix': 'OmnitrixApp.mc', 'tama': 'BichinhoApp.mc'}.get(p.get('tipo'), 'RastreadorApp.mc'); s = open(mc).read()
    s = re.sub(r'const TOKEN = "[^"]*";', f'const TOKEN = "{p["token"]}";', s)
    s = re.sub(r'const URL = "[^"]*";', 'const URL = "' + {'walkie': URL_WALKIE, 'mimei': URL_MIMEI}.get(p.get('tipo'), conf.get('app', 'url_relogio', 'https://alequizao.com/garmin/relogio.php')) + '";', s); open(mc, 'w').write(s)
    os.makedirs(SAIDA, exist_ok=True)
    out = f'{SAIDA}/{p["token"]}.prg'
    r = subprocess.run(['java', '-Xms512m', '-Dfile.encoding=UTF-8', '-jar', f'{sdk()}/bin/monkeybrains.jar', '-o', out, '-f', f'{tmp}/monkey.jungle', '-y', CHAVE, '-d', modelo],
                       capture_output=True, text=True, cwd=tmp, env=dict(os.environ, HOME='/root'), timeout=300)
    shutil.rmtree(tmp, ignore_errors=True)
    if 'BUILD SUCCESSFUL' not in r.stdout + r.stderr: raise Exception(((r.stdout + r.stderr).strip().splitlines() or ['erro'])[-1][:250])
    shutil.chown(out, 'www', 'www'); shutil.chown(SAIDA, 'www', 'www')

def main():
    con = conf.db(); cur = con.cursor()
    log.info('builder iniciado')
    while True:
        try:
            con.ping(reconnect=True)
            cur.execute("SELECT * FROM relogio_apps WHERE status='pendente' AND modelo<>'simulador' ORDER BY id LIMIT 1"); p = cur.fetchone()
            if not p: time.sleep(3); continue
            cur.execute("UPDATE relogio_apps SET status='compilando', erro=NULL WHERE id=%s", (p['id'],))
            try:
                did, novo = traccar_device(p['nome'], p['device']) if p.get('tipo') not in ('walkie', 'mimei', 'ben10', 'omnitrix', 'tama') else (None, False)
                compilar(p)
                cur.execute("UPDATE relogio_apps SET status='pronto', traccar_id=%s, pronto_em=NOW() WHERE id=%s", (did, p['id']))
                log.info(f"app {p['id']} ({p['device']}) pronto; traccar {did} {'criado' if novo else 'existente'}")
            except Exception as e:
                cur.execute("UPDATE relogio_apps SET status='erro', erro=%s WHERE id=%s", (str(e)[:300], p['id'])); log.error(f"app {p['id']}: {e}")
        except Exception as e:
            log.error(f'loop: {e}'); time.sleep(10)

if __name__ == '__main__': main()
