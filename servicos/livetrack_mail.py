#!/opt/garmin-sync/venv/bin/python3
"""Lê o Gmail (alequizao.dev@gmail.com) procurando e-mails de LiveTrack da Garmin
e registra as sessões na tabela livetrack_sessoes (o daemon garmin-livetrack acompanha ao vivo)."""
import imaplib, email, re, random, time, logging, pymysql, sys
logging.basicConfig(filename='/var/log/garmin-livetrack.log', level=logging.INFO, format='%(asctime)s %(levelname)s [mail] %(message)s')
log = logging.getLogger()
sys.path.insert(0, '/opt/garmin-sync'); import conf_garmin as conf
RE = re.compile(r'https://livetrack\.garmin\.com/session/([0-9a-fA-F-]+)/token/([0-9A-Za-z]+)')

def main():
    if '--agora' not in sys.argv: time.sleep(random.uniform(0, 50))  # tempos alternados
    con = conf.db(dict_cursor=False); cur = con.cursor()
    cur.execute("""CREATE TABLE IF NOT EXISTS livetrack_sessoes (id INT AUTO_INCREMENT PRIMARY KEY, usuario_id INT NOT NULL DEFAULT 1, sessao VARCHAR(60) UNIQUE, token VARCHAR(60),
      nome VARCHAR(200), status VARCHAR(20) DEFAULT 'nova', origem VARCHAR(20), pontos INT DEFAULT 0, ultimo_ponto BIGINT, lat DOUBLE, lon DOUBLE, erro VARCHAR(300),
      criado TIMESTAMP DEFAULT CURRENT_TIMESTAMP, atualizado TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) DEFAULT CHARSET=utf8mb4""")
    cur.execute("""CREATE TABLE IF NOT EXISTS livetrack_pontos (id BIGINT AUTO_INCREMENT PRIMARY KEY, sessao_id INT, ts BIGINT, lat DOUBLE, lon DOUBLE, alt DOUBLE, vel DOUBLE,
      fc INT, dist DOUBLE, dur INT, extra TEXT, UNIQUE KEY u (sessao_id, ts)) DEFAULT CHARSET=utf8mb4""")
    m = imaplib.IMAP4_SSL(conf.get('imap', 'servidor', 'imap.gmail.com')); m.login(conf.get('imap', 'usuario'), conf.get('imap', 'senha')); m.select('INBOX')
    since = time.strftime('%d-%b-%Y', time.localtime(time.time() - 86400))
    _, ids = m.search(None, f'(SINCE {since} FROM "garmin")')
    for i in ids[0].split():
        _, d = m.fetch(i, '(RFC822)'); msg = email.message_from_bytes(d[0][1]); txt = ''
        for part in msg.walk():
            if part.get_content_type() in ('text/html', 'text/plain'):
                try: txt += part.get_payload(decode=True).decode(part.get_content_charset() or 'utf-8', 'ignore')
                except Exception: pass
        for sid, tok in set(RE.findall(txt)):
            cur.execute("INSERT IGNORE INTO livetrack_sessoes (usuario_id, sessao, token, nome, origem) VALUES (%s,%s,%s,%s,'email')", (int(conf.get('imap', 'usuario_id', '1')), sid, tok, str(msg.get('Subject', ''))[:200]))
            if cur.rowcount: log.info(f"nova sessão LiveTrack {sid} ({msg.get('Subject')})")
    m.logout(); con.close()

if __name__ == '__main__':
    try: main()
    except Exception as e: log.error(str(e))
