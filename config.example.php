<?php
/*
 * Garmin Connect PWA · Desenvolvido por Alequizao <alequizao.dev@gmail.com>
 * https://github.com/alequizao · © 2026 Alequizao
 *
 * Copie para config.php e preencha. O config.php NUNCA vai para o Git.
 */
date_default_timezone_set('America/Sao_Paulo');
define('DB_HOST', '127.0.0.1');
define('DB_NAME', 'garmin');
define('DB_USER', 'usuario_do_banco');
define('DB_PASS', 'senha_do_banco');
define('APP_NOME', 'Garmin Connect');
define('APP_VERSAO', '2.1.0');
define('APP_URL', 'https://seu-dominio.com/garmin');

// E-mail (redefinição de senha). Gmail: smtp.gmail.com, 587, tls, e uma "senha de app".
define('SMTP_HOST', '');
define('SMTP_PORTA', 587);
define('SMTP_SEGURANCA', 'tls');
define('SMTP_USUARIO', '');
define('SMTP_SENHA', '');
define('SMTP_DE', '');
define('SMTP_NOME', 'Garmin Connect');

// Strava (opcional) — app único da plataforma: crie em https://www.strava.com/settings/api (callback domain = seu domínio)
define('STRAVA_CLIENT_ID', '');
define('STRAVA_CLIENT_SECRET', '');

// Traccar (opcional — a aba App cria o dispositivo de cada pessoa e o relógio envia a posição)
define('TRACCAR_API', 'http://127.0.0.1:8082/api');
define('TRACCAR_OSMAND', 'http://127.0.0.1:5055/');
define('TRACCAR_USUARIO', '');
define('TRACCAR_SENHA', '');

function db(): PDO {
  static $pdo;
  if (!$pdo) {
    $pdo = new PDO('mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4', DB_USER, DB_PASS, [
      PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
  }
  return $pdo;
}
