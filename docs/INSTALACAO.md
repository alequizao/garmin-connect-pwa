# Instalação

Requisitos: servidor Linux com PHP 8.1+ (extensões pdo_mysql, openssl, gd, mbstring), MySQL 5.7+/MariaDB, HTTPS (obrigatório para GPS, Bluetooth, PWA e notificações), Python 3.10+ e, opcionalmente, Node.js 18+, Java 17+ e o Connect IQ SDK.

## 1. Site (PWA)

1. Copie a pasta para o servidor web (ex.: `/var/www/garmin`).
2. `cp config.example.php config.php` e preencha banco, `APP_URL`, SMTP (redefinição de senha) e Traccar (opcional).
3. Crie o banco e rode `php install.php`. O primeiro acesso é criado com senha sorteada, mostrada só no terminal
   (`ADMIN_USUARIO=eu ADMIN_SENHA=minhasenha php install.php` para escolher).
4. `php icons.php` gera os ícones do PWA.
5. O `.htaccess` já bloqueia `config.php`, `install.php` e arquivos de backup (Apache). No Nginx, bloqueie o equivalente.

## 2. Serviços em segundo plano

```bash
sudo mkdir -p /opt/garmin-sync && sudo cp servicos/* /opt/garmin-sync/
python3 -m venv /opt/garmin-sync/venv
/opt/garmin-sync/venv/bin/pip install -r /opt/garmin-sync/requirements.txt
sudo cp docs/garmin-alequizao.ini.example /etc/garmin-alequizao.ini && sudo chmod 600 /etc/garmin-alequizao.ini   # preencha
sudo cp servicos/cron/garmin-sync /etc/cron.d/garmin-sync
```

| Serviço | O que faz | Frequência |
|---|---|---|
| `sync.py --leve` / `sync.py` | atividades e métricas da Garmin | 1 min (leve) · 30 min (completa), com atraso aleatório |
| `extra.py` | HRV, sono detalhado, recordes, previsões, análises das atividades | a cada 3 h |
| `traccar.py` | rotas das atividades → Traccar | 5 min |
| `livetrack_mail.py` + `livetrack.js` | LiveTrack ao vivo (lê convites no e-mail) | 2 min / serviço contínuo |
| `appbuilder.py` | compila os apps do relógio pedidos na aba Apps | serviço contínuo |

LiveTrack (opcional): `cd /opt/garmin-sync && npm install` e `sudo cp servicos/systemd/garmin-livetrack.service /etc/systemd/system/ && sudo systemctl enable --now garmin-livetrack`.

## 3. Apps do relógio (opcional)

1. Instale Java e o [Connect IQ SDK](https://developer.garmin.com/connect-iq/sdk/) (o [connect-iq-sdk-manager-cli](https://github.com/lindell/connect-iq-sdk-manager-cli) funciona sem interface gráfica) e baixe os dispositivos.
2. Gere sua chave de desenvolvedor:
   `openssl genrsa -out dev.pem 4096 && openssl pkcs8 -topk8 -inform PEM -outform DER -in dev.pem -out dev.der -nocrypt`
3. Preencha a seção `[compilador]` do `.ini` (pastas `relogio-connectiq`, `walkie-connectiq`, saída `app/builds`, SDK e chave).
4. `sudo cp servicos/systemd/garmin-appbuilder.service /etc/systemd/system/ && sudo systemctl enable --now garmin-appbuilder`.
5. `app/modelos.json` lista os modelos oferecidos na tela (id, nome e versão da API) — gere a partir de `~/.Garmin/ConnectIQ/Devices/*/compiler.json`.

## 4. Notificações (Web Push)

As chaves VAPID são criadas sozinhas na primeira vez que alguém ativa as notificações. No celular, o Garmin Connect
espelha a notificação do navegador no relógio (Mais → Configurações → Notificações).

## 5. Traccar (opcional)

Informe no `config.php` e no `.ini` a API (usuário administrador) e a porta OsmAnd (padrão 5055). Cada app Rastreador
gerado cria o dispositivo com o identificador escolhido pela pessoa.
