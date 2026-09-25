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
require __DIR__ . '/lib_mimei116.php';
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
/* 1.15.0: guarda as calorias ativas do dia (a maior do dia) para o saldo da semana */
db()->exec("CREATE TABLE IF NOT EXISTS mimei_dias (usuario_id INT NOT NULL, aparelho VARCHAR(64) NOT NULL DEFAULT '', data DATE NOT NULL, queimado INT NOT NULL DEFAULT 0, PRIMARY KEY (usuario_id, aparelho, data)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
if ($kcalRelogio !== null) {
  db()->prepare("INSERT INTO mimei_dias (usuario_id, aparelho, data, queimado) VALUES (?,?,CURDATE(),?) ON DUPLICATE KEY UPDATE queimado=GREATEST(queimado, VALUES(queimado))")
    ->execute([$pub ? 0 : $uid, $pub ? $aparelho : '', $kcalRelogio]);
}

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
/* 1.17.0: bebidas zero ('zero' => true) não entram na conversão (pode = 0). Apps anteriores à 1.17.0 não conhecem o selo
   ZERO e mostrariam "cabem 150x": para eles as zero ficam fora da lista. Para economizar memória, 'zero' só vai quando é true. */
$v117 = version_compare((string)($d['versao'] ?? '0'), '1.17.0', '>=');
$lanches = [];
foreach (mimeiLanches($uid, $base) as $l) {
  if ($l['zero'] && !$v117) continue;
  $l['pode'] = ($l['kcal'] > 0 && !$l['zero']) ? round($r['saldo'] / $l['kcal'], 1) : 0;
  if (!$l['zero']) unset($l['zero']);
  unset($l['emoji']); $lanches[] = $l;
}
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
if (version_compare((string)($d['versao'] ?? '0'), '1.15.0', '>=')) {
  // saldo dos últimos 7 dias (só dias com calorias registradas)
  $st = db()->prepare("SELECT data, queimado FROM mimei_dias WHERE usuario_id=? AND aparelho=? AND data >= CURDATE() - INTERVAL 6 DAY");
  $st->execute([$pub ? 0 : $uid, $pub ? $aparelho : '']); $q7 = $st->fetchAll(PDO::FETCH_KEY_PAIR);
  if ($q7) {
    $st = db()->prepare("SELECT data, SUM(kcal) FROM mimei_consumo WHERE $cWhere AND data >= CURDATE() - INTERVAL 6 DAY GROUP BY data");
    $st->execute($cArgs); $c7 = $st->fetchAll(PDO::FETCH_KEY_PAIR);
    $qs = array_sum(array_map('intval', $q7)); $cs = 0;
    foreach ($q7 as $dia => $_) $cs += (int)($c7[$dia] ?? 0);
    $extra['semana'] = ['queimado' => $qs, 'comido' => $cs, 'saldo' => $qs - $cs, 'dias' => count($q7)];
  }
  // sugestão: o que mais foi comido perto deste horário (±1 h) nos últimos 60 dias, se repetiu pelo menos 2 vezes
  $h = (int)date('G');
  $st = db()->prepare("SELECT lanche_id, MAX(nome) nome, COUNT(*) n FROM mimei_consumo WHERE $cWhere AND lanche_id IS NOT NULL AND data >= CURDATE() - INTERVAL 60 DAY AND HOUR(criado) BETWEEN ? AND ? GROUP BY lanche_id ORDER BY n DESC, MAX(id) DESC LIMIT 1");
  $st->execute(array_merge($cArgs, [max(0, $h - 1), min(23, $h + 1)]));
  if (($sg = $st->fetch()) && $sg['n'] >= 2) $extra['sugestao'] = ['id' => (int)$sg['lanche_id'], 'nome' => $sg['nome']];
}
/* 1.16.0: nomes no idioma do relógio (en/es), sequência, conquistas e duelo com amigo */
$v116 = version_compare((string)($d['versao'] ?? '0'), '1.16.0', '>=');
if ($v116) {
  $lg = mimei116Lingua($d['idioma'] ?? '');
  if ($lg !== 'pt') {
    $lanches = array_map(fn($l) => mimei116TraduzLanche($l, $lg), $lanches);
    if (!empty($extra['hoje'])) {
      $ids = array_column($extra['hoje'], 'id');
      $st = db()->prepare("SELECT id, lanche_id FROM mimei_consumo WHERE id IN (" . implode(',', array_map('intval', $ids)) . ")"); $st->execute(); $mapa = $st->fetchAll(PDO::FETCH_KEY_PAIR);
      foreach ($extra['hoje'] as &$hh) $hh['nome'] = mimei116NomePorId((int)($mapa[$hh['id']] ?? 0), $hh['nome'], $lg);
      unset($hh);
    }
    if (!empty($extra['sugestao'])) $extra['sugestao']['nome'] = mimei116NomePorId($extra['sugestao']['id'], $extra['sugestao']['nome'], $lg);
  }
  /* relógios monocromáticos/pouca memória (Instinct, Descent G1) mandam "leve": sem URL de ícone e "hoje" com até 15 itens */
  if (!empty($d['leve'])) {
    $lanches = array_map(function ($l) { unset($l['icone']); return $l; }, $lanches);
    if (!empty($extra['hoje'])) $extra['hoje'] = array_slice($extra['hoje'], 0, 15);
  }
  try {
    $cx = ['uid' => $pub ? 0 : $uid, 'ap' => $pub ? $aparelho : ''];
    $dias116 = mimei116Dias($cx); $seq = mimei116Seq($cx, $dias116);
    $extra['seq'] = $seq[0]; $extra['seqMax'] = $seq[1];
    $treinos = isset($d['treinos']) && is_numeric($d['treinos']) ? (int)$d['treinos'] : null;
    $extra['conq'] = array_keys(mimei116Conquistas($cx, $treinos, $dias116, $seq));
    if ($pub && !empty($extra['codigo']) && ($du = mimei116Duelo($extra['codigo'], $aparelho))) $extra['duelo'] = $du;
  } catch (Throwable $e) { error_log('mimei 1.16: ' . $e->getMessage()); }
}
echo json_encode(['ok' => true, 'resumo' => $r, 'lanches' => $lanches] + $extra, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
