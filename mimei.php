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
/* Modo público (app da loja 1.12.0+): sem conta. O cardápio é o do administrador (MIMEI_DONO) e o consumo
   fica separado por relógio (usuario_id=0 + aparelho), sem misturar com os dados de nenhuma conta. */
$aparelho = substr(preg_replace('/[^A-Za-z0-9_-]/', '', (string)($d['aparelho'] ?? '')), 0, 64);
$pub = !$app && strlen($aparelho) >= 8;
if (!$app && !$pub) { http_response_code(403); echo '{"ok":false}'; exit; }
if ($pub) {
  $uid = defined('MIMEI_DONO') ? (int)MIMEI_DONO : 1;
} else {
  $uid = (int)$app['usuario_id'];
  db()->prepare("UPDATE relogio_apps SET visto=NOW() WHERE id=?")->execute([$app['id']]);
}
mimeiSemear($uid);
// consumo: conta (usuario_id) ou relógio público (aparelho)
[$cWhere, $cArgs, $cUid, $cAp] = $pub ? ['usuario_id=0 AND aparelho=?', [$aparelho], 0, $aparelho] : ['usuario_id=?', [$uid], $uid, null];
$kcalRelogio = isset($d['kcal']) && is_numeric($d['kcal']) ? max(0, min(20000, (int)$d['kcal'])) : null;

/* 1.13.0: registros feitos sem internet chegam em "pendentes" [{lanche, qtd, chave, dia}]; a chave evita duplicar
   quando o relógio reenvia. "recebidas" devolve as chaves gravadas (ou já existentes) para o relógio limpar a fila. */
$recebidas = [];
if (!empty($d['pendentes']) && is_array($d['pendentes'])) {
  $stL = db()->prepare("SELECT id, nome, kcal FROM mimei_lanches WHERE id=? AND usuario_id=?");
  $ins = db()->prepare("INSERT IGNORE INTO mimei_consumo (usuario_id, aparelho, lanche_id, nome, qtd, kcal, origem, data, chave) VALUES (?,?,?,?,?,?,?,?,?)");
  foreach (array_slice($d['pendentes'], 0, 50) as $p) {
    if (!is_array($p)) continue;
    $chave = substr(preg_replace('/[^A-Za-z0-9_:-]/', '', (string)($p['chave'] ?? '')), 0, 40);
    if (strlen($chave) < 6) continue;
    $stL->execute([(int)($p['lanche'] ?? 0), $uid]); $l = $stL->fetch();
    if (!$l) { $recebidas[] = $chave; continue; } // lanche apagado do cardápio: descarta
    $qtd = in_array((float)($p['qtd'] ?? 1), [0.5, 1.0, 2.0], true) ? (float)$p['qtd'] : 1.0;
    $dia = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($p['dia'] ?? '')) ? $p['dia'] : date('Y-m-d');
    if ($dia > date('Y-m-d') || $dia < date('Y-m-d', strtotime('-7 days'))) $dia = date('Y-m-d');
    $ins->execute([$cUid, $cAp, $l['id'], $l['nome'], $qtd, (int)round($l['kcal'] * $qtd), $pub ? 'loja' : 'relogio', $dia, $chave]);
    $recebidas[] = $chave;
  }
}
if (($d['acao'] ?? '') === 'apagar') {
  db()->prepare("DELETE FROM mimei_consumo WHERE id=? AND $cWhere AND data >= CURDATE() - INTERVAL 1 DAY")->execute(array_merge([(int)($d['id'] ?? 0)], $cArgs));
}
if (($d['acao'] ?? '') === 'desfazer') {
  $st = db()->prepare("SELECT id FROM mimei_consumo WHERE $cWhere AND data=CURDATE() ORDER BY id DESC LIMIT 1"); $st->execute($cArgs);
  if ($idc = $st->fetchColumn()) db()->prepare("DELETE FROM mimei_consumo WHERE id=?")->execute([$idc]);
}
if (($d['acao'] ?? '') === 'comi') {
  $st = db()->prepare("SELECT id, nome, kcal FROM mimei_lanches WHERE id=? AND usuario_id=?"); $st->execute([(int)($d['lanche'] ?? 0), $uid]);
  $l = $st->fetch(); if (!$l) { echo '{"ok":false}'; exit; }
  $qtd = in_array((float)($d['qtd'] ?? 1), [0.5, 1.0, 2.0], true) ? (float)$d['qtd'] : 1.0;
  db()->prepare("INSERT INTO mimei_consumo (usuario_id, aparelho, lanche_id, nome, qtd, kcal, origem, data) VALUES (?,?,?,?,?,?, ?, CURDATE())")
    ->execute([$cUid, $cAp, $l['id'], $l['nome'], $qtd, (int)round($l['kcal'] * $qtd), $pub ? 'loja' : 'relogio']);
}

