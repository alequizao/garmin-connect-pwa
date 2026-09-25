<?php
// Endpoint do app de relogio "Sono Alequizao".
// O relogio manda ?token=<32 hex>&dias=7 e recebe um JSON enxuto com a ultima noite + historico.
// Tambem responde ao site (sessao) para a tela #/sono.
require_once __DIR__ . '/config.php';


function sonoOut($d) { echo json_encode($d, JSON_UNESCAPED_UNICODE); exit; }
function sonoErro($m, $c = 400) { http_response_code($c); sonoOut(['ok' => false, 'erro' => $m]); }

/** Converte "2026-09-18T03:55:00.0" (GMT) em minutos desde o inicio da noite. */
function sonoTs($s) { return is_numeric($s) ? (int)round($s / 1000) : (int)strtotime($s . ' UTC'); }

/** Resume o JSON cru da Garmin em algo pequeno o bastante para caber no relogio. */
function sonoResumir($data, $j, $completo = false) {
  $d = $j['dailySleepDTO'] ?? [];
  $tot = (int)($d['sleepTimeSeconds'] ?? 0);
  if ($tot <= 0) return null;
  $ini = (int)round(((int)($d['sleepStartTimestampLocal'] ?? 0)) / 1000);
  $fim = (int)round(((int)($d['sleepEndTimestampLocal'] ?? 0)) / 1000);
  $sc  = $d['sleepScores'] ?? [];
  $r = [
    'd'    => $data,
    'ini'  => $ini ? gmdate('H:i', $ini) : '--:--',
    'fim'  => $fim ? gmdate('H:i', $fim) : '--:--',
    'tot'  => $tot,
    'prof' => (int)($d['deepSleepSeconds'] ?? 0),
    'leve' => (int)($d['lightSleepSeconds'] ?? 0),
    'rem'  => (int)($d['remSleepSeconds'] ?? 0),
    'acor' => (int)($d['awakeSleepSeconds'] ?? 0),
    'score'=> isset($sc['overall']['value']) ? (int)$sc['overall']['value'] : null,
    'q'    => (string)($sc['overall']['qualifierKey'] ?? ''),
    'est'  => isset($d['avgSleepStress']) ? (int)round($d['avgSleepStress']) : null,
    'resp' => isset($d['averageRespirationValue']) ? round((float)$d['averageRespirationValue'], 1) : null,
    'resp_min' => isset($d['lowestRespirationValue']) ? round((float)$d['lowestRespirationValue'], 1) : null,
    'resp_max' => isset($d['highestRespirationValue']) ? round((float)$d['highestRespirationValue'], 1) : null,
    'bb'   => isset($j['bodyBatteryChange']) ? (int)$j['bodyBatteryChange'] : null,
    'fcr'  => isset($j['restingHeartRate']) ? (int)$j['restingHeartRate'] : null,
    'hrv'  => isset($j['avgOvernightHrv']) ? (int)round((float)$j['avgOvernightHrv']) : null,
    'hrv_st' => (string)($j['hrvStatus'] ?? ''),
    'inq'  => isset($j['restlessMomentsCount']) ? (int)$j['restlessMomentsCount'] : null,
  ];
  // hipnograma: [inicio em minutos desde o deitar, duracao em minutos, estagio 0=profundo 1=leve 2=rem 3=acordado]
  $base = $ini ?: sonoTs($j['sleepLevels'][0]['startGMT'] ?? 0);
  $gmt0 = (int)round(((int)($d['sleepStartTimestampGMT'] ?? 0)) / 1000);
  $lv = [];
  foreach (($j['sleepLevels'] ?? []) as $s) {
    $a = sonoTs($s['startGMT'] ?? 0); $b = sonoTs($s['endGMT'] ?? 0);
    if ($b <= $a) continue;
    $lv[] = [(int)round(($a - $gmt0) / 60), (int)round(($b - $a) / 60), (int)($s['activityLevel'] ?? 1)];
  }
  $r['lvl'] = $lv;
  // series (FC, estresse, body battery) reduzidas a no maximo 48 pontos
  $red = function ($arr, $campo, $n = 48) {
    $v = [];
    foreach ($arr as $x) { $y = $x[$campo] ?? null; if ($y !== null) $v[] = (int)round($y); }
    $c = count($v); if ($c <= $n) return $v;
    $o = []; for ($i = 0; $i < $n; $i++) $o[] = $v[(int)floor($i * $c / $n)];
    return $o;
  };
  $r['s_fc'] = $red($j['sleepHeartRate'] ?? [], 'value');
  $r['s_est'] = $red($j['sleepStress'] ?? [], 'value');
  $r['s_bb'] = $red($j['sleepBodyBattery'] ?? [], 'value');
  $r['s_resp'] = $red($j['wellnessEpochRespirationDataDTOList'] ?? [], 'respirationValue');
  if ($r['est'] === null && $r['s_est']) $r['est'] = (int)round(array_sum($r['s_est']) / count($r['s_est']));
  if ($r['s_fc']) { $r['fc_min'] = min($r['s_fc']); $r['fc_max'] = max($r['s_fc']); $r['fc_med'] = (int)round(array_sum($r['s_fc']) / count($r['s_fc'])); }
  if ($completo) {
    $r['scores'] = $sc;
    $r['mov'] = array_slice($j['sleepMovement'] ?? [], 0, 600);
  }
  return $r;
}

function sonoNoites($pdo, $uid, $dias, $completo = false) {
  $st = $pdo->prepare("SELECT data, json FROM garmin_dados WHERE usuario_id=? AND tipo='sleep_data' ORDER BY data DESC LIMIT ?");
  $st->bindValue(1, $uid, PDO::PARAM_INT); $st->bindValue(2, max(1, min(120, $dias * 2)), PDO::PARAM_INT); $st->execute();
  $out = [];
  foreach ($st->fetchAll() as $l) {
    $j = json_decode((string)$l['json'], true);
    if (!is_array($j)) continue;
    $r = sonoResumir($l['data'], $j, $completo && count($out) === 0);
    if ($r) $out[] = $r;
    if (count($out) >= $dias) break;
  }
  return $out;
}

