#!/opt/garmin-sync/venv/bin/python3
# Garmin Connect PWA · Desenvolvido por Alequizao <alequizao.dev@gmail.com>
# https://github.com/alequizao · © 2026 Alequizao
"""Envia os treinos do relógio para o Strava de cada usuário conectado.
- Com GPS: gera GPX (FC e cadência incluídas) e usa POST /uploads (external_id = uid da atividade).
- Sem GPS: cria atividade manual (POST /activities).
- Nunca reenvia (tabela strava_envios); duplicata do Strava conta como sucesso; atividades vindas do Strava não voltam.
- Rate limit do Strava: 100 req/15 min e 1000/dia — o script pausa quando chega perto.
Uso: strava_upload.py [--simular] [--usuario N] [--limite N] [--gpx-saida DIR]
"""
import sys, os, json, time, random, argparse, datetime, logging, xml.etree.ElementTree as ET
from xml.sax.saxutils import escape
sys.path.insert(0, '/opt/garmin-sync'); import conf_garmin as conf
import requests

logging.basicConfig(filename='/var/log/garmin-strava-upload.log', level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger()
API = 'https://www.strava.com/api/v3'
TIPOS = {'corrida': 'Run', 'trilha': 'TrailRun', 'esteira': 'Run', 'caminhada': 'Walk', 'ciclismo': 'Ride', 'natacao': 'Swim', 'musculacao': 'WeightTraining',
         'hiit': 'HighIntensityIntervalTraining', 'yoga': 'Yoga', 'eliptico': 'Elliptical', 'futebol': 'Soccer', 'remo': 'Rowing', 'surf': 'Surfing', 'patins': 'InlineSkate', 'outro': 'Workout'}
GPX_TIPO = {'Run': 'running', 'TrailRun': 'running', 'Walk': 'walking', 'Ride': 'cycling', 'Swim': 'swimming'}

class Limite:
    """Controla as requisições da janela de 15 min e do dia (com base nos cabeçalhos X-RateLimit do Strava)."""
    def __init__(self): self.uso15 = 0; self.usodia = 0
    def ler(self, r):
        try:
            u = r.headers.get('X-RateLimit-Usage', '')
            if u: self.uso15, self.usodia = map(int, u.split(',')[:2])
        except Exception: pass
    def esperar(self):
        if self.usodia >= 950: raise SystemExit('limite diário do Strava quase atingido — continua amanhã')
        if self.uso15 >= 90:
            agora = datetime.datetime.now(); falta = 900 - ((agora.minute % 15) * 60 + agora.second) + 5
            log.info(f'limite de 15 min do Strava ({self.uso15}) — pausa de {falta}s'); time.sleep(falta); self.uso15 = 0
LIM = Limite()

def tabela(cur):
    cur.execute("""CREATE TABLE IF NOT EXISTS strava_envios (atividade_id INT PRIMARY KEY, usuario_id INT NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'fila',
      strava_id BIGINT NULL, upload_id BIGINT NULL, erro VARCHAR(300) NULL, tentativas INT DEFAULT 0, enviado TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY u (usuario_id, status)) DEFAULT CHARSET=utf8mb4""")

def token(cur, uid, cfg, simular):
    if simular: return 'simulado'
    if time.time() > (cfg.get('expires_at') or 0) - 300:
        r = requests.post('https://www.strava.com/oauth/token', data={'client_id': cfg['client_id'], 'client_secret': cfg['client_secret'], 'grant_type': 'refresh_token', 'refresh_token': cfg['refresh_token']}, timeout=30)
        j = r.json()
        if 'access_token' not in j: raise Exception('não renovou o token do Strava: ' + str(j.get('message', ''))[:120])
        cfg.update(access_token=j['access_token'], refresh_token=j['refresh_token'], expires_at=j['expires_at'])
        cur.execute("UPDATE integracoes SET config=%s WHERE usuario_id=%s AND servico='strava'", (json.dumps(cfg), uid))
    return cfg['access_token']

def gpx(a):
    pts = [p for p in json.loads(a['pontos'] or '[]') if 'lat' in p and 'lon' in p and 't' in p]
    if len(pts) < 2: return None
    tipo = GPX_TIPO.get(TIPOS.get(a['tipo'], 'Workout'), '')
    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<gpx version="1.1" creator="Garmin Connect Alequizao" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">',
           f'<metadata><name>{escape(a["nome"] or "Atividade")}</name><time>{datetime.datetime.fromtimestamp(pts[0]["t"] / 1000, datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}</time></metadata>',
           f'<trk><name>{escape(a["nome"] or "Atividade")}</name>' + (f'<type>{tipo}</type>' if tipo else '') + '<trkseg>']
    for p in pts:
        s = f'<trkpt lat="{p["lat"]:.7f}" lon="{p["lon"]:.7f}">'
        if p.get('alt') is not None: s += f'<ele>{float(p["alt"]):.1f}</ele>'
        s += f'<time>{datetime.datetime.fromtimestamp(p["t"] / 1000, datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}</time>'
        if p.get('fc') or p.get('cad'):
            s += '<extensions><gpxtpx:TrackPointExtension>' + (f'<gpxtpx:hr>{int(p["fc"])}</gpxtpx:hr>' if p.get('fc') else '') + (f'<gpxtpx:cad>{int(p["cad"]) // (2 if tipo in ("running", "walking") else 1)}</gpxtpx:cad>' if p.get('cad') else '') + '</gpxtpx:TrackPointExtension></extensions>'
        out.append(s + '</trkpt>')
    out.append('</trkseg></trk></gpx>')
    xml = '\n'.join(out)
    ET.fromstring(xml.encode())  # garante XML válido
    return xml

