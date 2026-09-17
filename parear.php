<?php
/*
 * Garmin Connect PWA · Desenvolvido por Alequizao <alequizao.dev@gmail.com>
 * https://github.com/alequizao · © 2026 Alequizao
 *
 * Pareamento dos apps da Connect IQ Store: o usuário gera um código de 6 caracteres no site (Apps) e digita no app
 * (relógio ou configurações no Garmin Connect). O app troca o código por um token próprio e passa a funcionar como
 * as edições instaladas por cabo. POST {acao:"parear", codigo, tipo: rastreador|walkie|mimei, modelo, versao}
 * ou {acao:"login", email, senha, tipo, modelo, versao} (sem código — usado pelo ME MIMEI 1.11.0+).
 */
require __DIR__ . '/config.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
$d = json_decode(file_get_contents('php://input'), true) ?: $_POST;
$falha = function (string $m, int $http = 400) { http_response_code($http); echo json_encode(['ok' => false, 'erro' => $m], JSON_UNESCAPED_UNICODE); exit; };

$ip = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '';
$st = db()->prepare("SELECT COUNT(*) FROM pareamento_tentativas WHERE ip=? AND quando > NOW() - INTERVAL 15 MINUTE"); $st->execute([$ip]);
if ($st->fetchColumn() >= 20) $falha('Muitas tentativas. Aguarde 15 minutos.', 429);

$tipo = (string)($d['tipo'] ?? '');
if (!in_array($tipo, ['rastreador', 'walkie', 'mimei'], true)) $falha('App desconhecido');
$p = null;

if (($d['acao'] ?? '') === 'login') {
  // ME MIMEI 1.11.0+: entra com o e-mail e a senha da conta (configurações do app no Garmin Connect), sem código
  $email = strtolower(trim((string)($d['email'] ?? ''))); $senha = (string)($d['senha'] ?? '');
  if ($email === '' || $senha === '') $falha('Informe e-mail e senha nas configuracoes do app no Garmin Connect');
  $st = db()->prepare("SELECT id, senha FROM usuarios WHERE email=?"); $st->execute([$email]); $u = $st->fetch();
  if (!$u || !password_verify($senha, $u['senha'])) {
    db()->prepare("INSERT INTO pareamento_tentativas (ip) VALUES (?)")->execute([$ip]);
    $falha('E-mail ou senha invalidos. Confira nas configuracoes do app no Garmin Connect', 401);
  }
  $uid = (int)$u['id'];
} else {
  $codigo = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string)($d['codigo'] ?? '')));
  if (strlen($codigo) !== 6) $falha('Codigo invalido: use os 6 caracteres gerados em alequizao.com/garmin > Apps');
  $st = db()->prepare("SELECT * FROM pareamentos WHERE codigo=? AND tipo=? AND usado IS NULL AND expira > NOW()"); $st->execute([$codigo, $tipo]);
  $p = $st->fetch();
  if (!$p) {
    db()->prepare("INSERT INTO pareamento_tentativas (ip) VALUES (?)")->execute([$ip]);
    $falha('Codigo nao encontrado ou vencido. Gere outro em alequizao.com/garmin > Apps', 404);
  }
  $uid = (int)$p['usuario_id'];
}
$st = db()->prepare("SELECT nome FROM usuarios WHERE id=?"); $st->execute([$uid]); $nomeUsuario = explode(' ', (string)$st->fetchColumn())[0];
$modelo = mb_substr(preg_replace('/[^A-Za-z0-9 ._-]/', '', (string)($d['modelo'] ?? '')), 0, 30) ?: 'loja';
$token = bin2hex(random_bytes(16));
$device = null; $traccarId = null;

if ($tipo === 'rastreador') {
  // usa o dispositivo do Traccar que a pessoa já tem; senão cria um novo
  $st = db()->prepare("SELECT device, traccar_id FROM relogio_apps WHERE usuario_id=? AND tipo='rastreador' AND device IS NOT NULL ORDER BY id LIMIT 1"); $st->execute([$uid]);
  if ($r = $st->fetch()) { $device = $r['device']; $traccarId = $r['traccar_id']; }
  elseif (defined('TRACCAR_API') && TRACCAR_USUARIO !== '') {
    $device = 'garmin' . $uid . substr($token, 0, 6);
    $ctx = stream_context_create(['http' => ['method' => 'POST', 'timeout' => 10, 'ignore_errors' => true,
      'header' => "Content-Type: application/json\r\nAuthorization: Basic " . base64_encode(TRACCAR_USUARIO . ':' . TRACCAR_SENHA) . "\r\n",
      'content' => json_encode(['name' => $nomeUsuario . ' (Garmin)', 'uniqueId' => $device, 'category' => 'person'])]]);
    $resp = json_decode((string)@file_get_contents(rtrim(TRACCAR_API, '/') . '/devices', false, $ctx), true);
    $traccarId = $resp['id'] ?? null;
    if (!$traccarId) $falha('Nao foi possivel criar o dispositivo no Traccar. Tente de novo.', 502);
  }
}

db()->prepare("INSERT INTO relogio_apps (usuario_id, nome, device, modelo, token, status, tipo, traccar_id, pronto_em) VALUES (?,?,?,?,?,'pronto',?,?,NOW())")
  ->execute([$uid, mb_substr($nomeUsuario, 0, 20), $device, 'loja:' . $modelo, $token, $tipo, $traccarId]);
if ($p) db()->prepare("UPDATE pareamentos SET usado=NOW(), app_id=? WHERE id=?")->execute([(int)db()->lastInsertId(), $p['id']]);
echo json_encode(['ok' => true, 'token' => $token, 'nome' => $nomeUsuario, 'device' => $device], JSON_UNESCAPED_UNICODE);
