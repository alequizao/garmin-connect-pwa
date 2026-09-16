<?php
// Recebe as leituras do app "Rastreador Alequizão" instalado no Forerunner 165 (Connect IQ)
// e repassa ao Traccar da VPS (dispositivo garminalex, protocolo OsmAnd na porta 5055).
require __DIR__ . '/config.php';
header('Content-Type: application/json; charset=utf-8');

$d = json_decode(file_get_contents('php://input'), true) ?: $_POST;
// cada app baixado na aba App tem o próprio token -> dispositivo no Traccar e dono
$st = db()->prepare("SELECT id, usuario_id, device FROM relogio_apps WHERE token=? LIMIT 1"); $st->execute([preg_replace('/[^0-9a-f]/', '', (string)($d['token'] ?? ''))]);
$app = $st->fetch();
if (!$app) { http_response_code(403); echo '{"ok":false}'; exit; }
define('RELOGIO_DEVICE', $app['device']); define('RELOGIO_UID', (int)$app['usuario_id']); define('RELOGIO_APP', (int)$app['id']);
unset($d['token']);

// tabela relogio_leituras criada na instalação (install.php / aba App)

$num = fn($k) => isset($d[$k]) && is_numeric($d[$k]) ? $d[$k] + 0 : null;
$lat = $num('lat'); $lon = $num('lon');
$agora = time();
$fixTs = $num('fix_t');
// posição nova = fix GPS de até 10 min atrás; senão é a última posição conhecida do relógio (marcada como não válida)
$posNova = $lat !== null && $fixTs && $agora - $fixTs <= 600 && ($num('precisao') ?? 0) >= 2; // precisão 1 = última conhecida (antiga)

$q = ['id' => RELOGIO_DEVICE, 'batt' => $num('bateria'), 'charge' => !empty($d['carregando']) ? 'true' : 'false', 'origem' => $d['origem'] ?? '',
      'heartRate' => $num('fc'), 'steps' => $num('passos'), 'bodyBattery' => $num('body_battery'), 'stress' => $num('estresse'), 'spo2' => $num('spo2'),
      'batteryDays' => $num('bateria_dias'), 'fonte' => 'relogio'];
if ($lat !== null) {
  $q += ['lat' => $lat, 'lon' => $lon, 'altitude' => $num('alt'), 'speed' => $num('vel') !== null ? round($num('vel') * 1.943844, 2) : null, 'bearing' => $num('rumo')];
  $q['timestamp'] = $posNova ? $fixTs : $agora;
  $q['valid'] = $posNova ? 'true' : 'false';
  $q['gpsIdade'] = $fixTs ? $agora - $fixTs : null;
} else {
  // sem posição no relógio: repete a última posição REAL conhecida (relógio, LiveTrack ou atividade), sinalizada como não válida
  $ult = db()->query("SELECT lat, lon FROM relogio_leituras WHERE app_id=" . RELOGIO_APP . " AND lat IS NOT NULL ORDER BY id DESC LIMIT 1")->fetch()
      ?: db()->query("SELECT lat, lon FROM livetrack_sessoes WHERE usuario_id=" . RELOGIO_UID . " AND lat IS NOT NULL ORDER BY atualizado DESC LIMIT 1")->fetch();
  if ($ult) { $q += ['lat' => $ult['lat'], 'lon' => $ult['lon'], 'timestamp' => $agora, 'valid' => 'false', 'posicao' => 'ultima_conhecida']; }
}
$traccar = 'sem_posicao';
if (isset($q['lat'])) {
  $ctx = stream_context_create(['http' => ['timeout' => 5]]);
  $r = @file_get_contents((defined('TRACCAR_OSMAND') ? rtrim(TRACCAR_OSMAND, '/') . '/' : 'http://127.0.0.1:5055/') . '?' . http_build_query(array_filter($q, fn($v) => $v !== null && $v !== '')), false, $ctx);
  $traccar = $r === false ? 'erro' : 'ok';
}
db()->prepare("INSERT INTO relogio_leituras (app_id, usuario_id, relogio_ts, origem, bateria, carregando, bateria_dias, lat, lon, precisao, fix_ts, alt, vel, fc, passos, body_battery, estresse, spo2, traccar, json)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")->execute([RELOGIO_APP, RELOGIO_UID, $num('t'), substr((string)($d['origem'] ?? ''), 0, 20), $num('bateria'), !empty($d['carregando']) ? 1 : 0,
  $num('bateria_dias'), $lat, $lon, $num('precisao'), $fixTs, $num('alt'), $num('vel'), $num('fc'), $num('passos'), $num('body_battery'), $num('estresse'), $num('spo2'), $traccar, json_encode($d)]);
// dados ao vivo do relógio alimentam as métricas do dia (tela Início/Saúde atualiza via AJAX)
$hoje = date('Y-m-d');
$met = db()->prepare("INSERT INTO metricas (usuario_id,data,tipo,valor) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE valor=IF(? = 'max', GREATEST(valor, VALUES(valor)), VALUES(valor))");
foreach ([['passos', 'passos', 'max'], ['body_battery', 'energia', 'set'], ['estresse', 'stress', 'set'], ['spo2', 'spo2', 'set']] as [$k, $tipo, $modo]) {
  if ($num($k) !== null && $num($k) >= 0) $met->execute([RELOGIO_UID, $hoje, $tipo, $num($k), $modo]);
}
if ($num('fc')) db()->prepare("INSERT INTO fc_amostras (usuario_id, ts, bpm) VALUES (?, NOW(), ?)")->execute([RELOGIO_UID, (int)$num('fc')]);
echo json_encode(['ok' => true, 'traccar' => $traccar]);