def enviar(cur, a, tk, simular, gpx_saida):
    uid_ext = a['uid'] or f'alequizao-{a["id"]}'
    H = {'Authorization': 'Bearer ' + tk}
    corpo = gpx(a)
    if gpx_saida and corpo:
        os.makedirs(gpx_saida, exist_ok=True); open(f'{gpx_saida}/atividade-{a["id"]}.gpx', 'w').write(corpo)
    if simular:
        return ('simulado', None, None, f'{"GPX " + str(len(corpo)) + " bytes" if corpo else "manual (sem GPS)"}')
    LIM.esperar()
    if corpo:
        r = requests.post(f'{API}/uploads', headers=H, timeout=60, files={'file': (f'{uid_ext}.gpx', corpo, 'application/gpx+xml')},
                          data={'data_type': 'gpx', 'external_id': uid_ext, 'name': a['nome'] or '', 'sport_type': TIPOS.get(a['tipo'], 'Workout'), 'description': 'Enviado pelo Garmin Connect Alequizão'})
        LIM.ler(r)
        if r.status_code == 429: return ('fila', None, None, 'limite do Strava — tenta depois')
        j = r.json()
        if r.status_code >= 400: return ('erro', None, None, str(j.get('message') or j)[:300])
        up = j.get('id')
        for _ in range(12):  # o Strava processa o arquivo em alguns segundos
            if j.get('activity_id'): return ('enviado', j['activity_id'], up, None)
            if j.get('error'):
                if 'duplicate' in j['error'].lower():
                    import re; m = re.search(r'/activities/(\d+)', j['error'])
                    return ('enviado', int(m.group(1)) if m else None, up, 'já existia no Strava')
                return ('erro', None, up, j['error'][:300])
            time.sleep(5); LIM.esperar()
            r = requests.get(f'{API}/uploads/{up}', headers=H, timeout=30); LIM.ler(r); j = r.json()
        return ('processando', None, up, 'o Strava ainda está processando')
    ini = a['inicio'].strftime('%Y-%m-%dT%H:%M:%S')
    r = requests.post(f'{API}/activities', headers=H, timeout=30, data={'name': a['nome'] or 'Atividade', 'sport_type': TIPOS.get(a['tipo'], 'Workout'), 'start_date_local': ini,
                      'elapsed_time': int(a['duracao_s'] or 60), 'distance': float(a['distancia_m'] or 0), 'description': f'Enviado pelo Garmin Connect Alequizão ({uid_ext})'})
    LIM.ler(r)
    if r.status_code == 429: return ('fila', None, None, 'limite do Strava — tenta depois')
    j = r.json()
    return ('enviado', j['id'], None, None) if r.status_code < 300 and j.get('id') else ('erro', None, None, str(j.get('message') or j)[:300])

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--simular', action='store_true'); ap.add_argument('--usuario', type=int); ap.add_argument('--limite', type=int, default=40); ap.add_argument('--gpx-saida')
    op = ap.parse_args()
    if not op.simular and '--sem-atraso' not in sys.argv and os.environ.get('SEM_ATRASO') != '1' and not sys.stdin.isatty(): time.sleep(random.uniform(0, 60))
    db = conf.db(); cur = db.cursor(); tabela(cur)
    cur.execute("SELECT usuario_id, config FROM integracoes WHERE servico='strava'" + (" AND usuario_id=%s" if op.usuario else ''), (op.usuario,) if op.usuario else ())
    for r in cur.fetchall():
        uid, cfg = r['usuario_id'], json.loads(r['config'] or '{}')
        if not cfg.get('refresh_token') and not op.simular: continue
        if 'activity:write' not in (cfg.get('escopo') or '') and not op.simular:
            cur.execute("UPDATE strava_envios SET status='erro', erro='Reconecte o Strava para permitir envio de atividades' WHERE usuario_id=%s AND status='fila'", (uid,)); continue
        auto = cfg.get('enviar_auto', True)
        # automático: coloca na fila os treinos novos (depois da conexão); "enviar todos" já enfileira pelo site
        if auto:
            desde = cfg.get('auto_desde') or datetime.datetime.now().strftime('%Y-%m-%d 00:00:00')
            if not cfg.get('auto_desde'):
                cfg['auto_desde'] = desde; cur.execute("UPDATE integracoes SET config=%s WHERE usuario_id=%s AND servico='strava'", (json.dumps(cfg), uid))
            cur.execute("""INSERT IGNORE INTO strava_envios (atividade_id, usuario_id, status) SELECT id, usuario_id, 'fila' FROM atividades
                           WHERE usuario_id=%s AND inicio >= %s AND (uid IS NULL OR uid NOT LIKE 'strava-%%')""", (uid, desde))
        cur.execute("""SELECT a.* FROM strava_envios e JOIN atividades a ON a.id=e.atividade_id WHERE e.usuario_id=%s AND e.status IN ('fila','processando')
                       AND (a.uid IS NULL OR a.uid NOT LIKE 'strava-%%') ORDER BY a.inicio LIMIT %s""", (uid, op.limite))
        fila = cur.fetchall()
        if not fila: continue
        try: tk = token(cur, uid, cfg, op.simular)
        except Exception as e: log.error(f'uid {uid}: {e}'); continue
        for a in fila:
            try: st, sid, up, erro = enviar(cur, a, tk, op.simular, op.gpx_saida)
            except SystemExit as e: log.warning(str(e)); return
            except Exception as e: st, sid, up, erro = 'erro', None, None, str(e)[:300]
            if op.simular: print(f'[simular] uid {uid} atividade {a["id"]} ({a["nome"]}): {erro}'); continue
            cur.execute("UPDATE strava_envios SET status=%s, strava_id=%s, upload_id=COALESCE(%s, upload_id), erro=%s, tentativas=tentativas+1 WHERE atividade_id=%s", (st, sid, up, erro, a['id']))
            log.info(f'uid {uid} atividade {a["id"]} ({a["nome"]}) -> {st} {sid or ""} {erro or ""}')
            time.sleep(1.5)

if __name__ == '__main__':
    lock = '/tmp/garmin-strava-upload.lock'
    if os.path.exists(lock) and time.time() - os.path.getmtime(lock) < 3000 and '--simular' not in sys.argv: sys.exit(0)
    open(lock, 'w').close()
    try: main()
    finally: os.path.exists(lock) and os.remove(lock)