$base = rtrim(defined('APP_URL') ? APP_URL : 'https://' . $_SERVER['HTTP_HOST'] . '/garmin', '/') . '/';
if ($pub) {
  $st = db()->prepare("SELECT COALESCE(SUM(kcal),0) FROM mimei_consumo WHERE $cWhere AND data=CURDATE()"); $st->execute($cArgs);
  $comido = (int)$st->fetchColumn(); $queimado = (int)$kcalRelogio;
  $r = ['queimado' => $queimado, 'garmin' => 0, 'relogio' => $kcalRelogio, 'comido' => $comido, 'saldo' => max(0, $queimado - $comido)];
} else {
  $r = mimeiResumo($uid, $kcalRelogio);
}
$st = db()->prepare("SELECT nome, qtd FROM mimei_consumo WHERE $cWhere AND data=CURDATE() ORDER BY id DESC LIMIT 1"); $st->execute($cArgs);
$u = $st->fetch(); $r['ultimo'] = $u ? rtrim(rtrim(number_format((float)$u['qtd'], 1, ',', ''), '0'), ',') . 'x ' . $u['nome'] : null;
$lanches = array_map(function ($l) use ($r) {
  $l['pode'] = $l['kcal'] > 0 ? round($r['saldo'] / $l['kcal'], 1) : 0;
  unset($l['emoji']); return $l;
}, mimeiLanches($uid, $base));
/* Compatibilidade: apps < 1.9.0 (sem sabores) guardam todos os ícones na memória do relógio e estouram com a lista cheia.
   Para eles, cada grupo vira um item só (o sabor mais consumido, com o nome do grupo) e só os campos que conhecem. */
if (version_compare((string)($d['versao'] ?? '0'), '1.9.0', '<')) {
  $st = db()->prepare("SELECT lanche_id, COUNT(*) n FROM mimei_consumo WHERE usuario_id=? GROUP BY lanche_id"); $st->execute([$uid]);
  $uso = $st->fetchAll(PDO::FETCH_KEY_PAIR); $vistos = []; $antigos = [];
  foreach ($lanches as $l) {
    $g = $l['grupo'];
    if ($g !== null && isset($vistos[$g])) { $i = $vistos[$g]; if (($uso[$l['id']] ?? 0) > ($uso[$antigos[$i]['id']] ?? 0)) { $antigos[$i] = ['nome' => $g] + $l; } continue; }
    if ($g !== null) { $vistos[$g] = count($antigos); $l['nome'] = $g; }
    $antigos[] = $l;
  }
  $lanches = array_map(fn($l) => ['id' => $l['id'], 'nome' => $l['nome'], 'porcao' => $l['porcao'], 'kcal' => $l['kcal'], 'pode' => $l['pode'], 'icone' => $l['icone']], $antigos);
}
$extra = [];
if (version_compare((string)($d['versao'] ?? '0'), '1.13.0', '>=')) {
  $st = db()->prepare("SELECT id, nome, qtd, kcal FROM mimei_consumo WHERE $cWhere AND data=CURDATE() ORDER BY id DESC LIMIT 30"); $st->execute($cArgs);
  $extra['hoje'] = array_map(fn($c) => ['id' => (int)$c['id'], 'nome' => $c['nome'], 'qtd' => (float)$c['qtd'], 'kcal' => (int)$c['kcal']], $st->fetchAll());
  $st = db()->prepare("SELECT lanche_id, COUNT(*) n FROM mimei_consumo WHERE $cWhere AND data >= CURDATE() - INTERVAL 60 DAY GROUP BY lanche_id"); $st->execute($cArgs);
  $extra['uso'] = []; foreach ($st->fetchAll() as $u) $extra['uso'][(string)$u['lanche_id']] = (int)$u['n'];
  $extra['recebidas'] = $recebidas;
  $extra['dia'] = date('Y-m-d');
  if ($pub) $extra['codigo'] = mimeiCodigoAparelho($aparelho);
}
echo json_encode(['ok' => true, 'resumo' => $r, 'lanches' => $lanches] + $extra, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
