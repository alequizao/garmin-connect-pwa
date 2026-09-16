<?php
/*
 * Garmin Connect PWA · Desenvolvido por Alequizao <alequizao.dev@gmail.com>
 * https://github.com/alequizao · © 2026 Alequizao
 *
 * Conexão com o Strava (OAuth). O Strava não aceita login por usuário/senha via API: a pessoa entra com
 * o e-mail e a senha dela na página do próprio Strava e autoriza. Se STRAVA_CLIENT_ID/SECRET estiverem
 * no config.php (app da plataforma), ninguém precisa criar app; senão usa o Client ID/Secret da própria pessoa.
 */
require __DIR__ . '/config.php';
session_set_cookie_params(['lifetime' => 60*60*24*365, 'path' => '/garmin/', 'secure' => true, 'httponly' => true, 'samesite' => 'Lax']);
session_name('garminsess'); session_start();
$uid = (int)($_SESSION['uid'] ?? 0);
if (!$uid) { header('Location: ./'); exit; }
$st = db()->prepare("SELECT config FROM integracoes WHERE usuario_id=? AND servico='strava'"); $st->execute([$uid]);
$cfg = ($r = $st->fetch()) ? (json_decode($r['config'], true) ?: []) : [];
if (defined('STRAVA_CLIENT_ID') && STRAVA_CLIENT_ID !== '' && defined('STRAVA_CLIENT_SECRET') && STRAVA_CLIENT_SECRET !== '') {
  $cfg['client_id'] = STRAVA_CLIENT_ID; $cfg['client_secret'] = STRAVA_CLIENT_SECRET; $cfg['plataforma'] = true; // os scripts renovam o token com eles
}
if (empty($cfg['client_id']) || empty($cfg['client_secret'])) { header('Location: ./?tela=perfil&arg=integracoes&strava=semapp'); exit; }
$redir = (defined('APP_URL') ? rtrim(APP_URL, '/') : 'https://' . $_SERVER['HTTP_HOST'] . '/garmin') . '/strava.php';
if (isset($_GET['code'])) {
  if (!hash_equals((string)($_SESSION['strava_estado'] ?? ''), (string)($_GET['state'] ?? ''))) { header('Location: ./?tela=perfil&arg=integracoes&strava=erro'); exit; }
  $ch = curl_init('https://www.strava.com/oauth/token');
  curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20, CURLOPT_POSTFIELDS => http_build_query(['client_id' => $cfg['client_id'], 'client_secret' => $cfg['client_secret'], 'code' => $_GET['code'], 'grant_type' => 'authorization_code'])]);
  $j = json_decode((string)curl_exec($ch), true);
  if (empty($j['refresh_token'])) { header('Location: ./?tela=perfil&arg=integracoes&strava=erro'); exit; }
  $cfg['access_token'] = $j['access_token']; $cfg['refresh_token'] = $j['refresh_token']; $cfg['expires_at'] = $j['expires_at'];
  $cfg['atleta'] = trim(($j['athlete']['firstname'] ?? '') . ' ' . ($j['athlete']['lastname'] ?? ''));
  $cfg['escopo'] = (string)($_GET['scope'] ?? '');
  if (!isset($cfg['enviar_auto'])) $cfg['enviar_auto'] = true;
  db()->prepare("INSERT INTO integracoes (usuario_id, servico, config, status, erro) VALUES (?, 'strava', ?, 'pendente', NULL) ON DUPLICATE KEY UPDATE config=VALUES(config), status='pendente', erro=NULL")->execute([$uid, json_encode($cfg)]);
  @touch('/tmp/garmin-sync-agora-' . $uid);
  header('Location: ./?tela=perfil&arg=integracoes&strava=ok'); exit;
}
if (isset($_GET['error'])) { header('Location: ./?tela=perfil&arg=integracoes&strava=negado'); exit; }
$_SESSION['strava_estado'] = bin2hex(random_bytes(12));
header('Location: https://www.strava.com/oauth/authorize?' . http_build_query(['client_id' => $cfg['client_id'], 'redirect_uri' => $redir, 'response_type' => 'code', 'approval_prompt' => 'auto',
  'scope' => 'read,activity:read_all,activity:write,profile:read_all', 'state' => $_SESSION['strava_estado']]));
