#!/opt/garmin-sync/venv/bin/python3
"""Coletor COMPLETO Garmin -> tabela garmin_dados + análise das atividades.
Uso: extra.py [--dias N]   (padrão 3; primeira carga: --dias 90)
"""
import sys, os, json, math, time, datetime, logging, inspect
import pymysql
sys.path.insert(0, '/opt/garmin-sync')
sys.path.insert(0, '/opt/garmin-sync'); import conf_garmin as conf
logging.basicConfig(filename='/var/log/garmin-extra.log', level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger()
PAUSA = 0.35

DIARIOS = ['get_user_summary', 'get_hrv_data', 'get_training_readiness', 'get_morning_training_readiness', 'get_training_status', 'get_max_metrics',
           'get_respiration_data', 'get_stress_data', 'get_all_day_stress', 'get_intensity_minutes_data', 'get_rhr_day', 'get_sleep_data', 'get_spo2_data',
           'get_hydration_data', 'get_floors', 'get_heart_rates', 'get_steps_data', 'get_body_battery_events', 'get_fitnessage_data', 'get_endurance_score',
           'get_hill_score', 'get_all_day_events', 'get_body_composition', 'get_stats_and_body', 'get_lifestyle_logging_data']
GLOBAIS = ['get_user_profile', 'get_userprofile_settings', 'get_devices', 'get_device_last_used', 'get_primary_training_device', 'get_personal_record',
           'get_race_predictions', 'get_lactate_threshold', 'get_earned_badges', 'get_in_progress_badges', 'get_goals', 'get_training_plans',
           'get_heart_rate_zones', 'get_running_tolerance', 'get_cycling_ftp', 'get_workouts', 'get_unit_system']
POR_ATIVIDADE = ['get_activity', 'get_activity_splits', 'get_activity_split_summaries', 'get_activity_typed_splits', 'get_activity_hr_in_timezones',
                 'get_activity_power_in_timezones', 'get_activity_weather', 'get_activity_gear', 'get_activity_exercise_sets']

def garmin(uid, cfg):
    from garminconnect import Garmin
    tokdir = f"/opt/garmin-sync/tokens/garmin-{uid}"
    g = Garmin(cfg['email'], cfg['senha']); g.login(tokdir)
    return g

def guardar(cur, uid, tipo, chave, data, obj):
    if obj in (None, {}, []): return
    cur.execute("INSERT INTO garmin_dados (usuario_id,tipo,chave,data,json) VALUES (%s,%s,%s,%s,%s) ON DUPLICATE KEY UPDATE json=VALUES(json), data=VALUES(data), atualizado=NOW()",
                (uid, tipo, str(chave), data, json.dumps(obj, ensure_ascii=False, default=str)))

def chamar(g, nome, *args):
    f = getattr(g, nome, None)
    if not f: return None
    try:
        n = len([p for p in inspect.signature(f).parameters.values() if p.default is p.empty])
        r = f(*args[:n]) if n else f()
        time.sleep(PAUSA); return r
    except Exception as e:
        msg = str(e)
        if '429' in msg: raise
        log.info(f"{nome}{args[:1]}: {msg[:120]}"); time.sleep(PAUSA); return None

# ---------- análise das atividades a partir dos pontos GPS ----------
def hav(a, b):
    R = 6371000; la1, lo1, la2, lo2 = map(math.radians, (a['lat'], a['lon'], b['lat'], b['lon']))
    x = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * R * math.atan2(math.sqrt(x), math.sqrt(1 - x))

def analisar(a, fcmax, fcrep):
    pts = [p for p in json.loads(a['pontos'] or '[]') if 'lat' in p and 't' in p]
    res = {}
    dur = a['duracao_s'] or 0
    fm = a['fc_media']
    if fm and dur:  # TRIMP de Banister
        hrr = max(0, min(1, (fm - fcrep) / max(1, fcmax - fcrep)))
        res['trimp'] = round(dur / 60 * hrr * 0.64 * math.exp(1.92 * hrr), 1)
    if len(pts) < 20: return res
    pe = a.get('tipo') in ('corrida', 'caminhada', 'trilha', 'esteira')
    vmax = 7.5 if pe else 25
    # distância e tempo EM MOVIMENTO (descarta pausas, lacunas e saltos de GPS)
    cum = [0.0]; tm = [0.0]
    for i in range(1, len(pts)):
        d = hav(pts[i - 1], pts[i]); dt = (pts[i]['t'] - pts[i - 1]['t']) / 1000
        if dt <= 0 or dt > 15 or d / dt > vmax or d / dt < 0.5: cum.append(cum[-1]); tm.append(tm[-1]); continue
        cum.append(cum[-1] + d); tm.append(tm[-1] + dt)
    ts = tm
    best = {}
    for alvo in (400, 1000, 1609, 3000, 5000, 10000, 21097):
        if cum[-1] < alvo: continue
        j = 0; melhor = None
        for i in range(len(pts)):
            while j < len(pts) and cum[j] - cum[i] < alvo: j += 1
            if j >= len(pts): break
            t = ts[j] - ts[i]
            if t > alvo / vmax and (melhor is None or t < melhor): melhor = t
        if melhor: best[str(alvo)] = round(melhor)
    res['melhores'] = best
    # zonas de FC por tempo
    z = [0] * 6; lim = [0.5, 0.6, 0.7, 0.8, 0.9]
    for i in range(1, len(pts)):
        fc = pts[i].get('fc'); dt = (pts[i]['t'] - pts[i - 1]['t']) / 1000
        if not fc or dt <= 0 or dt > 30: continue
        k = sum(1 for l in lim if fc >= fcmax * l); z[k] += dt
    if sum(z): res['zonas_s'] = [round(v) for v in z]
    # desacoplamento (velocidade/FC 1ª metade x 2ª metade)
    meio = cum[-1] / 2; m = next(i for i, c in enumerate(cum) if c >= meio)
    def ef(i0, i1):
        fcs = [p['fc'] for p in pts[i0:i1] if p.get('fc')]; t = ts[i1 - 1] - ts[i0]
        if t < 60: return None
        if not fcs or t <= 0: return None
        return ((cum[i1 - 1] - cum[i0]) / t) / (sum(fcs) / len(fcs))
    e1, e2 = ef(0, m), ef(m, len(pts))
    if e1 and e2: res['desacoplamento_pct'] = round((e1 - e2) / e1 * 100, 1); res['eficiencia'] = round((e1 + e2) / 2 * 60 * 100, 2)  # m/min por 100 bpm
    # deriva de FC entre 1º e último quarto
    q = len(pts) // 4
    f1 = [p['fc'] for p in pts[:q] if p.get('fc')]; f4 = [p['fc'] for p in pts[-q:] if p.get('fc')]
    if f1 and f4: res['deriva_fc'] = round(sum(f4) / len(f4) - sum(f1) / len(f1), 1)
    # parciais por km (ritmo e FC) para splits negativos
    km = []; ini = 0
    for i, c in enumerate(cum):
        if c >= (len(km) + 1) * 1000:
            fcs = [p['fc'] for p in pts[ini:i + 1] if p.get('fc')]
            km.append({'s': round(ts[i] - ts[ini]), 'fc': round(sum(fcs) / len(fcs)) if fcs else None}); ini = i
    res['km'] = km
    if len(km) >= 2:
        h = len(km) // 2; s1 = sum(k['s'] for k in km[:h]); s2 = sum(k['s'] for k in km[h:2 * h])
        res['split_negativo'] = s2 < s1; res['variacao_ritmo_pct'] = round((max(k['s'] for k in km) - min(k['s'] for k in km)) / (sum(k['s'] for k in km) / len(km)) * 100, 1)
    res['hora_inicio'] = pts[0]['t']
    return res

def main():
    dias = int(sys.argv[sys.argv.index('--dias') + 1]) if '--dias' in sys.argv else 3
    con = conf.db(); cur = con.cursor()
    cur.execute("""CREATE TABLE IF NOT EXISTS garmin_dados (id INT AUTO_INCREMENT PRIMARY KEY, usuario_id INT NOT NULL, tipo VARCHAR(60) NOT NULL, chave VARCHAR(40) NOT NULL,
      data DATE NULL, json LONGTEXT, atualizado TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE KEY u (usuario_id,tipo,chave), KEY d (usuario_id,tipo,data)) DEFAULT CHARSET=utf8mb4""")
    cur.execute("SELECT * FROM integracoes WHERE servico='garmin' AND status='ok'")
    for r in cur.fetchall():
        uid = r['usuario_id']; cfg = json.loads(r['config'] or '{}')
        try:
            hoje = datetime.date.today(); SO = '--so-analise' in sys.argv
            g = None if SO else garmin(uid, cfg)
            for nome in ([] if SO else GLOBAIS): guardar(cur, uid, nome[4:], 'atual', hoje, chamar(g, nome, hoje.isoformat()))
            for i in range(0 if SO else dias):
                d = (hoje - datetime.timedelta(days=i)).isoformat()
                for nome in DIARIOS: guardar(cur, uid, nome[4:], d, d, chamar(g, nome, d))
            # atividades
            cur.execute("SELECT u.fc_max, u.fc_repouso, u.nascimento FROM usuarios u WHERE id=%s", (uid,)); u = cur.fetchone()
            idade = (hoje - u['nascimento']).days // 365 if u['nascimento'] else 30
            fcmax = u['fc_max'] or 220 - idade; fcrep = u['fc_repouso'] or 60
            cur.execute("SELECT id, uid, tipo, duracao_s, fc_media, pontos, inicio FROM atividades WHERE usuario_id=%s", (uid,))
            for a in cur.fetchall():
                if not SO and a['uid'] and a['uid'].startswith('garmin-'):
                    aid = a['uid'][7:]
                    cur.execute("SELECT 1 FROM garmin_dados WHERE usuario_id=%s AND tipo='activity' AND chave=%s", (uid, aid))
                    if not cur.fetchone():
                        for nome in POR_ATIVIDADE: guardar(cur, uid, nome[4:], aid, a['inicio'].date(), chamar(g, nome, aid))
                cur.execute("SELECT 1 FROM garmin_dados WHERE usuario_id=%s AND tipo='analise' AND chave=%s", (uid, a['id']))
                if not cur.fetchone():
                    guardar(cur, uid, 'analise', a['id'], a['inicio'].date(), analisar(a, fcmax, fcrep))
            log.info(f"uid {uid}: coleta completa ({dias} dias)")
        except Exception as e:
            log.error(f"uid {uid}: {e}")
    con.close()

if __name__ == '__main__':
    lock = '/tmp/garmin-extra.lock' + ('-analise' if '--so-analise' in sys.argv else '')
    if os.path.exists(lock) and time.time() - os.path.getmtime(lock) < 3600: sys.exit(0)
    open(lock, 'w').close()
    try: main()
    finally: os.path.exists(lock) and os.remove(lock)
