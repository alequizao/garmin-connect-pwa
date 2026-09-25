<?php
/*
 * Garmin Connect PWA · Alequizao <alequizao.dev@gmail.com>
 * Endpoint do app de relogio "Sono Alequizao": ?token=<32 hex>&dias=7
 */
require __DIR__ . '/config.php';
require __DIR__ . '/lib_sono.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$in = $_GET + $_POST;
$pdo = db();
$dias = max(1, min(30, (int)($in['dias'] ?? 7)));
$tk = preg_replace('/[^a-f0-9]/', '', (string)($in['token'] ?? ''));
if (strlen($tk) < 16) sonoErro('Token invalido', 403);
$st = $pdo->prepare("SELECT id, usuario_id FROM relogio_apps WHERE token=? LIMIT 1");
$st->execute([$tk]); $app = $st->fetch();
if (!$app) sonoErro('Token invalido', 403);
$pdo->prepare("UPDATE relogio_apps SET visto=NOW() WHERE id=?")->execute([$app['id']]);
$n = sonoNoites($pdo, (int)$app['usuario_id'], $dias + 1);
if (!$n) sonoOut(['ok' => true, 'vazio' => true, 'agora' => date('H:i')]);
$ult = array_shift($n);
$hist = [];
foreach ($n as $x) $hist[] = ['d' => substr($x['d'], 5), 'tot' => $x['tot'], 'prof' => $x['prof'], 'leve' => $x['leve'], 'rem' => $x['rem'], 'acor' => $x['acor'], 'score' => $x['score']];
sonoOut(['ok' => true, 'agora' => date('H:i'), 'n' => $ult, 'h' => $hist]);
