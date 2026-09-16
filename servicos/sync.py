#!/opt/garmin-sync/venv/bin/python3
"""Sincronizador Garmin Connect + Strava (ponte Haylou) -> banco `garmin` do app alequizao.com/garmin.
Uso: sync.py            -> sincroniza todas as integrações
     sync.py --gatilho  -> só roda se existir /tmp/garmin-sync-agora-<uid> (pedido pelo app)
"""
import sys, os, json, math, glob, time, datetime, logging, traceback, re, xml.etree.ElementTree as ET
import pymysql, requests

sys.path.insert(0, '/opt/garmin-sync'); import conf_garmin as conf
TOKENS = '/opt/garmin-sync/tokens'
LOG = '/var/log/garmin-sync.log'
logging.basicConfig(filename=LOG, level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger()
if os.path.exists(LOG) and os.path.getsize(LOG) > 2_000_000: open(LOG, 'w').close()

TIPOS_GARMIN = {'running': 'corrida', 'trail_running': 'trilha', 'treadmill_running': 'esteira', 'walking': 'caminhada', 'hiking': 'trilha', 'cycling': 'ciclismo', 'road_biking': 'ciclismo', 'mountain_biking': 'ciclismo', 'indoor_cycling': 'ciclismo', 'virtual_ride': 'ciclismo',
  'swimming': 'natacao', 'lap_swimming': 'natacao', 'open_water_swimming': 'natacao', 'strength_training': 'musculacao', 'fitness_equipment': 'musculacao', 'hiit': 'hiit', 'yoga': 'yoga', 'elliptical': 'eliptico', 'soccer': 'futebol', 'rowing': 'remo', 'indoor_rowing': 'remo', 'surfing': 'surf', 'inline_skating': 'patins'}
TIPOS_STRAVA = {'Run': 'corrida', 'TrailRun': 'trilha', 'VirtualRun': 'esteira', 'Walk': 'caminhada', 'Hike': 'trilha', 'Ride': 'ciclismo', 'VirtualRide': 'ciclismo', 'EBikeRide': 'ciclismo', 'MountainBikeRide': 'ciclismo', 'GravelRide': 'ciclismo', 'Swim': 'natacao', 'WeightTraining': 'musculacao', 'Workout': 'hiit', 'HighIntensityIntervalTraining': 'hiit', 'Yoga': 'yoga', 'Elliptical': 'eliptico', 'Soccer': 'futebol', 'Rowing': 'remo', 'Surfing': 'surf', 'InlineSkate': 'patins'}

def hav(a, b):
    R = 6371000; la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    x = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * R * math.atan2(math.sqrt(x), math.sqrt(1 - x))

def metrica(cur, uid, data, tipo, valor, modo='set', extra=None):
    if valor is None: return
    ex = json.dumps(extra, ensure_ascii=False) if extra else None
    if modo == 'max': upd = "valor=GREATEST(valor,VALUES(valor))"
    else: upd = "valor=VALUES(valor)"
    cur.execute(f"INSERT INTO metricas (usuario_id,data,tipo,valor,extra) VALUES (%s,%s,%s,%s,%s) ON DUPLICATE KEY UPDATE {upd}, extra=COALESCE(VALUES(extra),extra)", (uid, data, tipo, valor, ex))

def salvar_atividade(cur, uid, a):
    campos = ['uid', 'tipo', 'nome', 'inicio', 'fim', 'duracao_s', 'tempo_movimento_s', 'distancia_m', 'calorias', 'fc_media', 'fc_max', 'velocidade_media', 'velocidade_max', 'ritmo_medio', 'elevacao_ganho', 'elevacao_perda', 'passos', 'cadencia', 'notas', 'pontos']
    vals = [uid] + [a.get(c) for c in campos]
    upd = ','.join(f"{c}=VALUES({c})" for c in campos if c != 'uid')
    cur.execute(f"INSERT INTO atividades (usuario_id,{','.join(campos)}) VALUES ({','.join(['%s'] * len(vals))}) ON DUPLICATE KEY UPDATE {upd}", vals)
    # agrega calorias/minutos do dia
    data = a['inicio'][:10]
    cur.execute("SELECT COALESCE(SUM(calorias),0) c, COALESCE(SUM(duracao_s),0)/60 mi FROM atividades WHERE usuario_id=%s AND DATE(inicio)=%s", (uid, data)); r = cur.fetchone()
    metrica(cur, uid, data, 'calorias_ativas', int(r['c']), 'max')  # minutos de intensidade vêm da Garmin (moderados + 2x vigorosos), não da duração das atividades

def pontos_de_gpx(gpx_bytes):
    ns = {'g': 'http://www.topografix.com/GPX/1/1', 'tpx': 'http://www.garmin.com/xmlschemas/TrackPointExtension/v1'}
    root = ET.fromstring(gpx_bytes); pts = []
    for tp in root.iter('{http://www.topografix.com/GPX/1/1}trkpt'):
        p = {'lat': float(tp.get('lat')), 'lon': float(tp.get('lon'))}
        e = tp.find('g:ele', ns); t = tp.find('g:time', ns)
        if e is not None: p['alt'] = round(float(e.text), 1)
        if t is not None: p['t'] = int(datetime.datetime.fromisoformat(t.text.replace('Z', '+00:00')).timestamp() * 1000)
        hr = tp.find('.//tpx:hr', ns); cad = tp.find('.//tpx:cad', ns)
        if hr is not None: p['fc'] = int(hr.text)
        if cad is not None: p['cad'] = int(cad.text)
        pts.append(p)
    for i in range(1, len(pts)):
        if 't' in pts[i] and 't' in pts[i - 1]:
            dt = (pts[i]['t'] - pts[i - 1]['t']) / 1000
            if dt > 0: pts[i]['vel'] = round(hav((pts[i - 1]['lat'], pts[i - 1]['lon']), (pts[i]['lat'], pts[i]['lon'])) / dt, 2)
    return pts

def local(dt_str):
    """Garmin devolve 'startTimeLocal' já em hora local do relógio."""
    return dt_str.replace('T', ' ')[:19]

# ---------------- GARMIN ----------------
def sync_garmin(cur, uid, cfg):
    from garminconnect import Garmin
    tokdir = f"{TOKENS}/garmin-{uid}"
    g = Garmin(cfg['email'], cfg['senha'])
    try:
        g.login(tokdir)
    except Exception:
        g = Garmin(cfg['email'], cfg['senha']); g.login(); os.makedirs(tokdir, exist_ok=True); g.garth.dump(tokdir)
    hoje = datetime.date.today()
    n_atv = 0
    LEVE = "--leve" in sys.argv
    for a in g.get_activities(0, 10 if LEVE else 30):
        aid = a['activityId']; u = f"garmin-{aid}"
        cur.execute("SELECT id, pontos IS NOT NULL tem FROM atividades WHERE usuario_id=%s AND uid=%s", (uid, u)); ex = cur.fetchone()
        if ex and ex['tem']: continue
        tipo = TIPOS_GARMIN.get(a.get('activityType', {}).get('typeKey', ''), 'outro')
        pts = None
        try:
            if a.get('hasPolyline'):
                gpx = g.download_activity(aid, dl_fmt=Garmin.ActivityDownloadFormat.GPX); pts = pontos_de_gpx(gpx)
        except Exception as e: log.warning(f"garmin gpx {aid}: {e}")
        dur = int(a.get('duration') or 0); mov = int(a.get('movingDuration') or dur); dist = float(a.get('distance') or 0)
        ini = local(a['startTimeLocal']); fim = (datetime.datetime.fromisoformat(ini) + datetime.timedelta(seconds=dur)).strftime('%Y-%m-%d %H:%M:%S')
        atv = {'uid': u, 'tipo': tipo, 'nome': a.get('activityName') or tipo, 'inicio': ini, 'fim': fim, 'duracao_s': dur, 'tempo_movimento_s': mov, 'distancia_m': round(dist, 1), 'calorias': int(a.get('calories') or 0),
               'fc_media': a.get('averageHR'), 'fc_max': a.get('maxHR'), 'velocidade_media': round((a.get('averageSpeed') or 0) * 3.6, 2) or None, 'velocidade_max': round((a.get('maxSpeed') or 0) * 3.6, 2) or None,
               'ritmo_medio': round(mov / 60 / (dist / 1000), 2) if dist > 50 and mov else None, 'elevacao_ganho': int(a.get('elevationGain') or 0), 'elevacao_perda': int(a.get('elevationLoss') or 0),
               'passos': a.get('steps'), 'cadencia': int(a['averageRunningCadenceInStepsPerMinute']) if a.get('averageRunningCadenceInStepsPerMinute') else None, 'notas': 'Importado da Garmin', 'pontos': json.dumps(pts) if pts else None}
        salvar_atividade(cur, uid, atv); n_atv += 1
    # métricas diárias (últimos 7 dias)
    for i in range(2 if LEVE else 7):
        d = hoje - datetime.timedelta(days=i); ds = d.isoformat()
        try:
            s = g.get_user_summary(ds)
            metrica(cur, uid, ds, 'passos', s.get('totalSteps'), 'max')
            metrica(cur, uid, ds, 'calorias_ativas', s.get('activeKilocalories'), 'max')
            metrica(cur, uid, ds, 'fc_repouso', s.get('restingHeartRate'))
            metrica(cur, uid, ds, 'stress', s.get('averageStressLevel') if (s.get('averageStressLevel') or 0) >= 0 else None)
            metrica(cur, uid, ds, 'minutos_intensidade', (s.get('moderateIntensityMinutes') or 0) + 2 * (s.get('vigorousIntensityMinutes') or 0), 'set')
            metrica(cur, uid, ds, 'andares', s.get('floorsAscended'), 'max')
            bb = s.get('bodyBatteryMostRecentValue') or s.get('bodyBatteryHighestValue')
            metrica(cur, uid, ds, 'energia', bb)
        except Exception as e: log.warning(f"garmin summary {ds}: {e}")
        try:
            sl = g.get_sleep_data(ds).get('dailySleepDTO') or {}
            seg = sl.get('sleepTimeSeconds')
            if seg:
                ex = {'deitou': datetime.datetime.fromtimestamp(sl['sleepStartTimestampLocal'] / 1000, datetime.timezone.utc).strftime('%H:%M') if sl.get('sleepStartTimestampLocal') else None,
                      'acordou': datetime.datetime.fromtimestamp(sl['sleepEndTimestampLocal'] / 1000, datetime.timezone.utc).strftime('%H:%M') if sl.get('sleepEndTimestampLocal') else None,
                      'profundo': round(100 * (sl.get('deepSleepSeconds') or 0) / seg), 'rem': round(100 * (sl.get('remSleepSeconds') or 0) / seg), 'qualidade': (sl.get('sleepScores') or {}).get('overall', {}).get('qualifierKey', '') or 'Garmin', 'score': (sl.get('sleepScores') or {}).get('overall', {}).get('value')}
                metrica(cur, uid, ds, 'sono', round(seg / 3600, 2), 'set', ex)
        except Exception as e: log.warning(f"garmin sono {ds}: {e}")
        try:
            hr = g.get_heart_rates(ds); vals = hr.get('heartRateValues') or []
            cur.execute("SELECT COUNT(*) n FROM fc_amostras WHERE usuario_id=%s AND DATE(ts)=%s", (uid, ds)); tem = cur.fetchone()['n']
            if vals and tem < len([v for v in vals if v[1]]) // 4:
                cur.execute("DELETE FROM fc_amostras WHERE usuario_id=%s AND DATE(ts)=%s", (uid, ds))
                rows = [(uid, datetime.datetime.fromtimestamp(t / 1000).strftime('%Y-%m-%d %H:%M:%S'), b) for t, b in vals[::4] if b]
                cur.executemany("INSERT INTO fc_amostras (usuario_id, ts, bpm) VALUES (%s,%s,%s)", rows)
        except Exception as e: log.warning(f"garmin fc {ds}: {e}")
        try:
            sp = g.get_spo2_data(ds); metrica(cur, uid, ds, 'spo2', sp.get('averageSpO2'))
        except Exception: pass
        try:
            bc = g.get_body_composition(ds); w = (bc.get('totalAverage') or {}).get('weight')
            if w: metrica(cur, uid, ds, 'peso', round(w / 1000, 1)); cur.execute("UPDATE usuarios SET peso_kg=%s WHERE id=%s", (round(w / 1000, 1), uid))
        except Exception: pass
        try:
            hid = g.get_hydration_data(ds); v = hid.get('valueInML')
            if v: metrica(cur, uid, ds, 'agua', v, 'max')
        except Exception: pass
    return f"{n_atv} atividade(s) nova(s), 7 dias de métricas"

# ---------------- STRAVA (Haylou Fun -> Strava) ----------------
def sync_strava(cur, uid, cfg):
    if not cfg.get('refresh_token'): raise Exception('Strava ainda não autorizado — toque em Autorizar no Strava')
    if time.time() > (cfg.get('expires_at') or 0) - 300:
        r = requests.post('https://www.strava.com/oauth/token', data={'client_id': cfg['client_id'], 'client_secret': cfg['client_secret'], 'grant_type': 'refresh_token', 'refresh_token': cfg['refresh_token']}, timeout=30).json()
        if 'access_token' not in r: raise Exception('Falha ao renovar token Strava: ' + json.dumps(r)[:200])
        cfg.update(access_token=r['access_token'], refresh_token=r['refresh_token'], expires_at=r['expires_at'])
        cur.execute("UPDATE integracoes SET config=%s WHERE usuario_id=%s AND servico='strava'", (json.dumps(cfg), uid))
    H = {'Authorization': 'Bearer ' + cfg['access_token']}
    acts = requests.get('https://www.strava.com/api/v3/athlete/activities', headers=H, params={'per_page': 30}, timeout=30).json()
    if isinstance(acts, dict): raise Exception('Strava: ' + json.dumps(acts)[:200])
    n = 0
    for a in acts:
        u = f"strava-{a['id']}"
        # treinos que NÓS enviamos ao Strava não voltam como atividade duplicada
        if str(a.get('external_id') or '').startswith(('garmin-', 'alequizao-', 'gpx-')) or 'Garmin Connect Alequizão' in str(a.get('description') or ''): continue
        cur.execute("SELECT 1 FROM strava_envios WHERE strava_id=%s", (a['id'],))
        if cur.fetchone(): continue
        cur.execute("SELECT id FROM atividades WHERE usuario_id=%s AND uid=%s", (uid, u))
        if cur.fetchone(): continue
        tipo = TIPOS_STRAVA.get(a.get('sport_type') or a.get('type'), 'outro')
        pts = None
        try:
            s = requests.get(f"https://www.strava.com/api/v3/activities/{a['id']}/streams", headers=H, params={'keys': 'time,latlng,altitude,heartrate,velocity_smooth,cadence', 'key_by_type': 'true'}, timeout=60).json()
            if isinstance(s, dict) and ('time' in s or 'latlng' in s):
                t0 = int(datetime.datetime.fromisoformat(a['start_date'].replace('Z', '+00:00')).timestamp() * 1000)
                n_pts = len((s.get('time') or s.get('latlng'))['data']); pts = []
                for i in range(n_pts):
                    p = {'t': t0 + (s['time']['data'][i] * 1000 if 'time' in s else 0)}
                    if 'latlng' in s: p['lat'], p['lon'] = s['latlng']['data'][i]
                    if 'altitude' in s: p['alt'] = round(s['altitude']['data'][i], 1)
                    if 'heartrate' in s: p['fc'] = s['heartrate']['data'][i]
                    if 'velocity_smooth' in s: p['vel'] = round(s['velocity_smooth']['data'][i], 2)
                    if 'cadence' in s and s['cadence']['data'][i]: p['cad'] = s['cadence']['data'][i] * (2 if tipo in ('corrida', 'caminhada', 'trilha') else 1)
                    pts.append(p)
        except Exception as e: log.warning(f"strava streams {a['id']}: {e}")
        dur = int(a.get('elapsed_time') or 0); mov = int(a.get('moving_time') or dur); dist = float(a.get('distance') or 0)
        ini = a['start_date_local'].replace('T', ' ').replace('Z', ''); fim = (datetime.datetime.fromisoformat(ini) + datetime.timedelta(seconds=dur)).strftime('%Y-%m-%d %H:%M:%S')
        atv = {'uid': u, 'tipo': tipo, 'nome': a.get('name') or tipo, 'inicio': ini, 'fim': fim, 'duracao_s': dur, 'tempo_movimento_s': mov, 'distancia_m': round(dist, 1), 'calorias': int(a.get('kilojoules') or 0) or int(a.get('calories') or 0),
               'fc_media': round(a['average_heartrate']) if a.get('average_heartrate') else None, 'fc_max': round(a['max_heartrate']) if a.get('max_heartrate') else None,
               'velocidade_media': round((a.get('average_speed') or 0) * 3.6, 2) or None, 'velocidade_max': round((a.get('max_speed') or 0) * 3.6, 2) or None,
               'ritmo_medio': round(mov / 60 / (dist / 1000), 2) if dist > 50 and mov else None, 'elevacao_ganho': int(a.get('total_elevation_gain') or 0), 'elevacao_perda': 0,
               'passos': None, 'cadencia': round(a['average_cadence'] * 2) if a.get('average_cadence') and tipo in ('corrida', 'caminhada', 'trilha') else None, 'notas': 'Importado do Strava (Haylou)', 'pontos': json.dumps(pts) if pts else None}
        if not atv['calorias']: atv['calorias'] = int((a.get('kilojoules') or 0)) or int(dur / 60 * 7)
        salvar_atividade(cur, uid, atv); n += 1
    return f"{n} atividade(s) nova(s)"

# ---------------- main ----------------
def main():
    gatilho = '--gatilho' in sys.argv
    pedidos = set()
    for f in glob.glob('/tmp/garmin-sync-agora-*'):
        pedidos.add(int(f.rsplit('-', 1)[1])); os.remove(f)
    if gatilho and not pedidos: return
    con = conf.db(); cur = con.cursor()
    cur.execute("SELECT * FROM integracoes"); rows = cur.fetchall()
    for r in rows:
        if gatilho and r['usuario_id'] not in pedidos: continue
        cfg = json.loads(r['config'] or '{}'); uid = r['usuario_id']
        try:
            msg = sync_garmin(cur, uid, cfg) if r['servico'] == 'garmin' else sync_strava(cur, uid, cfg)
            cur.execute("UPDATE integracoes SET status='ok', erro=NULL, ultimo_sync=NOW() WHERE id=%s", (r['id'],))
            log.info(f"uid {uid} {r['servico']}: {msg}")
        except Exception as e:
            err = str(e)[:400]; cur.execute("UPDATE integracoes SET status='erro', erro=%s WHERE id=%s", (err, r['id']))
            log.error(f"uid {uid} {r['servico']}: {err}\n{traceback.format_exc()}")
    con.close()

if __name__ == '__main__':
    lock = '/tmp/garmin-sync.lock'
    if os.path.exists(lock) and time.time() - os.path.getmtime(lock) < 1500: sys.exit(0)
    open(lock, 'w').close()
    try: main()
    finally:
        if os.path.exists(lock): os.remove(lock)
