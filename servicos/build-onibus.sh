#!/bin/bash
# Próximo Ônibus · Desenvolvido por Alequizao <alequizao.dev@gmail.com>
# Compila o app Próximo Ônibus para FR55, FR165 e FR165 Music e publica os .prg em alequizao.com/garmin/app/
# (release -r e -O1, como Gasolina/Sono/Força: -O3 derruba app no relógio)
set -e
export HOME=/root
SDK=$(/opt/ciq/connect-iq-sdk-manager sdk current-path 2>/dev/null)
cd /opt/ciq/onibus
for d in ${@:-fr55 fr165 fr165m}; do
  echo "== $d"
  java -Xms512m -Dfile.encoding=UTF-8 -jar "$SDK/bin/monkeybrains.jar" -o /opt/ciq/ProximoOnibus-$d.prg -f monkey.jungle -y /opt/ciq/dev.der -d $d -r -O 1 -w
  cp /opt/ciq/ProximoOnibus-$d.prg /www/wwwroot/alequizao.com/garmin/app/ProximoOnibus-$d.prg
done
chown www:www /www/wwwroot/alequizao.com/garmin/app/ProximoOnibus-*.prg
ls -la /opt/ciq/ProximoOnibus-*.prg
echo OK
