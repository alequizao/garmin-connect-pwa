# Garmin Connect PWA · Desenvolvido por Alequizao <alequizao.dev@gmail.com>
# https://github.com/alequizao · © 2026 Alequizao. Todos os direitos reservados.
"""Configuração compartilhada dos serviços Python. Lê /etc/garmin-alequizao.ini (fora do repositório).
Modelo: docs/garmin-alequizao.ini.example"""
import configparser, os
import pymysql

ARQ = os.environ.get('GARMIN_CONF', '/etc/garmin-alequizao.ini')
C = configparser.ConfigParser(interpolation=None)
if not C.read(ARQ):
    raise SystemExit(f'Configuração não encontrada: {ARQ} (copie docs/garmin-alequizao.ini.example)')

def get(secao, chave, padrao=None):
    return C.get(secao, chave, fallback=padrao)

def db(dict_cursor=True, **extra):
    return pymysql.connect(host=get('db', 'host', '127.0.0.1'), port=int(get('db', 'port', '3306')), user=get('db', 'usuario'), password=get('db', 'senha'),
                           database=get('db', 'banco'), charset='utf8mb4', autocommit=True,
                           cursorclass=pymysql.cursors.DictCursor if dict_cursor else pymysql.cursors.Cursor, **extra)

def device_do_usuario(cur, uid):
    """uniqueId do Traccar do app de relógio mais recente do usuário (None se ele não gerou nenhum)."""
    cur.execute("SELECT device FROM relogio_apps WHERE usuario_id=%s AND status='pronto' ORDER BY id LIMIT 1", (uid,))
    r = cur.fetchone()
    return (r['device'] if isinstance(r, dict) else r[0]) if r else None
