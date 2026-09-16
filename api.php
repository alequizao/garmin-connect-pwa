<?php
require __DIR__ . '/config.php';
require_once __DIR__ . '/api_walkie_push.php';
session_set_cookie_params(['lifetime' => 60*60*24*365, 'path' => '/garmin/', 'secure' => true, 'httponly' => true, 'samesite' => 'Lax']);
session_name('garminsess');
session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$acao = $_GET['acao'] ?? $_POST['acao'] ?? '';
$in = [];
if (($_SERVER['CONTENT_TYPE'] ?? '') && str_contains($_SERVER['CONTENT_TYPE'], 'application/json')) {
  $in = json_decode(file_get_contents('php://input'), true) ?: [];
} else { $in = $_POST; }
function out($d, $code = 200) { http_response_code($code); echo json_encode($d, JSON_UNESCAPED_UNICODE); exit; }
function erro($m, $code = 400) { out(['ok' => false, 'erro' => $m], $code); }
function uid() { return (int)($_SESSION['uid'] ?? 0); }
function exigeLogin() { if (!uid()) erro('Não autenticado', 401); }
function hoje() { return date('Y-m-d'); }

try {
switch ($acao) {

case 'registrar': {
  $nome = trim($in['nome'] ?? ''); $email = strtolower(trim($in['email'] ?? '')); $senha = $in['senha'] ?? '';
  if (strlen($nome) < 2 || strlen($email) < 3 || strlen($senha) < 4) erro('Preencha nome, e-mail e senha (mín. 4).');
  $st = db()->prepare("SELECT id FROM usuarios WHERE email=?"); $st->execute([$email]);
  if ($st->fetch()) erro('E-mail já cadastrado.');
  db()->prepare("INSERT INTO usuarios (nome,email,senha) VALUES (?,?,?)")->execute([$nome, $email, password_hash($senha, PASSWORD_DEFAULT)]);
  $id = (int)db()->lastInsertId();
  db()->prepare("INSERT INTO metas (usuario_id) VALUES (?)")->execute([$id]);
  session_regenerate_id(true);
  $_SESSION['uid'] = $id;
  out(['ok' => true, 'usuario' => usuario()]);
}
case 'login': {
  $email = strtolower(trim($in['email'] ?? '')); $senha = $in['senha'] ?? '';
  $ip = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '';
  db()->exec("CREATE TABLE IF NOT EXISTS login_falhas (id INT AUTO_INCREMENT PRIMARY KEY, ip VARCHAR(45), email VARCHAR(190), quando TIMESTAMP DEFAULT CURRENT_TIMESTAMP, KEY k (ip, quando))");
  $st = db()->prepare("SELECT COUNT(*) FROM login_falhas WHERE (ip=? OR email=?) AND quando > NOW() - INTERVAL 15 MINUTE"); $st->execute([$ip, $email]);
  if ($st->fetchColumn() >= 8) erro('Muitas tentativas. Aguarde 15 minutos.', 429);
  $st = db()->prepare("SELECT * FROM usuarios WHERE email=?"); $st->execute([$email]); $u = $st->fetch();
  if (!$u || !password_verify($senha, $u['senha'])) { db()->prepare("INSERT INTO login_falhas (ip, email) VALUES (?,?)")->execute([$ip, $email]); erro('E-mail ou senha inválidos.', 401); }
  db()->prepare("DELETE FROM login_falhas WHERE email=? OR quando < NOW() - INTERVAL 1 DAY")->execute([$email]);
  session_regenerate_id(true);
  $_SESSION['uid'] = (int)$u['id'];
  out(['ok' => true, 'usuario' => usuario()]);
}
case 'senha_esqueci': {
  // sempre responde igual, para não revelar quais e-mails têm conta
  require_once __DIR__ . '/lib_email.php';
  $alvo = strtolower(trim((string)($in['email'] ?? '')));
  $ip = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '';
  $resposta = ['ok' => true, 'msg' => 'Se houver uma conta com esse e-mail, enviamos um link para criar uma nova senha.'];
  if ($alvo === '') erro('Digite o seu e-mail');
  $st = db()->prepare("SELECT COUNT(*) FROM senha_tokens WHERE (ip=? OR usuario_id IN (SELECT id FROM usuarios WHERE email=? OR email_recuperacao=?)) AND criado > NOW() - INTERVAL 1 HOUR");
  $st->execute([$ip, $alvo, $alvo]);
  if ($st->fetchColumn() >= 3) erro('Muitos pedidos. Tente de novo em 1 hora.', 429);
  $st = db()->prepare("SELECT id, nome, email, email_recuperacao FROM usuarios WHERE email=? OR email_recuperacao=? LIMIT 1"); $st->execute([$alvo, $alvo]); $u = $st->fetch();
  $destino = $u ? (filter_var($u['email_recuperacao'], FILTER_VALIDATE_EMAIL) ?: filter_var($u['email'], FILTER_VALIDATE_EMAIL)) : false;
  if ($u && $destino) {
    $token = bin2hex(random_bytes(32));
    db()->prepare("INSERT INTO senha_tokens (usuario_id, hash, ip, expira) VALUES (?,?,?, NOW() + INTERVAL 1 HOUR)")->execute([$u['id'], hash('sha256', $token), $ip]);
    $link = rtrim(APP_URL, '/') . '/?redefinir=' . $token;
    $det = '';
    if (!smtpEnviar($destino, 'Redefinir sua senha — ' . APP_NOME, emailRedefinirSenha(explode(' ', $u['nome'])[0], $link), $det)) {
      error_log('garmin senha_esqueci: ' . $det); erro('Não foi possível enviar o e-mail agora. Tente mais tarde.', 502);
    }
  }
  out($resposta);
}
case 'senha_redefinir': {
  $token = (string)($in['token'] ?? ''); $senha = (string)($in['senha'] ?? '');
  if (!preg_match('/^[0-9a-f]{64}$/', $token)) erro('Link inválido');
  if (strlen($senha) < 6) erro('A nova senha precisa de pelo menos 6 caracteres');
  $st = db()->prepare("SELECT id, usuario_id FROM senha_tokens WHERE hash=? AND usado IS NULL AND expira > NOW()"); $st->execute([hash('sha256', $token)]); $t = $st->fetch();
  if (!$t) erro('Este link expirou ou já foi usado. Peça um novo.', 410);
  db()->prepare("UPDATE usuarios SET senha=? WHERE id=?")->execute([password_hash($senha, PASSWORD_DEFAULT), $t['usuario_id']]);
  db()->prepare("UPDATE senha_tokens SET usado=NOW() WHERE usuario_id=? AND usado IS NULL")->execute([$t['usuario_id']]);
  session_regenerate_id(true); $_SESSION['uid'] = (int)$t['usuario_id'];
  out(['ok' => true, 'usuario' => usuario()]);
}
case 'sair': { $_SESSION = []; session_destroy(); setcookie('garminsess', '', ['expires' => 1, 'path' => '/garmin/', 'secure' => true, 'httponly' => true, 'samesite' => 'Lax']); out(['ok' => true]); }
case 'eu': { if (!uid()) out(['ok' => false, 'logado' => false]); out(['ok' => true, 'logado' => true, 'usuario' => usuario(), 'metas' => metas()]); }

case 'perfil_salvar': {
  exigeLogin();
  $campos = ['nome','nascimento','sexo','altura_cm','peso_kg','fc_max','fc_repouso','email_recuperacao'];
  if (!empty($in['email_recuperacao']) && !filter_var($in['email_recuperacao'], FILTER_VALIDATE_EMAIL)) erro('E-mail de recuperação inválido');
  $set = []; $vals = [];
  foreach ($campos as $c) if (array_key_exists($c, $in)) { $set[] = "$c=?"; $vals[] = ($in[$c] === '' ? null : $in[$c]); }
  if (!empty($in['senha_nova']) && strlen($in['senha_nova']) < 6) erro('A nova senha precisa de pelo menos 6 caracteres');
  if (!empty($in['senha_nova'])) { $set[] = "senha=?"; $vals[] = password_hash($in['senha_nova'], PASSWORD_DEFAULT); }
  if ($set) { $vals[] = uid(); db()->prepare("UPDATE usuarios SET " . implode(',', $set) . " WHERE id=?")->execute($vals); }
  if (isset($in['peso_kg']) && $in['peso_kg'] !== '') salvarMetrica('peso', (float)$in['peso_kg']);
  out(['ok' => true, 'usuario' => usuario()]);
}
case 'metas_salvar': {
  exigeLogin();
  $campos = ['passos','calorias','minutos_intensidade','agua_ml','sono_h','distancia_semana_km','peso_alvo','andares'];
  $set = []; $vals = [];
  foreach ($campos as $c) if (isset($in[$c]) && $in[$c] !== '') { $set[] = "$c=?"; $vals[] = $in[$c]; }
  if ($set) { $vals[] = uid(); db()->prepare("UPDATE metas SET " . implode(',', $set) . " WHERE usuario_id=?")->execute($vals); }
  out(['ok' => true, 'metas' => metas()]);
}

case 'dashboard': {
  exigeLogin();
  $data = preg_match('/^\d{4}-\d{2}-\d{2}$/', $_GET['data'] ?? '') ? $_GET['data'] : hoje();
  $m = metricasDia($data);
  $ini7 = date('Y-m-d', strtotime($data . ' -6 days'));
  $st = db()->prepare("SELECT data, tipo, valor FROM metricas WHERE usuario_id=? AND data BETWEEN ? AND ? AND tipo IN ('passos','agua','sono','calorias_ativas','minutos_intensidade','fc_repouso','peso','stress','energia','spo2','andares')");
  $st->execute([uid(), $ini7, $data]);
  $semana = [];
  foreach ($st as $r) $semana[$r['data']][$r['tipo']] = (float)$r['valor'];
  $st = db()->prepare("SELECT id,tipo,nome,inicio,duracao_s,distancia_m,calorias,fc_media FROM atividades WHERE usuario_id=? AND DATE(inicio)=? ORDER BY inicio DESC");
  $st->execute([uid(), $data]);
  $atvHoje = $st->fetchAll();
  $iniSem = date('Y-m-d', strtotime('monday this week', strtotime($data)));
  $st = db()->prepare("SELECT COUNT(*) n, COALESCE(SUM(distancia_m),0) d, COALESCE(SUM(duracao_s),0) t, COALESCE(SUM(calorias),0) c FROM atividades WHERE usuario_id=? AND DATE(inicio) BETWEEN ? AND ?");
  $st->execute([uid(), $iniSem, $data]); $sem = $st->fetch();
  $st = db()->prepare("SELECT ts,bpm FROM fc_amostras WHERE usuario_id=? AND DATE(ts)=? ORDER BY ts");
  $st->execute([uid(), $data]); $fc = $st->fetchAll();
  $st = db()->prepare("SELECT id,tipo,nome,inicio,duracao_s,distancia_m,calorias,fc_media,ritmo_medio FROM atividades WHERE usuario_id=? ORDER BY inicio DESC LIMIT 1");
  $st->execute([uid()]); $ultima = $st->fetch();
  $st = db()->prepare("SELECT valor, data FROM metricas WHERE usuario_id=? AND tipo='peso' ORDER BY data DESC LIMIT 1"); $st->execute([uid()]); $peso = $st->fetch();
  $st = db()->prepare("SELECT codigo, conquistada FROM medalhas WHERE usuario_id=? ORDER BY conquistada DESC LIMIT 5"); $st->execute([uid()]);
  out(['ok' => true, 'data' => $data, 'hoje' => $m, 'semana' => $semana, 'atividades_hoje' => $atvHoje, 'resumo_semana' => $sem,
       'fc' => $fc, 'ultima' => $ultima, 'peso' => $peso, 'metas' => metas(), 'medalhas' => $st->fetchAll(), 'usuario' => usuario(), 'integracao_garmin' => (bool)(function () { $q = db()->prepare("SELECT 1 FROM integracoes WHERE usuario_id=? AND servico='garmin'"); $q->execute([uid()]); return $q->fetchColumn(); })()]);
}

case 'metrica_salvar': {
  exigeLogin();
  $tipo = $in['tipo'] ?? ''; $valor = (float)($in['valor'] ?? 0); $data = $in['data'] ?? hoje(); $modo = $in['modo'] ?? 'set';
  $permitidos = ['passos','agua','sono','peso','fc_repouso','stress','spo2','energia','calorias_ativas','minutos_intensidade','andares','hidratacao_meta','humor'];
  if (!in_array($tipo, $permitidos)) erro('Tipo inválido');
  $extra = isset($in['extra']) ? json_encode($in['extra'], JSON_UNESCAPED_UNICODE) : null;
  salvarMetrica($tipo, $valor, $data, $modo, $extra);
  if ($tipo === 'peso') db()->prepare("UPDATE usuarios SET peso_kg=? WHERE id=?")->execute([$valor, uid()]);
  if ($tipo === 'fc_repouso') db()->prepare("UPDATE usuarios SET fc_repouso=? WHERE id=?")->execute([(int)$valor, uid()]);
  verificarMedalhas();
  out(['ok' => true, 'hoje' => metricasDia($data), 'novas_medalhas' => $GLOBALS['novasMedalhas'] ?? []]);
}
case 'metricas_listar': {
  exigeLogin();
  $tipo = $_GET['tipo'] ?? 'passos'; $dias = min(365, (int)($_GET['dias'] ?? 30));
  $st = db()->prepare("SELECT data, valor, extra FROM metricas WHERE usuario_id=? AND tipo=? AND data >= DATE_SUB(CURDATE(), INTERVAL ? DAY) ORDER BY data");
  $st->execute([uid(), $tipo, $dias]);
  out(['ok' => true, 'itens' => $st->fetchAll()]);
}
case 'fc_amostra': {
  exigeLogin();
  $amostras = $in['amostras'] ?? [];
  $st = db()->prepare("INSERT INTO fc_amostras (usuario_id, ts, bpm) VALUES (?,?,?)");
  foreach ($amostras as $a) if (!empty($a['bpm'])) $st->execute([uid(), date('Y-m-d H:i:s', (int)($a['ts'] / 1000)), (int)$a['bpm']]);
  out(['ok' => true, 'n' => count($amostras)]);
}
case 'fc_listar': {
  exigeLogin();
  $data = $_GET['data'] ?? hoje();
  $st = db()->prepare("SELECT ts,bpm FROM fc_amostras WHERE usuario_id=? AND DATE(ts)=? ORDER BY ts"); $st->execute([uid(), $data]);
  out(['ok' => true, 'itens' => $st->fetchAll()]);
}

case 'atividades_listar': {
  exigeLogin();
  $tipo = $_GET['tipo'] ?? ''; $lim = min(200, (int)($_GET['limite'] ?? 50)); $off = (int)($_GET['offset'] ?? 0);
  $sql = "SELECT id,uid,tipo,nome,inicio,fim,duracao_s,tempo_movimento_s,distancia_m,calorias,fc_media,fc_max,velocidade_media,velocidade_max,ritmo_medio,elevacao_ganho,elevacao_perda,passos,cadencia,esforco,clima FROM atividades WHERE usuario_id=?";
  $p = [uid()];
  if ($tipo) { $sql .= " AND tipo=?"; $p[] = $tipo; }
  $sql .= " ORDER BY inicio DESC LIMIT $lim OFFSET $off";
  $st = db()->prepare($sql); $st->execute($p);
  out(['ok' => true, 'itens' => $st->fetchAll()]);
}
case 'atividade_obter': {
  exigeLogin();
  $st = db()->prepare("SELECT * FROM atividades WHERE id=? AND usuario_id=?"); $st->execute([(int)$_GET['id'], uid()]);
  $a = $st->fetch(); if (!$a) erro('Não encontrada', 404);
  $a['pontos'] = $a['pontos'] ? json_decode($a['pontos'], true) : [];
  $a['voltas'] = $a['voltas'] ? json_decode($a['voltas'], true) : [];
  out(['ok' => true, 'atividade' => $a]);
}
case 'atividade_salvar': {
  exigeLogin();
  $a = $in['atividade'] ?? $in;
  $pontos = $a['pontos'] ?? [];
  $campos = ['uid','tipo','nome','inicio','fim','duracao_s','tempo_movimento_s','distancia_m','calorias','fc_media','fc_max','velocidade_media','velocidade_max','ritmo_medio','elevacao_ganho','elevacao_perda','passos','cadencia','esforco','notas','clima'];
  $vals = [uid()];
  foreach ($campos as $c) $vals[] = (isset($a[$c]) && $a[$c] !== '') ? $a[$c] : null;
  $vals[] = $pontos ? json_encode($pontos) : null;
  $vals[] = !empty($a['voltas']) ? json_encode($a['voltas']) : null;
  $upd = implode(',', array_map(fn($c) => "$c=VALUES($c)", array_merge($campos, ['pontos','voltas'])));
  $sql = "INSERT INTO atividades (usuario_id," . implode(',', $campos) . ",pontos,voltas) VALUES (" . implode(',', array_fill(0, count($vals), '?')) . ") ON DUPLICATE KEY UPDATE $upd, id=LAST_INSERT_ID(id)";
  db()->prepare($sql)->execute($vals);
  $id = (int)db()->lastInsertId();
  // agrega métricas diárias
  $data = substr($a['inicio'], 0, 10);
  recalcularDia($data);
  verificarMedalhas();
  out(['ok' => true, 'id' => $id, 'novas_medalhas' => $GLOBALS['novasMedalhas'] ?? []]);
}
case 'atividade_editar': {
  exigeLogin();
  $id = (int)($in['id'] ?? 0);
  $set = []; $vals = [];
  foreach (['nome','tipo','notas','esforco','calorias','fc_media','fc_max','distancia_m','duracao_s'] as $c) if (array_key_exists($c, $in)) { $set[] = "$c=?"; $vals[] = $in[$c]; }
  if ($set) { $vals[] = $id; $vals[] = uid(); db()->prepare("UPDATE atividades SET " . implode(',', $set) . " WHERE id=? AND usuario_id=?")->execute($vals); }
  out(['ok' => true]);
}
case 'atividade_excluir': {
  exigeLogin();
  $st = db()->prepare("SELECT inicio FROM atividades WHERE id=? AND usuario_id=?"); $st->execute([(int)$in['id'], uid()]); $a = $st->fetch();
  db()->prepare("DELETE FROM atividades WHERE id=? AND usuario_id=?")->execute([(int)$in['id'], uid()]);
  db()->prepare("DELETE FROM garmin_dados WHERE usuario_id=? AND tipo IN ('rota','analise') AND chave=?")->execute([uid(), (int)$in['id']]);
  if ($a) recalcularDia(substr($a['inicio'], 0, 10));
  out(['ok' => true]);
}
case 'gpx': {
  exigeLogin();
  $st = db()->prepare("SELECT * FROM atividades WHERE id=? AND usuario_id=?"); $st->execute([(int)$_GET['id'], uid()]);
  $a = $st->fetch(); if (!$a) erro('Não encontrada', 404);
  $pts = $a['pontos'] ? json_decode($a['pontos'], true) : [];
  header('Content-Type: application/gpx+xml; charset=utf-8');
  header('Content-Disposition: attachment; filename="atividade-' . $a['id'] . '.gpx"');
  echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
  echo '<gpx version="1.1" creator="Garmin Connect Alequizão" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">' . "\n";
  echo "<metadata><name>" . htmlspecialchars($a['nome']) . "</name><time>" . date('c', strtotime($a['inicio'])) . "</time></metadata>\n<trk><name>" . htmlspecialchars($a['nome']) . "</name><type>" . htmlspecialchars($a['tipo']) . "</type><trkseg>\n";
  foreach ($pts as $p) {
    if (!isset($p['lat'])) continue;
    echo '<trkpt lat="' . $p['lat'] . '" lon="' . $p['lon'] . '">';
    if (isset($p['alt'])) echo '<ele>' . round($p['alt'], 1) . '</ele>';
    if (isset($p['t'])) echo '<time>' . gmdate('Y-m-d\TH:i:s\Z', (int)($p['t'] / 1000)) . '</time>';
    if (!empty($p['fc']) || !empty($p['cad'])) {
      echo '<extensions><gpxtpx:TrackPointExtension>';
      if (!empty($p['fc'])) echo '<gpxtpx:hr>' . (int)$p['fc'] . '</gpxtpx:hr>';
      if (!empty($p['cad'])) echo '<gpxtpx:cad>' . (int)$p['cad'] . '</gpxtpx:cad>';
      echo '</gpxtpx:TrackPointExtension></extensions>';
    }
    echo "</trkpt>\n";
  }
  echo "</trkseg></trk></gpx>";
  exit;
}
case 'importar_gpx': {
  exigeLogin();
  $xml = $in['gpx'] ?? '';
  $x = @simplexml_load_string($xml); if (!$x) erro('GPX inválido');
  $x->registerXPathNamespace('g', 'http://www.topografix.com/GPX/1/1');
  $pts = [];
  foreach ($x->xpath('//g:trkpt') ?: $x->xpath('//trkpt') as $tp) {
    $p = ['lat' => (float)$tp['lat'], 'lon' => (float)$tp['lon']];
    if (isset($tp->ele)) $p['alt'] = (float)$tp->ele;
    if (isset($tp->time)) $p['t'] = strtotime((string)$tp->time) * 1000;
    $ext = $tp->extensions ?? null;
    if ($ext) { $ns = $ext->children('http://www.garmin.com/xmlschemas/TrackPointExtension/v1'); if ($ns && $ns->TrackPointExtension) { if (isset($ns->TrackPointExtension->hr)) $p['fc'] = (int)$ns->TrackPointExtension->hr; if (isset($ns->TrackPointExtension->cad)) $p['cad'] = (int)$ns->TrackPointExtension->cad; } }
    $pts[] = $p;
  }
  if (count($pts) < 2) erro('GPX sem pontos de trilha');
  $dist = 0; $ganho = 0; $perda = 0; $fcs = [];
  for ($i = 1; $i < count($pts); $i++) {
    $dist += haversine($pts[$i-1]['lat'], $pts[$i-1]['lon'], $pts[$i]['lat'], $pts[$i]['lon']);
    if (isset($pts[$i]['alt'], $pts[$i-1]['alt'])) { $d = $pts[$i]['alt'] - $pts[$i-1]['alt']; if ($d > 0) $ganho += $d; else $perda -= $d; }
    if (!empty($pts[$i]['fc'])) $fcs[] = $pts[$i]['fc'];
  }
  $t0 = $pts[0]['t'] ?? time() * 1000; $t1 = end($pts)['t'] ?? $t0;
  $dur = max(1, (int)(($t1 - $t0) / 1000));
  $nome = (string)($x->trk->name ?? 'Atividade importada');
  $tipo = $in['tipo'] ?? 'corrida';
  $u = usuario();
  $a = ['uid' => 'gpx-' . md5($xml), 'tipo' => $tipo, 'nome' => $nome, 'inicio' => date('Y-m-d H:i:s', (int)($t0 / 1000)), 'fim' => date('Y-m-d H:i:s', (int)($t1 / 1000)),
    'duracao_s' => $dur, 'tempo_movimento_s' => $dur, 'distancia_m' => round($dist, 1), 'calorias' => (int)round(($u['peso_kg'] ?: 75) * ($dist / 1000) * ($tipo === 'ciclismo' ? 0.4 : 1.0)),
    'fc_media' => $fcs ? (int)round(array_sum($fcs) / count($fcs)) : null, 'fc_max' => $fcs ? max($fcs) : null,
    'velocidade_media' => round($dist / $dur * 3.6, 2), 'ritmo_medio' => $dist > 0 ? round($dur / 60 / ($dist / 1000), 2) : null,
    'elevacao_ganho' => (int)round($ganho), 'elevacao_perda' => (int)round($perda), 'pontos' => $pts];
  $_POST = []; $in = ['atividade' => $a];
  $GLOBALS['in'] = $in;
  // reaproveita salvar
  $campos = ['uid','tipo','nome','inicio','fim','duracao_s','tempo_movimento_s','distancia_m','calorias','fc_media','fc_max','velocidade_media','velocidade_max','ritmo_medio','elevacao_ganho','elevacao_perda','passos','cadencia','esforco','notas','clima'];
  $vals = [uid()]; foreach ($campos as $c) $vals[] = $a[$c] ?? null; $vals[] = json_encode($pts); $vals[] = null;
  $upd = implode(',', array_map(fn($c) => "$c=VALUES($c)", array_merge($campos, ['pontos','voltas'])));
  db()->prepare("INSERT INTO atividades (usuario_id," . implode(',', $campos) . ",pontos,voltas) VALUES (" . implode(',', array_fill(0, count($vals), '?')) . ") ON DUPLICATE KEY UPDATE $upd, id=LAST_INSERT_ID(id)")->execute($vals);
  recalcularDia(substr($a['inicio'], 0, 10)); verificarMedalhas();
  out(['ok' => true, 'id' => (int)db()->lastInsertId()]);
}

case 'estatisticas': {
  exigeLogin();
  $st = db()->prepare("SELECT tipo, COUNT(*) n, SUM(distancia_m) d, SUM(duracao_s) t, SUM(calorias) c, MAX(distancia_m) maxd, MIN(CASE WHEN distancia_m>=1000 THEN ritmo_medio END) melhor_ritmo, MAX(velocidade_max) vmax, MAX(elevacao_ganho) maxelev FROM atividades WHERE usuario_id=? GROUP BY tipo");
  $st->execute([uid()]); $porTipo = $st->fetchAll();
  $st = db()->prepare("SELECT DATE_FORMAT(inicio,'%Y-%m') mes, COUNT(*) n, SUM(distancia_m) d, SUM(duracao_s) t, SUM(calorias) c FROM atividades WHERE usuario_id=? GROUP BY mes ORDER BY mes DESC LIMIT 12");
  $st->execute([uid()]); $meses = $st->fetchAll();
  $rec = [];
  foreach (['corrida' => [1000, 5000, 10000, 21097, 42195], 'ciclismo' => [10000, 20000, 40000, 100000]] as $tipo => $dists) {
    foreach ($dists as $d) {
      $st = db()->prepare("SELECT id, nome, inicio, duracao_s, distancia_m FROM atividades WHERE usuario_id=? AND tipo=? AND distancia_m>=? ORDER BY (duracao_s*?/distancia_m) ASC LIMIT 1");
      $st->execute([uid(), $tipo, $d, $d]); $r = $st->fetch();
      if ($r) $rec[] = ['tipo' => $tipo, 'distancia' => $d, 'tempo_est' => (int)round($r['duracao_s'] * $d / max(1, $r['distancia_m'])), 'atividade' => $r];
    }
  }
  $st = db()->prepare("SELECT tipo, MIN(id) id, MIN(nome) nome, MIN(inicio) inicio, distancia_m, MIN(duracao_s) duracao_s FROM atividades a WHERE usuario_id=? AND distancia_m > 0 AND distancia_m=(SELECT MAX(distancia_m) FROM atividades b WHERE b.usuario_id=a.usuario_id AND b.tipo=a.tipo) GROUP BY tipo, distancia_m");
  $st->execute([uid()]);
  $st2 = db()->prepare("SELECT MAX(valor) maxpassos FROM metricas WHERE usuario_id=? AND tipo='passos'"); $st2->execute([uid()]);
  $st3 = db()->prepare("SELECT codigo, conquistada FROM medalhas WHERE usuario_id=? ORDER BY conquistada DESC"); $st3->execute([uid()]);
  out(['ok' => true, 'por_tipo' => $porTipo, 'meses' => $meses, 'recordes' => $rec, 'maior_distancia' => $st->fetchAll(), 'max_passos' => $st2->fetchColumn(), 'medalhas' => $st3->fetchAll(), 'catalogo' => catalogoMedalhas()]);
}

case 'dispositivo_salvar': {
  exigeLogin();
  db()->prepare("INSERT INTO dispositivos (usuario_id,nome,tipo,identificador,ultimo_uso) VALUES (?,?,?,?,NOW()) ON DUPLICATE KEY UPDATE nome=VALUES(nome), ultimo_uso=NOW()")
     ->execute([uid(), $in['nome'] ?? 'Sensor', $in['tipo'] ?? 'fc', $in['identificador'] ?? null]);
  out(['ok' => true]);
}
case 'dispositivos': {
  exigeLogin();
  $st = db()->prepare("SELECT * FROM dispositivos WHERE usuario_id=? ORDER BY ultimo_uso DESC"); $st->execute([uid()]);
  out(['ok' => true, 'itens' => $st->fetchAll()]);
}
case 'treinos': {
  exigeLogin();
  $st = db()->prepare("SELECT * FROM treinos WHERE usuario_id=? ORDER BY concluido, agendado, id DESC"); $st->execute([uid()]);
  $it = $st->fetchAll(); foreach ($it as &$t) $t['etapas'] = json_decode($t['etapas'], true);
  out(['ok' => true, 'itens' => $it]);
}
case 'treino_salvar': {
  exigeLogin();
  if (!empty($in['id'])) db()->prepare("UPDATE treinos SET nome=?, tipo=?, etapas=?, agendado=?, concluido=? WHERE id=? AND usuario_id=?")->execute([$in['nome'], $in['tipo'], json_encode($in['etapas'] ?? []), $in['agendado'] ?: null, (int)($in['concluido'] ?? 0), (int)$in['id'], uid()]);
  else db()->prepare("INSERT INTO treinos (usuario_id,nome,tipo,etapas,agendado) VALUES (?,?,?,?,?)")->execute([uid(), $in['nome'], $in['tipo'], json_encode($in['etapas'] ?? []), $in['agendado'] ?: null]);
  out(['ok' => true]);
}
case 'treino_excluir': { exigeLogin(); db()->prepare("DELETE FROM treinos WHERE id=? AND usuario_id=?")->execute([(int)$in['id'], uid()]); out(['ok' => true]); }

case 'integracoes': {
  exigeLogin();
  $st = db()->prepare("SELECT servico, status, erro, ultimo_sync, config FROM integracoes WHERE usuario_id=?"); $st->execute([uid()]);
  $it = []; foreach ($st as $r) { $c = json_decode($r['config'], true) ?: []; $it[$r['servico']] = ['status' => $r['status'], 'erro' => $r['erro'], 'ultimo_sync' => $r['ultimo_sync'], 'email' => $c['email'] ?? null, 'client_id' => $c['client_id'] ?? null, 'atleta' => $c['atleta'] ?? null, 'conectado' => !empty($c['refresh_token']) || !empty($c['email']), 'envio' => str_contains((string)($c['escopo'] ?? ''), 'activity:write'), 'enviar_auto' => (bool)($c['enviar_auto'] ?? true)]; }
  $it['strava_plataforma'] = defined('STRAVA_CLIENT_ID') && STRAVA_CLIENT_ID !== '' && defined('STRAVA_CLIENT_SECRET') && STRAVA_CLIENT_SECRET !== '';
  out(['ok' => true, 'itens' => $it, 'callback' => (defined('APP_URL') ? rtrim(APP_URL, '/') : 'https://' . ($_SERVER['HTTP_HOST'] ?? '') . '/garmin') . '/strava.php']);
}
case 'integracao_salvar': {
  exigeLogin();
  $serv = $in['servico'] ?? ''; if (!in_array($serv, ['garmin', 'strava'])) erro('Serviço inválido');
  $st = db()->prepare("SELECT config FROM integracoes WHERE usuario_id=? AND servico=?"); $st->execute([uid(), $serv]);
  $cfg = ($r = $st->fetch()) ? (json_decode($r['config'], true) ?: []) : [];
  foreach (['email', 'senha', 'client_id', 'client_secret'] as $k) if (isset($in[$k]) && $in[$k] !== '') $cfg[$k] = $in[$k];
  db()->prepare("INSERT INTO integracoes (usuario_id, servico, config, status, erro) VALUES (?,?,?,'pendente',NULL) ON DUPLICATE KEY UPDATE config=VALUES(config), status='pendente', erro=NULL")->execute([uid(), $serv, json_encode($cfg)]);
  out(['ok' => true]);
}
case 'strava_estado': {
  exigeLogin(); $u = uid();
  db()->exec("CREATE TABLE IF NOT EXISTS strava_envios (atividade_id INT PRIMARY KEY, usuario_id INT NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'fila', strava_id BIGINT NULL, upload_id BIGINT NULL, erro VARCHAR(300) NULL, tentativas INT DEFAULT 0, enviado TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, KEY u (usuario_id, status)) DEFAULT CHARSET=utf8mb4");
  $st = db()->prepare("SELECT COUNT(*) FROM atividades WHERE usuario_id=? AND (uid IS NULL OR uid NOT LIKE 'strava-%')"); $st->execute([$u]); $total = (int)$st->fetchColumn();
  $st = db()->prepare("SELECT status, COUNT(*) n FROM strava_envios WHERE usuario_id=? GROUP BY status"); $st->execute([$u]); $por = $st->fetchAll(PDO::FETCH_KEY_PAIR);
  $st = db()->prepare("SELECT e.erro, a.nome FROM strava_envios e JOIN atividades a ON a.id=e.atividade_id WHERE e.usuario_id=? AND e.status='erro' ORDER BY e.enviado DESC LIMIT 3"); $st->execute([$u]);
  out(['ok' => true, 'total' => $total, 'enviados' => (int)($por['enviado'] ?? 0), 'fila' => (int)($por['fila'] ?? 0) + (int)($por['processando'] ?? 0), 'erros' => (int)($por['erro'] ?? 0), 'ultimos_erros' => $st->fetchAll()]);
}
case 'strava_enviar_todos': {
  exigeLogin(); $u = uid();
  $st = db()->prepare("SELECT config FROM integracoes WHERE usuario_id=? AND servico='strava'"); $st->execute([$u]); $c = json_decode((string)$st->fetchColumn(), true) ?: [];
  if (empty($c['refresh_token'])) erro('Conecte o Strava primeiro');
  if (!str_contains((string)($c['escopo'] ?? ''), 'activity:write')) erro('Reconecte o Strava e marque a permissão de enviar atividades');
  db()->prepare("INSERT IGNORE INTO strava_envios (atividade_id, usuario_id, status) SELECT id, usuario_id, 'fila' FROM atividades WHERE usuario_id=? AND (uid IS NULL OR uid NOT LIKE 'strava-%')")->execute([$u]);
  db()->prepare("UPDATE strava_envios SET status='fila', erro=NULL WHERE usuario_id=? AND status='erro'")->execute([$u]);
  @touch('/tmp/garmin-strava-agora-' . $u);
  out(['ok' => true]);
}
case 'strava_auto': {
  exigeLogin();
  $st = db()->prepare("SELECT config FROM integracoes WHERE usuario_id=? AND servico='strava'"); $st->execute([uid()]); $c = json_decode((string)$st->fetchColumn(), true);
  if (!$c) erro('Conecte o Strava primeiro');
  $c['enviar_auto'] = !empty($in['ligado']); if ($c['enviar_auto']) $c['auto_desde'] = $c['auto_desde'] ?? date('Y-m-d 00:00:00');
  db()->prepare("UPDATE integracoes SET config=? WHERE usuario_id=? AND servico='strava'")->execute([json_encode($c), uid()]);
  out(['ok' => true]);
}
case 'integracao_remover': {
  exigeLogin();
  db()->prepare("DELETE FROM integracoes WHERE usuario_id=? AND servico=?")->execute([uid(), $in['servico'] ?? '']);
  out(['ok' => true]);
}
case 'sincronizar_agora': {
  exigeLogin();
  touch('/tmp/garmin-sync-agora-' . uid());
  out(['ok' => true, 'msg' => 'Sincronização solicitada — o servidor executa em até 1 minuto']);
}
case 'dispositivo': {
  exigeLogin(); $u = uid(); $pdo = db();
  $g1 = function ($tipo) use ($pdo, $u) { $st = $pdo->prepare("SELECT json, atualizado FROM garmin_dados WHERE usuario_id=? AND tipo=? ORDER BY atualizado DESC LIMIT 1"); $st->execute([$u, $tipo]); $r = $st->fetch(); return $r ? json_decode($r['json'], true) : null; };
  $st = $pdo->prepare("SELECT status, erro, ultimo_sync FROM integracoes WHERE usuario_id=? AND servico='garmin'"); $st->execute([$u]); $integ = $st->fetch() ?: null;
  $devs = $g1('devices') ?: []; $dev = null;
  foreach ($devs as $d) if (!empty($d['primaryActivityTrackerIndicator'])) $dev = $d;
  $dev = $dev ?: ($devs[0] ?? null);
  $recursos = [];
  if ($dev) foreach ($dev as $k => $v) if ($v === true && (str_ends_with($k, 'Capable') || in_array($k, ['hasOpticalHeartRate', 'wifi', 'bluetoothLowEnergyDevice', 'appSupport']))) $recursos[] = $k;
  $st = $pdo->prepare("SELECT * FROM relogio_leituras WHERE usuario_id=? ORDER BY id DESC LIMIT 1"); $st->execute([$u]); $ult = $st->fetch() ?: null; if ($ult) unset($ult['json']);
  $st = $pdo->prepare("SELECT UNIX_TIMESTAMP(recebido) t, bateria, fc, body_battery, estresse FROM relogio_leituras WHERE usuario_id=? AND recebido > NOW() - INTERVAL 24 HOUR ORDER BY id"); $st->execute([$u]); $serie = $st->fetchAll();
  $st = $pdo->prepare("SELECT COUNT(*) FROM relogio_leituras WHERE usuario_id=? AND recebido > NOW() - INTERVAL 24 HOUR"); $st->execute([$u]); $envios24 = (int)$st->fetchColumn();
  $st = $pdo->prepare("SELECT id, nome, device, modelo, status FROM relogio_apps WHERE usuario_id=? ORDER BY id DESC"); $st->execute([$u]); $apps = $st->fetchAll();
  $st = $pdo->prepare("SELECT COUNT(*) n, MAX(atualizado) ult FROM livetrack_sessoes WHERE usuario_id=?"); $st->execute([$u]); $live = $st->fetch();
  $st = $pdo->prepare("SELECT COUNT(*) FROM atividades WHERE usuario_id=? AND uid LIKE 'garmin-%'"); $st->execute([$u]); $atvGarmin = (int)$st->fetchColumn();
  $lu = $g1('device_last_used');
  out(['ok' => true, 'integracao' => $integ, 'dispositivo' => $dev ? [
      'nome' => $dev['displayName'] ?? $dev['productDisplayName'] ?? 'Relógio Garmin', 'modelo' => $dev['deviceTypeSimpleName'] ?? null, 'imagem' => $dev['imageUrl'] ?? null,
      'firmware' => $dev['currentFirmwareVersion'] ?? null, 'serie' => $dev['serialNumber'] ?? null, 'sku' => $dev['productSku'] ?? null, 'registrado' => isset($dev['registeredDate']) ? intdiv($dev['registeredDate'], 1000) : null,
      'categorias' => $dev['deviceCategories'] ?? [], 'zonas' => $dev['supportedHrZones'] ?? [], 'max_treinos' => $dev['maxWorkoutCount'] ?? null, 'status' => $dev['deviceStatus'] ?? null,
      'ultimo_upload' => isset($lu['lastUsedDeviceUploadTime']) ? intdiv($lu['lastUsedDeviceUploadTime'], 1000) : null, 'recursos' => $recursos] : null,
    'leitura' => $ult, 'serie24h' => $serie, 'envios24h' => $envios24, 'apps' => $apps, 'livetrack' => $live, 'atividades_garmin' => $atvGarmin,
    'previsoes' => $g1('race_predictions'), 'idade_fitness' => $g1('fitnessage_data')]);
}

case 'walkie_canais': {
  exigeLogin();
  $st = db()->prepare("SELECT c.id, c.nome, c.codigo, c.frases, IF(c.criado_por=?, c.chave_api, NULL) chave_api, c.criado_por=? dono, (SELECT COUNT(*) FROM walkie_membros m2 WHERE m2.canal_id=c.id) membros,
    (SELECT COUNT(*) FROM relogio_apps a WHERE a.canal_id=c.id AND a.tipo='walkie' AND a.visto > NOW() - INTERVAL 10 MINUTE) online
    FROM walkie_canais c JOIN walkie_membros m ON m.canal_id=c.id AND m.usuario_id=? ORDER BY c.id DESC");
  $st->execute([uid(), uid(), uid()]); out(['ok' => true, 'itens' => $st->fetchAll()]);
}
case 'walkie_criar': {
  exigeLogin();
  $nome = trim(mb_substr((string)($in['nome'] ?? ''), 0, 40)); if (mb_strlen($nome) < 2) erro('Dê um nome ao canal');
  $codigo = strtoupper(substr(str_replace(['0', 'O', '1', 'I'], '', bin2hex(random_bytes(6))), 0, 6));
  db()->prepare("INSERT INTO walkie_canais (nome, codigo, criado_por, chave_api) VALUES (?,?,?,?)")->execute([$nome, $codigo, uid(), bin2hex(random_bytes(16))]);
  $id = (int)db()->lastInsertId(); db()->prepare("INSERT INTO walkie_membros (canal_id, usuario_id) VALUES (?,?)")->execute([$id, uid()]);
  out(['ok' => true, 'id' => $id, 'codigo' => $codigo]);
}
case 'walkie_entrar': {
  exigeLogin();
  $st = db()->prepare("SELECT id, nome FROM walkie_canais WHERE codigo=?"); $st->execute([strtoupper(trim((string)($in['codigo'] ?? '')))]);
  $c = $st->fetch() ?: erro('Canal não encontrado. Confira o código.', 404);
  db()->prepare("INSERT IGNORE INTO walkie_membros (canal_id, usuario_id) VALUES (?,?)")->execute([$c['id'], uid()]);
  out(['ok' => true, 'id' => (int)$c['id'], 'nome' => $c['nome']]);
}
case 'walkie_frases': {
  exigeLogin(); $canal = (int)($in['canal'] ?? 0); walkieMembro($canal);
  $st = db()->prepare("SELECT criado_por FROM walkie_canais WHERE id=?"); $st->execute([$canal]);
  if ((int)$st->fetchColumn() !== uid()) erro('Só quem criou o canal pode mudar as mensagens', 403);
  $bruto = is_array($in['frases'] ?? null) ? $in['frases'] : explode("\n", (string)($in['frases'] ?? ''));
  $l = array_slice(array_values(array_unique(array_filter(array_map(fn($x) => trim(mb_substr(strip_tags((string)$x), 0, 30)), $bruto)))), 0, 15);
  db()->prepare("UPDATE walkie_canais SET frases=? WHERE id=?")->execute([$l ? implode("\n", $l) : null, $canal]);
  out(['ok' => true, 'frases' => $l]);
}
case 'push_chave': { exigeLogin(); require_once __DIR__ . '/lib_push.php'; out(['ok' => true, 'chave' => push_vapid_public()]); }
case 'push_inscrever': {
  exigeLogin(); $s = $in['inscricao'] ?? [];
  if (empty($s['endpoint']) || empty($s['keys']['p256dh']) || empty($s['keys']['auth']) || !preg_match('~^https://~', $s['endpoint'])) erro('Inscrição inválida');
  db()->prepare("INSERT INTO push_inscricoes (usuario_id, endpoint, p256dh, auth, agente) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE usuario_id=VALUES(usuario_id), p256dh=VALUES(p256dh), auth=VALUES(auth)")
    ->execute([uid(), $s['endpoint'], $s['keys']['p256dh'], $s['keys']['auth'], mb_substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 200)]);
  out(['ok' => true]);
}
case 'push_teste': {
  exigeLogin(); require_once __DIR__ . '/lib_push.php';
  $st = db()->prepare("SELECT endpoint, p256dh, auth FROM push_inscricoes WHERE usuario_id=?"); $st->execute([uid()]); $n = 0;
  foreach ($st->fetchAll() as $s) { $r = push_enviar($s['endpoint'], $s['p256dh'], $s['auth'], json_encode(['titulo' => '📻 Walkie-Talkie Alequizão', 'corpo' => 'Notificações funcionando! Se o Garmin Connect estiver liberado, isto aparece no relógio.', 'tag' => 'walkie-teste'], JSON_UNESCAPED_UNICODE)); if (!empty($r['ok'])) $n++; }
  out(['ok' => true, 'enviados' => $n]);
}
case 'walkie_editar': {
  exigeLogin(); $id = (int)($in['id'] ?? 0); walkieDono($id);
  if (!empty($in['nova_chave'])) { db()->prepare("UPDATE walkie_canais SET chave_api=? WHERE id=?")->execute([bin2hex(random_bytes(16)), $id]); out(['ok' => true]); }
  $nome = trim(mb_substr((string)($in['nome'] ?? ''), 0, 40)); if (mb_strlen($nome) < 2) erro('Dê um nome ao canal');
  db()->prepare("UPDATE walkie_canais SET nome=? WHERE id=?")->execute([$nome, $id]); out(['ok' => true]);
}
case 'walkie_excluir': {
  exigeLogin(); $id = (int)($in['id'] ?? 0); walkieDono($id);
  foreach (["DELETE FROM walkie_mensagens WHERE canal_id=?", "DELETE FROM walkie_membros WHERE canal_id=?", "UPDATE relogio_apps SET canal_id=NULL WHERE canal_id=? AND tipo='walkie'", "DELETE FROM walkie_canais WHERE id=?"] as $q) db()->prepare($q)->execute([$id]);
  out(['ok' => true]);
}
case 'walkie_sair': {
  exigeLogin();
  db()->prepare("DELETE FROM walkie_membros WHERE canal_id=? AND usuario_id=?")->execute([(int)($in['id'] ?? 0), uid()]);
  out(['ok' => true]);
}
case 'walkie_mensagens': {
  exigeLogin(); $canal = (int)($_GET['canal'] ?? 0); walkieMembro($canal);
  $st = db()->prepare("SELECT m.id, m.autor, m.texto, m.sos, m.tipo, m.lat, m.lon, m.origem, m.usuario_id=? meu, m.criado FROM walkie_mensagens m WHERE m.canal_id=? AND m.id>? ORDER BY m.id DESC LIMIT 60");
  $st->execute([uid(), $canal, (int)($_GET['desde'] ?? 0)]);
  out(['ok' => true, 'itens' => array_reverse($st->fetchAll())]);
}
case 'walkie_enviar': {
  exigeLogin(); $canal = (int)($in['canal'] ?? 0); walkieMembro($canal);
  $texto = trim(mb_substr(strip_tags((string)($in['texto'] ?? '')), 0, 120)); if ($texto === '' && ($in['tipo'] ?? '') !== 'atencao') erro('Mensagem vazia');
  $u = usuario();
  $tipo = in_array($in['tipo'] ?? '', ['sos', 'atencao'], true) ? $in['tipo'] : 'texto';
  if ($tipo === 'atencao' && $texto === '') $texto = 'Atenção!';
  $autor = explode(' ', $u['nome'])[0];
  db()->prepare("INSERT INTO walkie_mensagens (canal_id, usuario_id, autor, texto, sos, tipo, origem) VALUES (?,?,?,?,?,?, 'site')")->execute([$canal, uid(), $autor, $texto, $tipo === 'sos' ? 1 : 0, $tipo]);
  walkieNotificar($canal, 0, $autor, $texto, $tipo);
  out(['ok' => true]);
}
case 'walkie_app': {
  exigeLogin(); $canal = (int)($in['canal'] ?? 0); walkieMembro($canal);
  $nome = trim(mb_substr((string)($in['nome'] ?? ''), 0, 20)); if (mb_strlen($nome) < 2) erro('Digite seu nome no walkie-talkie');
  $modelos = array_column(json_decode((string)@file_get_contents(__DIR__ . '/app/modelos.json'), true) ?: [], 'id');
  if (!in_array((string)($in['modelo'] ?? ''), $modelos, true)) erro('Modelo de relógio não suportado');
  db()->prepare("INSERT INTO relogio_apps (usuario_id, nome, device, modelo, token, status, tipo, canal_id) VALUES (?,?,NULL,?,?, 'pendente', 'walkie', ?)")
    ->execute([uid(), $nome, $in['modelo'], bin2hex(random_bytes(16)), $canal]);
  out(['ok' => true, 'id' => (int)db()->lastInsertId()]);
}

case 'mimei_estado': {
  exigeLogin(); require_once __DIR__ . '/lib_mimei.php'; mimeiSemear(uid());
  $st = db()->prepare("SELECT id, nome, qtd, kcal, origem, DATE_FORMAT(criado, '%H:%i') hora FROM mimei_consumo WHERE usuario_id=? AND data=CURDATE() ORDER BY id DESC"); $st->execute([uid()]);
  $apps = db()->prepare("SELECT id, nome, modelo, status, erro, visto FROM relogio_apps WHERE usuario_id=? AND tipo='mimei' ORDER BY id DESC"); $apps->execute([uid()]);
  out(['ok' => true, 'resumo' => mimeiResumo(uid()), 'lanches' => mimeiLanches(uid()), 'consumo' => $st->fetchAll(), 'apps' => $apps->fetchAll(), 'biblioteca' => mimeiBiblioteca()]);
}
case 'mimei_buscar': {
  // busca de calorias estilo YAZIO: TACO (tabela brasileira, por 100 g) + Open Food Facts (produtos de marca)
  exigeLogin();
  $q = trim(mb_substr((string)($_GET['q'] ?? ''), 0, 60)); if (mb_strlen($q) < 2) out(['ok' => true, 'itens' => []]);
  $norm = fn($s) => preg_replace('/[^a-z0-9 ]/', '', strtolower(iconv('UTF-8', 'ASCII//TRANSLIT', $s)));
  $termos = array_filter(explode(' ', $norm($q)));
  $itens = [];
  foreach (json_decode((string)@file_get_contents(__DIR__ . '/dados/taco.json'), true) ?: [] as $t) {
    $n = $norm($t['n']); $ok = true; foreach ($termos as $te) if (!str_contains($n, $te)) { $ok = false; break; }
    if ($ok) $itens[] = ['nome' => $t['n'], 'fonte' => 'TACO', 'kcal100' => (float)$t['k'], 'porcao_g' => null, 'porcao' => null, 'marca' => null, 'img' => null, 'rel' => str_starts_with($n, $termos[array_key_first($termos)] ?? '') ? 0 : 1];
  }
  foreach (json_decode((string)@file_get_contents(__DIR__ . '/dados/populares.json'), true) ?: [] as $t) {
    $n = $norm($t['n']); $ok = true; foreach ($termos as $te) if (!str_contains($n, $te)) { $ok = false; break; }
    if ($ok) $itens[] = ['nome' => $t['n'], 'fonte' => 'Populares', 'kcal100' => (float)$t['k'], 'porcao_g' => (float)$t['pg'], 'porcao' => $t['p'], 'marca' => null, 'img' => null, 'rel' => -1];
  }
  usort($itens, fn($a, $b) => [$a['rel'], mb_strlen($a['nome'])] <=> [$b['rel'], mb_strlen($b['nome'])]);
  $itens = array_slice($itens, 0, 12);
  $cache = sys_get_temp_dir() . '/garmin-off-' . md5($norm($q)) . '.json';
  $off = is_file($cache) && filemtime($cache) > time() - 86400 ? @file_get_contents($cache) : false;
  if ($off === false) {
    $url = 'https://world.openfoodfacts.org/cgi/search.pl?' . http_build_query(['search_terms' => $q, 'search_simple' => 1, 'json' => 1, 'page_size' => 15, 'fields' => 'product_name,brands,nutriments,serving_size,serving_quantity,image_front_small_url', 'sort_by' => 'unique_scans_n']);
    for ($tentativa = 0; $tentativa < 2; $tentativa++) {
      $off = @file_get_contents($url, false, stream_context_create(['http' => ['timeout' => 8, 'header' => "User-Agent: GarminConnectAlequizao/2.3 (alequizao.dev@gmail.com)\r\n"]]));
      if ($off !== false && isset(json_decode($off, true)['products'])) { @file_put_contents($cache, $off); break; }
      $off = false; usleep(400000);
    }
  }
  foreach ((json_decode((string)$off, true)['products'] ?? []) as $p) {
    $k = $p['nutriments']['energy-kcal_100g'] ?? null; if (!$k || empty($p['product_name'])) continue;
    $itens[] = ['nome' => trim($p['product_name']), 'fonte' => 'Open Food Facts', 'kcal100' => round((float)$k, 1), 'porcao_g' => isset($p['serving_quantity']) && is_numeric($p['serving_quantity']) ? (float)$p['serving_quantity'] : null,
      'porcao' => $p['serving_size'] ?? null, 'marca' => $p['brands'] ?? null, 'img' => $p['image_front_small_url'] ?? null];
  }
  out(['ok' => true, 'itens' => array_slice($itens, 0, 25)]);
}

case 'mimei_salvar': {
  exigeLogin(); require_once __DIR__ . '/lib_mimei.php';
  $nome = trim(mb_substr(strip_tags((string)($in['nome'] ?? '')), 0, 40)); $kcal = (int)($in['kcal'] ?? 0);
  if (mb_strlen($nome) < 2) erro('Dê um nome ao lanche'); if ($kcal < 1 || $kcal > 5000) erro('Informe as calorias (1 a 5000)');
  $porcao = trim(mb_substr(strip_tags((string)($in['porcao'] ?? '')), 0, 40)) ?: null;
  $emoji = trim(mb_substr((string)($in['emoji'] ?? ''), 0, 8)) ?: null;
  $id = (int)($in['id'] ?? 0);
  if ($id) {
    $st = db()->prepare("SELECT emoji FROM mimei_lanches WHERE id=? AND usuario_id=?"); $st->execute([$id, uid()]); $atual = $st->fetch() ?: erro('Lanche não encontrado', 404);
    db()->prepare("UPDATE mimei_lanches SET nome=?, porcao=?, kcal=?, emoji=? WHERE id=? AND usuario_id=?")->execute([$nome, $porcao, $kcal, $emoji, $id, uid()]);
    $emojiMudou = $emoji && $emoji !== $atual['emoji'];
  } else {
    $st = db()->prepare("SELECT COALESCE(MAX(ordem),0)+1 FROM mimei_lanches WHERE usuario_id=?"); $st->execute([uid()]);
    db()->prepare("INSERT INTO mimei_lanches (usuario_id, nome, porcao, kcal, emoji, ordem) VALUES (?,?,?,?,?,?)")->execute([uid(), $nome, $porcao, $kcal, $emoji, (int)$st->fetchColumn()]);
    $id = (int)db()->lastInsertId(); $emojiMudou = (bool)$emoji;
  }
  // ícone: imagem enviada > ícone da biblioteca > emoji
  if (!empty($in['biblioteca']) && empty($in['imagem'])) {
    if (!mimeiIconeBiblioteca(uid(), $id, (string)$in['biblioteca'])) erro('Ícone da biblioteca não encontrado');
    db()->prepare("UPDATE mimei_lanches SET emoji=NULL WHERE id=?")->execute([$id]);
  } elseif (!empty($in['imagem']) && preg_match('~^data:image/(png|jpe?g|webp|gif);base64,~', $in['imagem'])) {
    $bin = base64_decode(substr($in['imagem'], strpos($in['imagem'], ',') + 1));
    if (strlen($bin) > 3 * 1024 * 1024) erro('Imagem muito grande (máx. 3 MB)');
    if (!mimeiSalvarPng(uid(), $id, $bin)) erro('Não consegui ler a imagem');
  } elseif ($emojiMudou) {
    if (!mimeiIconeEmoji(uid(), $id, $emoji)) erro('Salvo, mas não achei ícone para esse emoji — envie uma imagem');
  }
  out(['ok' => true, 'id' => $id]);
}
case 'mimei_excluir': {
  exigeLogin(); require_once __DIR__ . '/lib_mimei.php'; $id = (int)($in['id'] ?? 0);
  foreach (glob(mimeiPasta(uid()) . "/$id-*.png") ?: [] as $f) @unlink($f);
  db()->prepare("DELETE FROM mimei_lanches WHERE id=? AND usuario_id=?")->execute([$id, uid()]); out(['ok' => true]);
}
case 'mimei_ordem': {
  exigeLogin(); $st = db()->prepare("UPDATE mimei_lanches SET ordem=? WHERE id=? AND usuario_id=?");
  foreach (array_values((array)($in['ids'] ?? [])) as $i => $id) $st->execute([$i, (int)$id, uid()]);
  out(['ok' => true]);
}
case 'mimei_comi': {
  exigeLogin(); $st = db()->prepare("SELECT id, nome, kcal FROM mimei_lanches WHERE id=? AND usuario_id=?"); $st->execute([(int)($in['id'] ?? 0), uid()]);
  $l = $st->fetch() ?: erro('Lanche não encontrado', 404); $q = in_array((float)($in['qtd'] ?? 1), [0.5, 1.0, 2.0], true) ? (float)$in['qtd'] : 1.0;
  db()->prepare("INSERT INTO mimei_consumo (usuario_id, lanche_id, nome, qtd, kcal, origem, data) VALUES (?,?,?,?,?, 'site', CURDATE())")->execute([uid(), $l['id'], $l['nome'], $q, (int)round($l['kcal'] * $q)]);
  out(['ok' => true]);
}
case 'mimei_consumo_excluir': {
  exigeLogin(); db()->prepare("DELETE FROM mimei_consumo WHERE id=? AND usuario_id=?")->execute([(int)($in['id'] ?? 0), uid()]); out(['ok' => true]);
}
case 'mimei_app': {
  exigeLogin();
  $modelos = array_column(json_decode((string)@file_get_contents(__DIR__ . '/app/modelos.json'), true) ?: [], 'id');
  if (!in_array((string)($in['modelo'] ?? ''), $modelos, true)) erro('Modelo de relógio não suportado');
  db()->prepare("INSERT INTO relogio_apps (usuario_id, nome, device, modelo, token, status, tipo) VALUES (?, 'Me Mimei', NULL, ?, ?, 'pendente', 'mimei')")->execute([uid(), $in['modelo'], bin2hex(random_bytes(16))]);
  out(['ok' => true, 'id' => (int)db()->lastInsertId()]);
}

case 'apps_listar': {
  exigeLogin(); relogioAppsTabela();
  $st = db()->prepare("SELECT a.id, a.nome, a.device, a.modelo, a.status, a.erro, a.criado, a.pronto_em, a.tipo, (SELECT nome FROM walkie_canais c WHERE c.id=a.canal_id) canal, (SELECT MAX(recebido) FROM relogio_leituras r WHERE r.app_id=a.id) ultimo, (SELECT COUNT(*) FROM relogio_leituras r WHERE r.app_id=a.id) envios FROM relogio_apps a WHERE a.usuario_id=? ORDER BY a.id DESC");
  $st->execute([uid()]); out(['ok' => true, 'itens' => $st->fetchAll()]);
}

case 'app_criar': {
  exigeLogin(); relogioAppsTabela();
  $nome = trim((string)($in['nome'] ?? ''));
  $device = strtolower(preg_replace('/[^a-zA-Z0-9_-]/', '', iconv('UTF-8', 'ASCII//TRANSLIT', (string)($in['device'] ?? $nome))));
  $modelos = array_column(json_decode((string)@file_get_contents(__DIR__ . '/app/modelos.json'), true) ?: [], 'id');
  $modelo = (string)($in['modelo'] ?? '');
  if (!in_array($modelo, $modelos, true)) erro('Modelo de relógio não suportado');
  if (mb_strlen($nome) < 2 || mb_strlen($nome) > 60) erro('Digite o nome do dispositivo (2 a 60 letras)');
  if (strlen($device) < 3 || strlen($device) > 40) erro('Identificador do Traccar precisa ter de 3 a 40 letras/números');
  $st = db()->prepare("SELECT usuario_id FROM relogio_apps WHERE device=? LIMIT 1"); $st->execute([$device]); $dono = $st->fetchColumn();
  if ($dono !== false && (int)$dono !== uid()) erro('Esse identificador já é usado por outra pessoa. Escolha outro.');
  // dispositivo que já existe no Traccar e não foi criado por aqui só pode ser usado pelo administrador
  $tr = @file_get_contents(rtrim(TRACCAR_API, '/') . '/devices?uniqueId=' . urlencode($device), false, stream_context_create(['http' => ['header' => 'Authorization: Basic ' . base64_encode(TRACCAR_USUARIO . ':' . TRACCAR_SENHA), 'timeout' => 8]]));
  if ($dono === false && $tr && json_decode($tr, true) && uid() !== 1) erro('Esse identificador já existe no Traccar. Escolha outro.');
  $token = bin2hex(random_bytes(16));
  db()->prepare("INSERT INTO relogio_apps (usuario_id, nome, device, modelo, token, status) VALUES (?,?,?,?,?, 'pendente')")->execute([uid(), $nome, $device, $modelo, $token]);
  out(['ok' => true, 'id' => (int)db()->lastInsertId(), 'device' => $device]);
}

case 'app_status': {
  exigeLogin(); relogioAppsTabela();
  $st = db()->prepare("SELECT id, status, erro, device FROM relogio_apps WHERE id=? AND usuario_id=?"); $st->execute([(int)($_GET['id'] ?? 0), uid()]);
  $r = $st->fetch() ?: erro('Não encontrado', 404); out(['ok' => true] + $r);
}

case 'app_baixar': {
  exigeLogin(); relogioAppsTabela();
  $st = db()->prepare("SELECT nome, device, token, tipo FROM relogio_apps WHERE id=? AND usuario_id=? AND status='pronto'"); $st->execute([(int)($_GET['id'] ?? 0), uid()]);
  $r = $st->fetch() ?: erro('App ainda não está pronto', 404);
  $arq = __DIR__ . '/app/builds/' . $r['token'] . '.prg'; if (!is_file($arq)) erro('Arquivo não encontrado', 404);
  header('Content-Type: application/octet-stream'); header('Content-Length: ' . filesize($arq));
  header('Content-Disposition: attachment; filename="' . ($r['tipo'] === 'mimei' ? 'MeMimei' : ($r['device'] ? 'Rastreador-' . $r['device'] : 'WalkieTalkie-' . preg_replace('/[^A-Za-z0-9]/', '', $r['nome']))) . '.prg"');
  readfile($arq); exit;
}

case 'app_excluir': {
  exigeLogin(); relogioAppsTabela();
  $st = db()->prepare("SELECT token FROM relogio_apps WHERE id=? AND usuario_id=?"); $st->execute([(int)($in['id'] ?? 0), uid()]);
  if ($t = $st->fetchColumn()) { @unlink(__DIR__ . '/app/builds/' . $t . '.prg'); db()->prepare("DELETE FROM relogio_apps WHERE id=?")->execute([(int)$in['id']]); }
  out(['ok' => true]);
}

case 'ao_vivo': {
  exigeLogin(); $u = uid(); $pdo = db();
  $r = null;
  { $st = $pdo->prepare("SELECT id, recebido, origem, bateria, carregando, bateria_dias, lat, lon, precisao, fc, passos, body_battery, estresse, spo2 FROM relogio_leituras WHERE usuario_id=? ORDER BY id DESC LIMIT 1"); $st->execute([$u]); $r = $st->fetch() ?: null; }
  $v = $pdo->prepare("SELECT CONCAT_WS('|', (SELECT COUNT(*) FROM atividades WHERE usuario_id=?), (SELECT MAX(id) FROM atividades WHERE usuario_id=?), (SELECT COUNT(*) FROM metricas WHERE usuario_id=? AND data=CURDATE()), (SELECT SUM(valor) FROM metricas WHERE usuario_id=? AND data>=CURDATE() - INTERVAL 7 DAY), (SELECT MAX(id) FROM fc_amostras WHERE usuario_id=?))");
  $v->execute([$u, $u, $u, $u, $u]);
  $ag = strtotime($r['recebido'] ?? '2000-01-01');
  out(['ok' => true, 'relogio' => $r, 'segundos' => $r ? time() - $ag : null, 'versao' => md5($v->fetchColumn())]);
}

case 'mapa': {
  exigeLogin(); $u = uid(); $pdo = db();
  $tem = fn($t) => true; // tabelas criadas na instalação
  $cands = [];
  $relogio = null;
  if ($tem('relogio_leituras')) {
    $st = $pdo->prepare("SELECT * FROM relogio_leituras WHERE usuario_id=? ORDER BY id DESC LIMIT 1"); $st->execute([$u]); $relogio = $st->fetch() ?: null;
    $st = $pdo->prepare("SELECT lat, lon, COALESCE(fix_ts, UNIX_TIMESTAMP(recebido)) ts, alt, vel, fc FROM relogio_leituras WHERE usuario_id=? AND lat IS NOT NULL ORDER BY id DESC LIMIT 1"); $st->execute([$u]);
    if ($r = $st->fetch()) $cands[] = ['fonte' => 'App no relógio', 'lat' => +$r['lat'], 'lon' => +$r['lon'], 'ts' => (int)$r['ts'], 'fc' => $r['fc']];
  }
  $live = null; $livePts = [];
  if ($tem('livetrack_sessoes')) {
    $live = $pdo->query("SELECT * FROM livetrack_sessoes WHERE usuario_id=$u ORDER BY (status='ativa') DESC, atualizado DESC LIMIT 1")->fetch() ?: null;
    if ($live) {
      $st = $pdo->prepare("SELECT ts, lat, lon, alt, vel, fc, dist FROM livetrack_pontos WHERE sessao_id=? ORDER BY ts"); $st->execute([$live['id']]); $livePts = $st->fetchAll();
      if ($livePts) { $p = end($livePts); $cands[] = ['fonte' => 'LiveTrack', 'lat' => +$p['lat'], 'lon' => +$p['lon'], 'ts' => intdiv((int)$p['ts'], 1000), 'fc' => $p['fc']]; }
    }
  }
  // rotas simplificadas ficam em cache (garmin_dados tipo 'rota') — não relê o JSON completo a cada atualização do mapa
  $st = $pdo->prepare("SELECT a.id, a.nome, a.tipo, a.inicio, a.distancia_m, g.json rota FROM atividades a LEFT JOIN garmin_dados g ON g.usuario_id=a.usuario_id AND g.tipo='rota' AND g.chave=a.id
    WHERE a.usuario_id=? AND a.pontos IS NOT NULL ORDER BY a.inicio DESC LIMIT 300"); $st->execute([$u]);
  $rotas = [];
  foreach ($st->fetchAll() as $i => $a) {
    $c = $a['rota'] ? json_decode($a['rota'], true) : null;
    if (!$c) {
      $p2 = $pdo->prepare("SELECT pontos FROM atividades WHERE id=?"); $p2->execute([$a['id']]);
      $pts = array_values(array_filter(json_decode($p2->fetchColumn(), true) ?: [], fn($p) => isset($p['lat'])));
      if (!$pts) continue;
      $passo = max(1, (int)ceil(count($pts) / 250)); $ll = [];
      foreach ($pts as $k => $p) if ($k % $passo === 0 || $k === count($pts) - 1) $ll[] = [round($p['lat'], 5), round($p['lon'], 5)];
      $f = end($pts); $c = ['ll' => $ll, 'fim' => ['lat' => $f['lat'], 'lon' => $f['lon'], 'ts' => intdiv((int)($f['t'] ?? 0), 1000), 'fc' => $f['fc'] ?? null]];
      $pdo->prepare("INSERT INTO garmin_dados (usuario_id, tipo, chave, data, json) VALUES (?, 'rota', ?, ?, ?) ON DUPLICATE KEY UPDATE json=VALUES(json)")->execute([$u, $a['id'], substr($a['inicio'], 0, 10), json_encode($c)]);
    }
    if ($i === 0) $cands[] = ['fonte' => 'Última atividade (' . $a['nome'] . ')'] + $c['fim'];
    $rotas[] = ['id' => (int)$a['id'], 'nome' => $a['nome'], 'tipo' => $a['tipo'], 'inicio' => $a['inicio'], 'distancia_m' => +$a['distancia_m'], 'll' => $c['ll']];
  }
  usort($cands, fn($a, $b) => $b['ts'] <=> $a['ts']);
  $trilha = [];
  if ($tem('relogio_leituras')) { $st = $pdo->prepare("SELECT lat, lon, COALESCE(fix_ts, UNIX_TIMESTAMP(recebido)) ts FROM relogio_leituras WHERE usuario_id=? AND lat IS NOT NULL AND recebido > NOW() - INTERVAL 24 HOUR ORDER BY id"); $st->execute([$u]); $trilha = $st->fetchAll(); }
  out(['ok' => true, 'atual' => $cands[0] ?? null, 'fontes' => $cands, 'relogio' => $relogio, 'live' => $live, 'live_pontos' => $livePts, 'trilha24h' => $trilha, 'rotas' => $rotas]);
}

case 'livetrack_add': {
  exigeLogin();
  if (!preg_match('~session/([0-9a-fA-F-]+)/token/([0-9A-Za-z]+)~', (string)($in['url'] ?? ''), $m)) erro('Link do LiveTrack inválido');
  db()->prepare("INSERT INTO livetrack_sessoes (usuario_id, sessao, token, origem, status) VALUES (?,?,?,'manual','nova') ON DUPLICATE KEY UPDATE status='nova', token=VALUES(token)")->execute([uid(), $m[1], $m[2]]);
  out(['ok' => true]);
}

case 'relatorios': {
  exigeLogin(); $u = uid(); $pdo = db();
  $us = usuario(); $fcmax = (int)$us['fc_max']; $fcrep = (int)($us['fc_repouso'] ?: 60);
  $raw = function ($tipo, $dias = 400) use ($pdo, $u) { $st = $pdo->prepare("SELECT chave, data, json FROM garmin_dados WHERE usuario_id=? AND tipo=? AND (data IS NULL OR data >= CURDATE() - INTERVAL ? DAY) ORDER BY data"); $st->execute([$u, $tipo, $dias]); $o = []; foreach ($st->fetchAll() as $r) $o[$r['chave']] = ['data' => $r['data'], 'j' => json_decode($r['json'], true)]; return $o; };
  $st = $pdo->prepare("SELECT id, tipo, nome, inicio, duracao_s, tempo_movimento_s, distancia_m, calorias, fc_media, fc_max, ritmo_medio, elevacao_ganho, uid FROM atividades WHERE usuario_id=? ORDER BY inicio"); $st->execute([$u]);
  $atv = $st->fetchAll(); $an = $raw('analise', 100000); $clima = $raw('activity_weather', 100000);
  $pe = ['corrida', 'caminhada', 'trilha', 'esteira'];

  // 1) Carga de treino: TRIMP diário, forma (CTL 42d), fadiga (ATL 7d), equilíbrio (TSB) e ACWR
  $trimpDia = [];
  foreach ($atv as $a) {
    $t = $an[$a['id']]['j']['trimp'] ?? null;
    if ($t === null && $a['fc_media']) { $hrr = max(0, min(1, ($a['fc_media'] - $fcrep) / max(1, $fcmax - $fcrep))); $t = $a['duracao_s'] / 60 * $hrr * 0.64 * exp(1.92 * $hrr); }
    if ($t === null) $t = $a['duracao_s'] / 60 * 0.5;
    $d = substr($a['inicio'], 0, 10); $trimpDia[$d] = ($trimpDia[$d] ?? 0) + $t;
  }
  $carga = []; $ctl = 0; $atl = 0;
  if ($atv) {
    $ini = new DateTime(substr($atv[0]['inicio'], 0, 10)); $fim = new DateTime('today');
    $janela = [];
    for ($d = clone $ini; $d <= $fim; $d->modify('+1 day')) {
      $k = $d->format('Y-m-d'); $v = $trimpDia[$k] ?? 0;
      $ctl += ($v - $ctl) / 42; $atl += ($v - $atl) / 7;
      $janela[] = $v; if (count($janela) > 28) array_shift($janela);
      $aguda = array_sum(array_slice($janela, -7)) / 7; $cronica = array_sum($janela) / max(1, count($janela));
      $carga[] = ['d' => $k, 'trimp' => round($v, 1), 'ctl' => round($ctl, 1), 'atl' => round($atl, 1), 'tsb' => round($ctl - $atl, 1), 'acwr' => $cronica > 0 ? round($aguda / $cronica, 2) : null];
    }
  }

  // 2) Eficiência aeróbica, desacoplamento, deriva e clima por corrida
  $corridas = [];
  foreach ($atv as $a) {
    if (!in_array($a['tipo'], $pe)) continue; $x = $an[$a['id']]['j'] ?? [];
    $w = $clima[substr($a['uid'] ?? '', 7)]['j'] ?? null;
    $corridas[] = ['id' => (int)$a['id'], 'nome' => $a['nome'], 'data' => $a['inicio'], 'km' => round($a['distancia_m'] / 1000, 2), 'ritmo' => $a['ritmo_medio'] ? +$a['ritmo_medio'] : null, 'fc' => $a['fc_media'] ? (int)$a['fc_media'] : null,
      'eficiencia' => $x['eficiencia'] ?? null, 'desacoplamento' => $x['desacoplamento_pct'] ?? null, 'deriva' => $x['deriva_fc'] ?? null, 'split_negativo' => $x['split_negativo'] ?? null, 'variacao' => $x['variacao_ritmo_pct'] ?? null,
      'temp_c' => isset($w['temp']) ? round(($w['temp'] - 32) * 5 / 9, 1) : null, 'umidade' => $w['relativeHumidity'] ?? null, 'sensacao_c' => isset($w['apparentTemp']) ? round(($w['apparentTemp'] - 32) * 5 / 9, 1) : null, 'trimp' => $x['trimp'] ?? null];
  }

  // 3) Melhores esforços REAIS medidos no GPS (não estimados) + evolução
  $melhores = [];
  foreach ($atv as $a) foreach (($an[$a['id']]['j']['melhores'] ?? []) as $dist => $seg) {
    if (!in_array($a['tipo'], $pe)) continue;
    $melhores[$dist][] = ['seg' => $seg, 'data' => $a['inicio'], 'id' => (int)$a['id'], 'nome' => $a['nome']];
  }
  $recordes = [];
  foreach ($melhores as $dist => $l) { usort($l, fn($a, $b) => $a['seg'] <=> $b['seg']); $recordes[] = ['dist' => (int)$dist, 'melhor' => $l[0], 'tentativas' => count($l), 'historico' => array_values(array_map(fn($x) => ['data' => substr($x['data'], 0, 10), 'seg' => $x['seg']], $melhores[$dist]))]; }
  usort($recordes, fn($a, $b) => $a['dist'] <=> $b['dist']);

  // 4) Tempo em zonas de FC por semana (últimas 12)
  $zonasSem = [];
  foreach ($atv as $a) { $z = $an[$a['id']]['j']['zonas_s'] ?? null; if (!$z) continue; $w = date('o-\SW', strtotime($a['inicio'])); foreach ($z as $i => $s) $zonasSem[$w][$i] = ($zonasSem[$w][$i] ?? 0) + $s; }
  ksort($zonasSem); $zonasSem = array_slice($zonasSem, -12, null, true);

  // 5) Mapa de calor dia da semana x hora
  $heat = array_fill(0, 7, array_fill(0, 24, 0));
  foreach ($atv as $a) { $ts = strtotime($a['inicio']); $heat[(int)date('w', $ts)][(int)date('G', $ts)] += round($a['duracao_s'] / 60); }

  // 6) Consistência semanal (km e sessões), sequência e projeções
  $sem = [];
  foreach ($atv as $a) { $w = date('o-\SW', strtotime($a['inicio'])); $sem[$w]['km'] = ($sem[$w]['km'] ?? 0) + $a['distancia_m'] / 1000; $sem[$w]['n'] = ($sem[$w]['n'] ?? 0) + 1; $sem[$w]['min'] = ($sem[$w]['min'] ?? 0) + $a['duracao_s'] / 60; }
  $semanas = [];
  for ($i = 15; $i >= 0; $i--) { $w = date('o-\SW', strtotime("-$i week")); $semanas[] = ['sem' => $w, 'km' => round($sem[$w]['km'] ?? 0, 1), 'n' => $sem[$w]['n'] ?? 0, 'min' => round($sem[$w]['min'] ?? 0)]; }
  $seq = 0; foreach (array_reverse($semanas) as $i => $s) { if ($s['n'] > 0) $seq++; elseif ($i > 0) break; }
  $kmAno = 0; $kmMes = 0; foreach ($atv as $a) { if (substr($a['inicio'], 0, 4) === date('Y')) $kmAno += $a['distancia_m'] / 1000; if (substr($a['inicio'], 0, 7) === date('Y-m')) $kmMes += $a['distancia_m'] / 1000; }
  $proj = ['km_mes' => round($kmMes, 1), 'proj_mes' => round($kmMes / max(1, (int)date('j')) * (int)date('t'), 1), 'km_ano' => round($kmAno, 1), 'proj_ano' => round($kmAno / max(1, (int)date('z') + 1) * (365 + (int)date('L')), 0)];
  $media4 = array_sum(array_column(array_slice($semanas, -5, 4), 'km')) / 4;

  // 7) Sono: horários, regularidade, fases, nota e débito
  $sono = [];
  foreach ($raw('sleep_data') as $d => $r) {
    $s = $r['j']['dailySleepDTO'] ?? null; if (!$s || empty($s['sleepTimeSeconds'])) continue;
    $dei = $s['sleepStartTimestampLocal'] ?? null; $aco = $s['sleepEndTimestampLocal'] ?? null;
    $sono[] = ['d' => $d, 'h' => round($s['sleepTimeSeconds'] / 3600, 2), 'profundo' => round(($s['deepSleepSeconds'] ?? 0) / 60), 'rem' => round(($s['remSleepSeconds'] ?? 0) / 60), 'leve' => round(($s['lightSleepSeconds'] ?? 0) / 60), 'acordado' => round(($s['awakeSleepSeconds'] ?? 0) / 60),
      'deitou' => $dei ? gmdate('H:i', intdiv($dei, 1000)) : null, 'acordou' => $aco ? gmdate('H:i', intdiv($aco, 1000)) : null, 'nota' => $s['sleepScores']['overall']['value'] ?? null, 'fc' => $s['avgHeartRate'] ?? null, 'resp' => $s['averageRespirationValue'] ?? null, 'estresse' => $s['avgSleepStress'] ?? null];
  }
  $minDia = function ($hm) { if (!$hm) return null; [$h, $m] = array_map('intval', explode(':', $hm)); $v = $h * 60 + $m; return $v < 720 ? $v + 1440 : $v; };
  $desvio = function ($l) { $l = array_values(array_filter($l, fn($v) => $v !== null)); $n = count($l); if ($n < 2) return null; $m = array_sum($l) / $n; return round(sqrt(array_sum(array_map(fn($v) => ($v - $m) ** 2, $l)) / $n)); };
  $meta = (float)(metas()['sono_h'] ?? 8);
  $ult14 = array_slice($sono, -14);
  $sonoResumo = ['media_h' => $sono ? round(array_sum(array_column($ult14, 'h')) / count($ult14), 2) : null, 'desvio_deitar_min' => $desvio(array_map(fn($s) => $minDia($s['deitou']), $ult14)), 'desvio_acordar_min' => $desvio(array_map(fn($s) => $minDia($s['acordou']), $ult14)),
    'debito_14d_h' => round(array_sum(array_map(fn($s) => max(0, $meta - $s['h']), $ult14)), 1), 'meta_h' => $meta];

  // 8) HRV, FC de repouso, prontidão, respiração, Body Battery
  $hrv = []; foreach ($raw('hrv_data') as $d => $r) { $h = $r['j']['hrvSummary'] ?? null; if ($h && ($h['lastNightAvg'] ?? null)) $hrv[] = ['d' => $d, 'v' => $h['lastNightAvg'], 'semana' => $h['weeklyAvg'] ?? null, 'status' => $h['status'] ?? null]; }
  $st = $pdo->prepare("SELECT data, tipo, valor FROM metricas WHERE usuario_id=? AND data >= CURDATE() - INTERVAL 120 DAY ORDER BY data"); $st->execute([$u]);
  $met = []; foreach ($st->fetchAll() as $r) $met[$r['tipo']][$r['data']] = +$r['valor'];

  // 9) Correlações (Pearson) entre hábitos e desempenho
  $pearson = function ($pares) { $n = count($pares); if ($n < 5) return null; $mx = array_sum(array_column($pares, 0)) / $n; $my = array_sum(array_column($pares, 1)) / $n; $sxy = $sx = $sy = 0; foreach ($pares as [$x, $y]) { $sxy += ($x - $mx) * ($y - $my); $sx += ($x - $mx) ** 2; $sy += ($y - $my) ** 2; } return $sx && $sy ? round($sxy / sqrt($sx * $sy), 2) : null; };
  $sonoPorDia = array_column($sono, 'h', 'd'); $corr = [];
  $p = []; foreach ($corridas as $c) { $d = substr($c['data'], 0, 10); if (isset($sonoPorDia[$d]) && $c['eficiencia']) $p[] = [$sonoPorDia[$d], $c['eficiencia']]; } $corr[] = ['nome' => 'Horas de sono × eficiência da corrida do dia', 'r' => $pearson($p), 'n' => count($p)];
  $p = []; foreach ($corridas as $c) if ($c['temp_c'] !== null && $c['ritmo']) $p[] = [$c['temp_c'], $c['ritmo']]; $corr[] = ['nome' => 'Temperatura × ritmo (min/km)', 'r' => $pearson($p), 'n' => count($p)];
  $p = []; foreach ($corridas as $c) if ($c['umidade'] !== null && $c['fc']) $p[] = [$c['umidade'], $c['fc']]; $corr[] = ['nome' => 'Umidade × FC média', 'r' => $pearson($p), 'n' => count($p)];
  $p = []; foreach ($sono as $s) { $amanha = date('Y-m-d', strtotime($s['d'])); if (isset($met['stress'][$amanha])) $p[] = [$s['h'], $met['stress'][$amanha]]; } $corr[] = ['nome' => 'Horas de sono × estresse do dia', 'r' => $pearson($p), 'n' => count($p)];
  $p = []; foreach ($carga as $c) { $prox = date('Y-m-d', strtotime($c['d'] . ' +1 day')); if ($c['trimp'] > 0 && isset($met['fc_repouso'][$prox])) $p[] = [$c['trimp'], $met['fc_repouso'][$prox]]; } $corr[] = ['nome' => 'Carga do treino × FC de repouso no dia seguinte', 'r' => $pearson($p), 'n' => count($p)];
  $hrvD = array_column($hrv, 'v', 'd'); $p = []; foreach ($carga as $c) { $prox = date('Y-m-d', strtotime($c['d'] . ' +1 day')); if (isset($hrvD[$prox])) $p[] = [$c['trimp'], $hrvD[$prox]]; } $corr[] = ['nome' => 'Carga do treino × HRV da noite seguinte', 'r' => $pearson($p), 'n' => count($p)];

  // 10) Passos por dia da semana e dados globais da Garmin
  $passosSem = array_fill(0, 7, []); foreach ($met['passos'] ?? [] as $d => $v) $passosSem[(int)date('w', strtotime($d))][] = $v;
  $passosSem = array_map(fn($l) => $l ? round(array_sum($l) / count($l)) : 0, $passosSem);
  $g1 = fn($t) => ($x = $raw($t, 100000)) ? end($x)['j'] : null;
  $prev = $g1('race_predictions'); $idade = $raw('fitnessage_data', 30); $idade = $idade ? end($idade)['j'] : null;
  $recGarmin = $g1('personal_record');

  // 11) Destaques automáticos (insights)
  $ins = [];
  $ult = end($carga) ?: null;
  if ($ult && $ult['acwr'] !== null) $ins[] = $ult['acwr'] > 1.3 ? "⚠️ Carga das últimas semanas subiu rápido (ACWR {$ult['acwr']}): risco maior de lesão, pegue leve." : ($ult['acwr'] < 0.8 ? "📉 Carga baixa em relação ao seu normal (ACWR {$ult['acwr']}): você está destreinando." : "✅ Carga equilibrada (ACWR {$ult['acwr']}), zona ideal entre 0,8 e 1,3.");
  if ($ult) $ins[] = $ult['tsb'] > 5 ? "🔋 Você está descansado (equilíbrio +{$ult['tsb']}), bom dia para treino forte ou prova." : ($ult['tsb'] < -15 ? "😮‍💨 Fadiga acumulada alta (equilíbrio {$ult['tsb']}): priorize recuperação." : "⚖️ Equilíbrio forma/fadiga em {$ult['tsb']}.");
  $ef = array_values(array_filter(array_column($corridas, 'eficiencia'))); if (count($ef) >= 6) { $a1 = array_sum(array_slice($ef, 0, 3)) / 3; $a2 = array_sum(array_slice($ef, -3)) / 3; $ins[] = sprintf('%s Eficiência aeróbica %s %d%% comparando as 3 primeiras com as 3 últimas corridas.', $a2 >= $a1 ? '📈' : '📉', $a2 >= $a1 ? 'melhorou' : 'caiu', abs(round(($a2 - $a1) / $a1 * 100))); }
  if ($sonoResumo['desvio_deitar_min'] !== null) $ins[] = $sonoResumo['desvio_deitar_min'] > 60 ? "🛏️ Horário de dormir muito irregular (varia ±{$sonoResumo['desvio_deitar_min']} min). Regularidade melhora HRV e recuperação." : "🛏️ Horário de dormir regular (±{$sonoResumo['desvio_deitar_min']} min).";
  if ($sonoResumo['debito_14d_h'] > 5) $ins[] = "😴 Débito de sono de {$sonoResumo['debito_14d_h']} h nos últimos 14 dias (meta {$meta} h/noite).";
  $dec = array_filter(array_column($corridas, 'desacoplamento'), fn($v) => $v !== null); if ($dec) { $md = round(array_sum($dec) / count($dec), 1); $ins[] = $md > 5 ? "❤️ Desacoplamento médio de {$md}%: a FC sobe muito no fim das corridas — falta base aeróbica (mais treinos leves e longos)." : "❤️ Desacoplamento médio de {$md}%: boa base aeróbica."; }
  $hoje = (int)date('w'); $melhorDia = array_search(max($passosSem), $passosSem); $nomes = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  if (max($passosSem)) $ins[] = "👟 Seu dia mais ativo é {$nomes[$melhorDia]} (média " . number_format(max($passosSem), 0, ',', '.') . " passos); o menos ativo é " . $nomes[array_search(min($passosSem), $passosSem)] . '.';
  if ($media4 > 0) $ins[] = sprintf('🎯 Para não se lesionar, aumente no máximo 10%%/semana: semana que vem até %.1f km (média recente %.1f km).', $media4 * 1.1, $media4);

  out(['ok' => true, 'fc_max' => $fcmax, 'insights' => $ins, 'carga' => array_slice($carga, -120), 'corridas' => $corridas, 'recordes' => $recordes, 'zonas_semana' => $zonasSem, 'heatmap' => $heat, 'semanas' => $semanas, 'sequencia_semanas' => $seq,
    'projecao' => $proj, 'sono' => array_slice($sono, -60), 'sono_resumo' => $sonoResumo, 'hrv' => $hrv, 'fc_repouso' => $met['fc_repouso'] ?? [], 'stress' => $met['stress'] ?? [], 'energia' => $met['energia'] ?? [],
    'correlacoes' => $corr, 'passos_semana' => $passosSem, 'previsoes' => $prev, 'idade_fitness' => $idade, 'recordes_garmin' => $recGarmin]);
}

case 'exportar_tudo': {
  exigeLogin();
  $d = ['usuario' => usuario(), 'metas' => metas()];
  foreach (['atividades','metricas','fc_amostras','medalhas','dispositivos','treinos'] as $t) { $st = db()->prepare("SELECT * FROM $t WHERE usuario_id=?"); $st->execute([uid()]); $d[$t] = $st->fetchAll(); }
  header('Content-Disposition: attachment; filename="garmin-export.json"');
  out($d);
}
default: erro('Ação desconhecida', 404);
}
} catch (Throwable $e) { erro('Erro: ' . $e->getMessage(), 500); }

// ---------- helpers ----------
function usuario() {
  $st = db()->prepare("SELECT id,nome,email,email_recuperacao,nascimento,sexo,altura_cm,peso_kg,fc_max,fc_repouso,avatar,criado FROM usuarios WHERE id=?"); $st->execute([uid()]);
  $u = $st->fetch();
  if ($u) { $idade = $u['nascimento'] ? (int)date_diff(date_create($u['nascimento']), date_create())->y : 30; $u['idade'] = $idade; if (!$u['fc_max']) $u['fc_max'] = 220 - $idade; }
  return $u;
}
function relogioAppsTabela() { }
function walkieDono(int $canal): void { $st = db()->prepare("SELECT criado_por FROM walkie_canais WHERE id=?"); $st->execute([$canal]); if ((int)$st->fetchColumn() !== uid()) erro('Só quem criou o canal pode fazer isso', 403); }
function walkieMembro(int $canal): void { $st = db()->prepare("SELECT 1 FROM walkie_membros WHERE canal_id=? AND usuario_id=?"); $st->execute([$canal, uid()]); if (!$st->fetchColumn()) erro('Você não participa deste canal', 403); }
function metas() { $st = db()->prepare("SELECT * FROM metas WHERE usuario_id=?"); $st->execute([uid()]); return $st->fetch() ?: []; }
function metricasDia($data) {
  $st = db()->prepare("SELECT tipo, valor, extra FROM metricas WHERE usuario_id=? AND data=?"); $st->execute([uid(), $data]);
  $m = []; foreach ($st as $r) { $m[$r['tipo']] = (float)$r['valor']; if ($r['extra']) $m[$r['tipo'] . '_extra'] = json_decode($r['extra'], true); }
  return $m;
}
function salvarMetrica($tipo, $valor, $data = null, $modo = 'set', $extra = null) {
  $data = $data ?: hoje();
  if ($modo === 'add') db()->prepare("INSERT INTO metricas (usuario_id,data,tipo,valor,extra) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE valor=GREATEST(0, valor+VALUES(valor)), extra=COALESCE(VALUES(extra),extra)")->execute([uid(), $data, $tipo, $valor, $extra]);
  elseif ($modo === 'max') db()->prepare("INSERT INTO metricas (usuario_id,data,tipo,valor,extra) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE valor=GREATEST(valor,VALUES(valor)), extra=COALESCE(VALUES(extra),extra)")->execute([uid(), $data, $tipo, $valor, $extra]);
  else db()->prepare("INSERT INTO metricas (usuario_id,data,tipo,valor,extra) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE valor=VALUES(valor), extra=COALESCE(VALUES(extra),extra)")->execute([uid(), $data, $tipo, $valor, $extra]);
}
function recalcularDia($data) {
  $st = db()->prepare("SELECT COALESCE(SUM(calorias),0) c, COALESCE(SUM(CASE WHEN tipo IN ('corrida','ciclismo','trilha','natacao','remo','eliptico','hiit','musculacao','futebol') THEN duracao_s*2 ELSE duracao_s END),0)/60 mi, COALESCE(SUM(passos),0) p FROM atividades WHERE usuario_id=? AND DATE(inicio)=?");
  $st->execute([uid(), $data]); $r = $st->fetch();
  salvarMetrica('calorias_ativas', (int)$r['c'], $data);
  salvarMetrica('minutos_intensidade', (int)$r['mi'], $data);
  if ($r['p'] > 0) salvarMetrica('passos', (int)$r['p'], $data, 'max');
}
function haversine($la1, $lo1, $la2, $lo2) {
  $R = 6371000; $dLa = deg2rad($la2 - $la1); $dLo = deg2rad($lo2 - $lo1);
  $a = sin($dLa/2)**2 + cos(deg2rad($la1)) * cos(deg2rad($la2)) * sin($dLo/2)**2;
  return 2 * $R * atan2(sqrt($a), sqrt(1 - $a));
}
function catalogoMedalhas() {
  return [
    'primeira_atividade' => ['nome' => 'Primeiros passos', 'desc' => 'Registrou a primeira atividade', 'icone' => '🏁'],
    'corrida_5k' => ['nome' => '5K', 'desc' => 'Correu 5 km em uma atividade', 'icone' => '🏃'],
    'corrida_10k' => ['nome' => '10K', 'desc' => 'Correu 10 km em uma atividade', 'icone' => '🥈'],
    'meia_maratona' => ['nome' => 'Meia maratona', 'desc' => 'Correu 21,1 km', 'icone' => '🥇'],
    'maratona' => ['nome' => 'Maratona', 'desc' => 'Correu 42,2 km', 'icone' => '🏆'],
    'ciclismo_50k' => ['nome' => 'Pedal 50K', 'desc' => 'Pedalou 50 km em uma atividade', 'icone' => '🚴'],
    'ciclismo_100k' => ['nome' => 'Century', 'desc' => 'Pedalou 100 km em uma atividade', 'icone' => '🚵'],
    'passos_10k' => ['nome' => '10 mil passos', 'desc' => 'Bateu 10.000 passos em um dia', 'icone' => '👟'],
    'passos_20k' => ['nome' => '20 mil passos', 'desc' => 'Bateu 20.000 passos em um dia', 'icone' => '🔥'],
    'sequencia_7' => ['nome' => 'Semana perfeita', 'desc' => '7 dias seguidos batendo a meta de passos', 'icone' => '📅'],
    'madrugador' => ['nome' => 'Madrugador', 'desc' => 'Atividade iniciada antes das 6h', 'icone' => '🌅'],
    'coruja' => ['nome' => 'Coruja', 'desc' => 'Atividade iniciada depois das 21h', 'icone' => '🦉'],
    'atividades_10' => ['nome' => '10 atividades', 'desc' => 'Registrou 10 atividades', 'icone' => '🔟'],
    'atividades_50' => ['nome' => '50 atividades', 'desc' => 'Registrou 50 atividades', 'icone' => '⭐'],
    'atividades_100' => ['nome' => 'Centurião', 'desc' => 'Registrou 100 atividades', 'icone' => '💯'],
    'escalador' => ['nome' => 'Escalador', 'desc' => '500 m de ganho de elevação em uma atividade', 'icone' => '⛰️'],
    'hidratado' => ['nome' => 'Hidratado', 'desc' => 'Bateu a meta de água', 'icone' => '💧'],
    'bem_dormido' => ['nome' => 'Bem dormido', 'desc' => 'Dormiu 8h ou mais', 'icone' => '😴'],
    'peso_registrado' => ['nome' => 'Na balança', 'desc' => 'Registrou o peso pela primeira vez', 'icone' => '⚖️'],
    'distancia_total_100' => ['nome' => '100 km no total', 'desc' => 'Acumulou 100 km em atividades', 'icone' => '🛣️'],
    'distancia_total_1000' => ['nome' => '1.000 km no total', 'desc' => 'Acumulou 1.000 km', 'icone' => '🌍'],
  ];
}
function verificarMedalhas() {
  $GLOBALS['novasMedalhas'] = [];
  $st = db()->prepare("SELECT codigo FROM medalhas WHERE usuario_id=?"); $st->execute([uid()]);
  $tem = array_column($st->fetchAll(), 'codigo');
  $ganhar = [];
  $st = db()->prepare("SELECT COUNT(*) n, COALESCE(SUM(distancia_m),0) d, MAX(CASE WHEN tipo='corrida' THEN distancia_m END) rmax, MAX(CASE WHEN tipo='ciclismo' THEN distancia_m END) cmax, MAX(elevacao_ganho) elev, MIN(HOUR(inicio)) hmin, MAX(HOUR(inicio)) hmax FROM atividades WHERE usuario_id=?");
  $st->execute([uid()]); $a = $st->fetch();
  if ($a['n'] >= 1) $ganhar[] = 'primeira_atividade';
  if ($a['n'] >= 10) $ganhar[] = 'atividades_10';
  if ($a['n'] >= 50) $ganhar[] = 'atividades_50';
  if ($a['n'] >= 100) $ganhar[] = 'atividades_100';
  if ($a['rmax'] >= 5000) $ganhar[] = 'corrida_5k';
  if ($a['rmax'] >= 10000) $ganhar[] = 'corrida_10k';
  if ($a['rmax'] >= 21097) $ganhar[] = 'meia_maratona';
  if ($a['rmax'] >= 42195) $ganhar[] = 'maratona';
  if ($a['cmax'] >= 50000) $ganhar[] = 'ciclismo_50k';
  if ($a['cmax'] >= 100000) $ganhar[] = 'ciclismo_100k';
  if ($a['elev'] >= 500) $ganhar[] = 'escalador';
  if ($a['d'] >= 100000) $ganhar[] = 'distancia_total_100';
  if ($a['d'] >= 1000000) $ganhar[] = 'distancia_total_1000';
  if ($a['n'] > 0 && $a['hmin'] !== null && (int)$a['hmin'] < 6) $ganhar[] = 'madrugador';
  if ($a['n'] > 0 && $a['hmax'] !== null && (int)$a['hmax'] >= 21) $ganhar[] = 'coruja';
  $m = metas();
  $st = db()->prepare("SELECT tipo, MAX(valor) v FROM metricas WHERE usuario_id=? GROUP BY tipo"); $st->execute([uid()]);
  $mx = []; foreach ($st as $r) $mx[$r['tipo']] = (float)$r['v'];
  if (($mx['passos'] ?? 0) >= 10000) $ganhar[] = 'passos_10k';
  if (($mx['passos'] ?? 0) >= 20000) $ganhar[] = 'passos_20k';
  if (($mx['agua'] ?? 0) >= ($m['agua_ml'] ?? 2500)) $ganhar[] = 'hidratado';
  if (($mx['sono'] ?? 0) >= 8) $ganhar[] = 'bem_dormido';
  if (isset($mx['peso'])) $ganhar[] = 'peso_registrado';
  $st = db()->prepare("SELECT data FROM metricas WHERE usuario_id=? AND tipo='passos' AND valor>=? AND data>=DATE_SUB(CURDATE(), INTERVAL 6 DAY)"); $st->execute([uid(), $m['passos'] ?? 10000]);
  if ($st->rowCount() >= 7) $ganhar[] = 'sequencia_7';
  $ins = db()->prepare("INSERT IGNORE INTO medalhas (usuario_id, codigo) VALUES (?,?)");
  foreach (array_unique($ganhar) as $g) if (!in_array($g, $tem)) { $ins->execute([uid(), $g]); $GLOBALS['novasMedalhas'][] = $g; }
}
