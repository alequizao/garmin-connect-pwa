#!/opt/garmin-sync/venv/bin/python3
"""Envia as rotas GPS das atividades do Garmin para o Traccar (protocolo OsmAnd, porta 5055)
no dispositivo 'garminalex'. Cada atividade é enviada uma única vez (tabela traccar_envios).
Uso: traccar.py [--reenviar <atividade_id>]"""
import sys, json, time, logging, pymysql, requests
sys.path.insert(0, '/opt/garmin-sync'); import conf_garmin as conf
URL = conf.get('traccar', 'osmand', 'http://127.0.0.1:5055/')
logging.basicConfig(filename='/var/log/garmin-traccar.log', level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger()

def main():
    con = conf.db(); cur = con.cursor()
    cur.execute("""CREATE TABLE IF NOT EXISTS traccar_envios (atividade_id INT PRIMARY KEY, device VARCHAR(60), pontos INT, enviados INT, status VARCHAR(20), erro VARCHAR(300),
      enviado TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) DEFAULT CHARSET=utf8mb4""")
    if '--reenviar' in sys.argv: cur.execute("DELETE FROM traccar_envios WHERE atividade_id=%s", (int(sys.argv[sys.argv.index('--reenviar') + 1]),))
    cur.execute("""SELECT a.id, a.usuario_id, a.nome, a.tipo, a.pontos FROM atividades a LEFT JOIN traccar_envios t ON t.atividade_id=a.id
                   WHERE a.pontos IS NOT NULL AND (t.atividade_id IS NULL OR t.status='erro') ORDER BY a.inicio""")
    s = requests.Session()
    for a in cur.fetchall():
        DEVICE = conf.device_do_usuario(cur, a['usuario_id'])
        if not DEVICE: continue  # usuário ainda não gerou o app do relógio (sem dispositivo no Traccar)
        pts = [p for p in json.loads(a['pontos']) if 'lat' in p and 't' in p]
        ok = 0; erro = None; ult = 0
        for i, p in enumerate(pts):
            if p['t'] - ult < 1000 and i != len(pts) - 1: continue  # no máx. 1 ponto por segundo
            ult = p['t']
            q = {'id': DEVICE, 'lat': p['lat'], 'lon': p['lon'], 'timestamp': int(p['t'] / 1000), 'valid': 'true',
                 'activity': a['tipo'], 'atividade': a['nome'], 'atividadeId': a['id']}
            if 'alt' in p: q['altitude'] = p['alt']
            if 'vel' in p: q['speed'] = round(p['vel'] * 1.943844, 2)  # m/s -> nós
            if 'fc' in p: q['heartRate'] = p['fc']
            if 'cad' in p: q['cadence'] = p['cad']
            try:
                r = s.get(URL, params=q, timeout=10)
                if r.status_code == 200: ok += 1
                else: erro = f"HTTP {r.status_code}"
            except Exception as e: erro = str(e)[:300]; time.sleep(2)
        st = 'ok' if ok and not erro else ('parcial' if ok else 'erro')
        cur.execute("REPLACE INTO traccar_envios (atividade_id,device,pontos,enviados,status,erro) VALUES (%s,%s,%s,%s,%s,%s)", (a['id'], DEVICE, len(pts), ok, st, erro))
        log.info(f"atividade {a['id']} ({a['nome']}): {ok}/{len(pts)} pontos -> {DEVICE} [{st}]")
    con.close()

if __name__ == '__main__': main()
