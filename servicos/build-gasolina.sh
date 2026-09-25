#!/bin/bash
# Gasolina Perto · Desenvolvido por Alequizao <alequizao.dev@gmail.com>
# Compila o app Gasolina Perto para FR55, FR165 e FR165 Music e publica os .prg em alequizao.com/garmin/app/
# (release -r e -O1, como Sono/Força/Painel: -O3 derruba app no relógio)
set -e
export HOME=/root
SDK=$(/opt/ciq/connect-iq-sdk-manager sdk current-path 2>/dev/null)
cd /opt/ciq/gasolina
for d in ${@:-fr55 fr165 fr165m}; do
  echo "== $d"
  java -Xms512m -Dfile.encoding=UTF-8 -jar "$SDK/bin/monkeybrains.jar" -o /opt/ciq/GasolinaPerto-$d.prg -f monkey.jungle -y /opt/ciq/dev.der -d $d -r -O 1 -w
  cp /opt/ciq/GasolinaPerto-$d.prg /www/wwwroot/alequizao.com/garmin/app/GasolinaPerto-$d.prg
done
chown www:www /www/wwwroot/alequizao.com/garmin/app/GasolinaPerto-*.prg
ls -la /opt/ciq/GasolinaPerto-*.prg
echo OK
