<?php
/*
 * Garmin Connect PWA · Desenvolvido por Alequizao <alequizao.dev@gmail.com>
 * https://github.com/alequizao · © 2026 Alequizao
 *
 * Endpoint do app de relógio "Me Mimei". Ações: lanches {kcal} → saldo do dia + lista (com URL do ícone),
 * comi {lanche, qtd} → registra o consumo.
 */
require __DIR__ . '/config.php';
require __DIR__ . '/lib_mimei.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
$d = json_decode(file_get_contents('php://input'), true) ?: $_POST;
$st = db()->prepare("SELECT id, usuario_id FROM relogio_apps WHERE token=? AND tipo='mimei' LIMIT 1");
$st->execute([preg_replace('/[^0-9a-f]/', '', (string)($d['token'] ?? ''))]);
$app = $st->fetch();
if (!$app) { http_response_code(403); echo '{"ok":false}'; exit; }
$uid = (int)$app['usuario_id'];
db()->prepare("UPDATE relogio_apps SET visto=NOW() WHERE id=?")->execute([$app['id']]);
mimeiSemear($uid);
$kcalRelogio = isset($d['kcal']) && is_numeric($d['kcal']) ? max(0, min(20000, (int)$d['kcal'])) : null;

if (($d['acao'] ?? '') === 'desfazer') {
  $st = db()->prepare("SELECT id FROM mimei_consumo WHERE usuario_id=? AND data=CURDATE() ORDER BY id DESC LIMIT 1"); $st->execute([$uid]);
  if ($idc = $st->fetchColumn()) db()->prepare("DELETE FROM mimei_consumo WHERE id=?")->execute([$idc]);
}
if (($d['acao'] ?? '') === 'comi') {
  $st = db()->prepare("SELECT id, nome, kcal FROM mimei_lanches WHERE id=? AND usuario_id=?"); $st->execute([(int)($d['lanche'] ?? 0), $uid]);
  $l = $st->fetch(); if (!$l) { echo '{"ok":false}'; exit; }
  $qtd = in_array((float)($d['qtd'] ?? 1), [0.5, 1.0, 2.0], true) ? (float)$d['qtd'] : 1.0;
  db()->prepare("INSERT INTO mimei_consumo (usuario_id, lanche_id, nome, qtd, kcal, origem, data) VALUES (?,?,?,?,?, 'relogio', CURDATE())")
    ->execute([$uid, $l['id'], $l['nome'], $qtd, (int)round($l['kcal'] * $qtd)]);
}

$base = rtrim(defined('APP_URL') ? APP_URL : 'https://' . $_SERVER['HTTP_HOST'] . '/garmin', '/') . '/';
$r = mimeiResumo($uid, $kcalRelogio);
$st = db()->prepare("SELECT nome, qtd FROM mimei_consumo WHERE usuario_id=? AND data=CURDATE() ORDER BY id DESC LIMIT 1"); $st->execute([$uid]);
$u = $st->fetch(); $r['ultimo'] = $u ? rtrim(rtrim(number_format((float)$u['qtd'], 1, ',', ''), '0'), ',') . 'x ' . $u['nome'] : null;
$lanches = array_map(function ($l) use ($r) {
  $l['pode'] = $l['kcal'] > 0 ? round($r['saldo'] / $l['kcal'], 1) : 0;
  unset($l['emoji']); return $l;
}, mimeiLanches($uid, $base));
echo json_encode(['ok' => true, 'resumo' => $r, 'lanches' => $lanches], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
