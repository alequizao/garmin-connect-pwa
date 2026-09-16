<?php
/*
 * Garmin Connect PWA · Desenvolvido por Alequizao <alequizao.dev@gmail.com>
 * https://github.com/alequizao · © 2026 Alequizao
 *
 * Endpoint do app "Walkie-Talkie Alequizão" instalado no relógio. O token (gravado no app pela aba Apps)
 * identifica quem fala e em qual canal. Ações: receber {desde, fundo} e enviar {texto, sos, lat, lon}.
 */
require __DIR__ . '/config.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
$d = json_decode(file_get_contents('php://input'), true) ?: $_POST;

// integração (ex.: Lembretes): publica no canal com a chave do canal, sem relógio
if (($d['acao'] ?? '') === 'publicar') {
  $st = db()->prepare("SELECT id, criado_por FROM walkie_canais WHERE chave_api=? LIMIT 1"); $st->execute([preg_replace('/[^0-9a-f]/', '', (string)($d['chave'] ?? ''))]);
  $c = $st->fetch(); if (!$c) { http_response_code(403); echo '{"ok":false,"erro":"chave inválida"}'; exit; }
  $texto = trim(mb_substr(strip_tags((string)($d['texto'] ?? '')), 0, 160)); if ($texto === '') { echo '{"ok":false,"erro":"texto vazio"}'; exit; }
  $autor = trim(mb_substr((string)($d['autor'] ?? 'Aviso'), 0, 40)) ?: 'Aviso';
  $tipo = in_array($d['tipo'] ?? '', ['atencao', 'sos'], true) ? $d['tipo'] : 'texto';
  db()->prepare("INSERT INTO walkie_mensagens (canal_id, usuario_id, autor, texto, sos, tipo, origem) VALUES (?,?,?,?,?,?, 'api')")->execute([$c['id'], null, $autor, $texto, $tipo === 'sos' ? 1 : 0, $tipo]);
  echo json_encode(['ok' => true, 'id' => (int)db()->lastInsertId()]);
  if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
  require_once __DIR__ . '/api_walkie_push.php';
  walkieNotificar((int)$c['id'], 0, $autor, $texto, $tipo);
  exit;
}
// o token identifica a pessoa; o relógio mostra TODOS os canais dela (se houver só um, ele é o principal)
$st = db()->prepare("SELECT id, usuario_id, nome, canal_id FROM relogio_apps WHERE token=? AND tipo='walkie' LIMIT 1");
$st->execute([preg_replace('/[^0-9a-f]/', '', (string)($d['token'] ?? ''))]);
$app = $st->fetch();
if (!$app) { http_response_code(403); echo '{"ok":false}'; exit; }
db()->prepare("UPDATE relogio_apps SET visto=NOW() WHERE id=?")->execute([$app['id']]);
$st = db()->prepare("SELECT c.id, c.nome, c.frases, (SELECT MAX(id) FROM walkie_mensagens m WHERE m.canal_id=c.id) ultimo_id,
    (SELECT COUNT(DISTINCT a2.usuario_id) FROM relogio_apps a2 WHERE a2.tipo='walkie' AND a2.visto > NOW() - INTERVAL 10 MINUTE AND a2.usuario_id IN (SELECT usuario_id FROM walkie_membros m2 WHERE m2.canal_id=c.id)) online
  FROM walkie_canais c JOIN walkie_membros m ON m.canal_id=c.id AND m.usuario_id=? ORDER BY (c.id=?) DESC, c.id");
$st->execute([$app['usuario_id'], (int)$app['canal_id']]);
$canais = $st->fetchAll();
if (!$canais) { echo json_encode(['ok' => true, 'canais' => [], 'mensagens' => [], 'canal' => 'Sem canais', 'aviso_canais' => 'Crie ou entre num canal em alequizao.com/garmin > Apps']); exit; }
$pedido = (int)($d['canal'] ?? 0);
$sel = null; foreach ($canais as $c) if ((int)$c['id'] === $pedido) $sel = $c;
$sel = $sel ?: $canais[0];   // sem escolha (ou canal inexistente) = principal
$app['canal_id'] = (int)$sel['id']; $app['canal'] = $sel['nome']; $app['frases'] = $sel['frases'];

if (($d['acao'] ?? '') === 'enviar') {
  $texto = trim(mb_substr(strip_tags((string)($d['texto'] ?? '')), 0, 120));
  if ($texto === '') { echo '{"ok":false}'; exit; }
  $st = db()->prepare("SELECT COUNT(*) FROM walkie_mensagens WHERE app_id=? AND criado > NOW() - INTERVAL 1 MINUTE"); $st->execute([$app['id']]);
  if ($st->fetchColumn() >= 20) { http_response_code(429); echo '{"ok":false}'; exit; }
  $lat = is_numeric($d['lat'] ?? null) ? +$d['lat'] : null; $lon = is_numeric($d['lon'] ?? null) ? +$d['lon'] : null;
  $tipo = !empty($d['sos']) ? 'sos' : (($d['tipo'] ?? '') === 'atencao' ? 'atencao' : 'texto');
  db()->prepare("INSERT INTO walkie_mensagens (canal_id, usuario_id, app_id, autor, texto, sos, tipo, lat, lon, origem) VALUES (?,?,?,?,?,?,?,?,?, 'relogio')")
    ->execute([$app['canal_id'], $app['usuario_id'], $app['id'], $app['nome'], $texto, $tipo === 'sos' ? 1 : 0, $tipo, $lat, $lon]);
  $id = (int)db()->lastInsertId();
  echo json_encode(['ok' => true, 'id' => $id]);
  if (function_exists('fastcgi_finish_request')) fastcgi_finish_request(); // responde ao relógio antes de disparar os pushes
  require_once __DIR__ . '/api_walkie_push.php';
  walkieNotificar((int)$app['canal_id'], (int)$app['usuario_id'], $app['nome'], $texto . ($tipo === 'sos' && $lat ? " — https://maps.google.com/?q=$lat,$lon" : ''), $tipo);
  exit;
}

$desde = max(0, (int)($d['desde'] ?? 0));
$limite = min(20, max(1, (int)($d['limite'] ?? 8)));
$st = db()->prepare("SELECT id, autor, texto, sos, tipo, lat, lon, app_id, DATE_FORMAT(criado, '%H:%i') hora FROM walkie_mensagens WHERE canal_id=? AND id>? ORDER BY id DESC LIMIT $limite");
$st->execute([$app['canal_id'], $desde]);
$msgs = array_reverse($st->fetchAll());
// configuração vinda do servidor (tabela config_app): muda o comportamento do app sem reinstalar
$cfgApp = function (string $k, $padrao) { $q = db()->prepare("SELECT valor FROM config_app WHERE chave=?"); $q->execute([$k]); $v = $q->fetchColumn(); return $v === false || $v === null || $v === '' ? $padrao : $v; };
$config = ['intervalo_s' => max(3, (int)$cfgApp('walkie_intervalo_s', 8)), 'versao_app' => (string)$cfgApp('walkie_versao_app', '2.0.0'), 'aviso' => (string)$cfgApp('walkie_aviso', '')];
$saida = ['ok' => true, 'config' => $config, 'canal' => $app['canal'], 'frases' => array_values(array_filter(array_map('trim', explode("\n", (string)$app['frases'])))) ?: null, 'online' => (int)$sel['online'], 'canal_id' => (int)$sel['id'], 'canais' => array_map(fn($c) => ['id' => (int)$c['id'], 'nome' => $c['nome'], 'ultimo_id' => (int)$c['ultimo_id'], 'online' => (int)$c['online']], $canais), 'mensagens' => array_map(fn($m) => [
  'id' => (int)$m['id'], 'autor' => $m['autor'], 'texto' => ($m['sos'] && $m['lat'] ? $m['texto'] . ' (' . round($m['lat'], 4) . ',' . round($m['lon'], 4) . ')' : $m['texto']),
  'sos' => (int)$m['sos'], 'atencao' => $m['tipo'] === 'atencao' ? 1 : 0, 'hora' => $m['hora'], 'meu' => (int)$m['app_id'] === (int)$app['id'] ? 1 : 0], $msgs)];
if (!empty($d['fundo'])) {
  // segundo plano: mensagens novas de QUALQUER canal da pessoa (ids são globais)
  $ids = array_map(fn($c) => (int)$c['id'], $canais);
  $st = db()->prepare("SELECT m.autor, m.texto, m.sos, m.tipo, c.nome canal FROM walkie_mensagens m JOIN walkie_canais c ON c.id=m.canal_id
    WHERE m.canal_id IN (" . implode(',', $ids) . ") AND m.id > ? AND (m.app_id IS NULL OR m.app_id <> ?) ORDER BY m.id DESC LIMIT 20");
  $st->execute([$desde, $app['id']]); $novas = $st->fetchAll(); $ult = $novas[0] ?? null;
  $saida = ['ok' => true, 'novas' => count($novas), 'resumo' => $ult ? mb_substr((count($canais) > 1 ? $ult['canal'] . ' · ' : '') . $ult['autor'] . ': ' . $ult['texto'], 0, 60) : null,
    'canal' => $ult['canal'] ?? $app['canal'], 'atencao' => $ult && $ult['tipo'] === 'atencao' ? 1 : 0, 'sos' => $ult ? (int)$ult['sos'] : 0];
}
echo json_encode($saida, JSON_UNESCAPED_UNICODE);
