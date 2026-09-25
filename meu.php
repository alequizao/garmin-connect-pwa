<?php
/*
 * Garmin Connect PWA · Desenvolvido por Alequizao <alequizao.dev@gmail.com>
 * https://github.com/alequizao · © 2026 Alequizao
 *
 * ME MIMEI 1.13.0+: histórico de quem usa o app da loja sem conta. Sem login: o código de 8 letras
 * aparece no relógio (menu → Meu histórico).
 * 1.16.0: sequência, conquistas, amigos/casal (convite por código) e adicionar lanche pelo celular.
 */
require __DIR__ . '/config.php';
header('Content-Type: text/html; charset=utf-8');
header('X-Robots-Tag: noindex');
header('Referrer-Policy: no-referrer');
$codigo = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string)($_GET['c'] ?? '')));
$ap = null; $dias = []; $hoje = [];
if (strlen($codigo) === 8) {
  $st = db()->prepare("SELECT aparelho FROM mimei_aparelhos WHERE codigo=?"); $st->execute([$codigo]); $ap = $st->fetchColumn() ?: null;
}
/* 1.16.0: sequência, conquistas, amigos/casal e registrar lanche pelo celular */
require __DIR__ . '/lib_mimei.php';
require __DIR__ . '/lib_mimei116.php';
mimei116Tabelas();
session_name('mimeimeu'); session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax', 'secure' => true]); session_start();
if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(16));
$csrf = $_SESSION['csrf']; $msg = $_SESSION['msg'] ?? null; unset($_SESSION['msg']);
if ($ap && $_SERVER['REQUEST_METHOD'] === 'POST') {
  $ok = hash_equals($csrf, (string)($_POST['csrf'] ?? ''));
  $f = (string)($_POST['f'] ?? '');
  if (!$ok) $_SESSION['msg'] = 'Sessão expirada. Tente de novo.';
  elseif ($f === 'add') {
    $st = db()->prepare("SELECT id, nome, kcal FROM mimei_lanches WHERE id=? AND usuario_id=? AND ativo=1"); $st->execute([(int)($_POST['lanche'] ?? 0), defined('MIMEI_DONO') ? (int)MIMEI_DONO : 1]);
    if ($l = $st->fetch()) {
      $q = in_array((float)($_POST['qtd'] ?? 1), [0.5, 1.0, 2.0], true) ? (float)$_POST['qtd'] : 1.0;
      db()->prepare("INSERT INTO mimei_consumo (usuario_id, aparelho, lanche_id, nome, qtd, kcal, origem, data, chave) VALUES (0,?,?,?,?,?,'celular',CURDATE(),?)")
        ->execute([$ap, $l['id'], $l['nome'], $q, (int)round($l['kcal'] * $q), 'cel-' . substr(bin2hex(random_bytes(8)), 0, 16)]);
      $_SESSION['msg'] = 'Registrado 😋 O relógio recebe na próxima atualização.';
    }
  } elseif ($f === 'apagar') {
    db()->prepare("DELETE FROM mimei_consumo WHERE id=? AND usuario_id=0 AND aparelho=? AND data=CURDATE()")->execute([(int)($_POST['id'] ?? 0), $ap]);
    $_SESSION['msg'] = 'Registro apagado.';
  } elseif ($f === 'convidar') {
    $amigo = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string)($_POST['amigo'] ?? '')));
    $apelido = mb_substr(trim(strip_tags((string)($_POST['apelido'] ?? ''))), 0, 20) ?: null;
    $st = db()->prepare("SELECT 1 FROM mimei_aparelhos WHERE codigo=?"); $st->execute([$amigo]);
    if ($amigo === $codigo || !$st->fetchColumn()) $_SESSION['msg'] = 'Código do amigo não encontrado.';
    elseif (mimei116Par($codigo)) $_SESSION['msg'] = 'Você já tem um amigo pareado. Desfaça antes.';
    else {
      db()->prepare("DELETE FROM mimei_pares WHERE status<>'ok' AND ((de=? AND para=?) OR (de=? AND para=?))")->execute([$codigo, $amigo, $amigo, $codigo]);
      db()->prepare("INSERT INTO mimei_pares (de, para, apelido_de) VALUES (?,?,?)")->execute([$codigo, $amigo, $apelido]);
      $_SESSION['msg'] = 'Convite enviado! Seu amigo precisa aceitar no /garmin/meu dele.';
    }
  } elseif ($f === 'aceitar' || $f === 'recusar' || $f === 'desfazer') {
    $id = (int)($_POST['id'] ?? 0);
    if ($f === 'aceitar') {
      if (mimei116Par($codigo)) $_SESSION['msg'] = 'Você já tem um amigo pareado.';
      else { db()->prepare("UPDATE mimei_pares SET status='ok', apelido_para=? WHERE id=? AND para=? AND status='pendente'")->execute([mb_substr(trim(strip_tags((string)($_POST['apelido'] ?? ''))), 0, 20) ?: null, $id, $codigo]); $_SESSION['msg'] = 'Pareado! 🤝'; }
    } else { db()->prepare("DELETE FROM mimei_pares WHERE id=? AND (de=? OR para=?)")->execute([$id, $codigo, $codigo]); $_SESSION['msg'] = $f === 'recusar' ? 'Convite recusado.' : 'Pareamento desfeito.'; }
  }
  header('Location: meu.php?c=' . $codigo); exit;
}
$seq = [0, 0]; $conq = []; $par = null; $convites = []; $enviados = []; $placar = null; $cardapio = []; $hojeReg = [];
if ($ap) {
  $cx = ['uid' => 0, 'ap' => $ap];
  $seq = mimei116Seq($cx); $conq = mimei116Conquistas($cx, null, null, $seq);
  $par = mimei116Par($codigo);
  $st = db()->prepare("SELECT id, de, apelido_de FROM mimei_pares WHERE para=? AND status='pendente'"); $st->execute([$codigo]); $convites = $st->fetchAll();
  $st = db()->prepare("SELECT id, para FROM mimei_pares WHERE de=? AND status='pendente'"); $st->execute([$codigo]); $enviados = $st->fetchAll();
  if ($par) { $st = db()->prepare("SELECT aparelho FROM mimei_aparelhos WHERE codigo=?"); $st->execute([$par['codigo']]); $apA = $st->fetchColumn(); if ($apA) $placar = [mimei116Placar($ap), mimei116Placar($apA)]; }
  $st = db()->prepare("SELECT id, nome, kcal, zero, porcao FROM mimei_lanches WHERE usuario_id=? AND ativo=1 ORDER BY ordem, id"); $st->execute([defined('MIMEI_DONO') ? (int)MIMEI_DONO : 1]); $cardapio = $st->fetchAll();
  $st = db()->prepare("SELECT id, nome, qtd, kcal FROM mimei_consumo WHERE usuario_id=0 AND aparelho=? AND data=CURDATE() ORDER BY id DESC"); $st->execute([$ap]); $hojeReg = $st->fetchAll();
}
if ($ap) {
  $st = db()->prepare("SELECT data, SUM(kcal) kcal, COUNT(*) n FROM mimei_consumo WHERE usuario_id=0 AND aparelho=? AND data >= CURDATE() - INTERVAL 6 DAY GROUP BY data ORDER BY data DESC");
  $st->execute([$ap]); foreach ($st->fetchAll() as $r) $dias[$r['data']] = $r;
  $st = db()->prepare("SELECT nome, qtd, kcal, data, TIME_FORMAT(criado,'%H:%i') hora FROM mimei_consumo WHERE usuario_id=0 AND aparelho=? AND data >= CURDATE() - INTERVAL 6 DAY ORDER BY data DESC, id DESC");
  $st->execute([$ap]); foreach ($st->fetchAll() as $r) $hoje[$r['data']][] = $r;
  // 1.15.0: calorias queimadas por dia (o relógio envia) para saldo e compartilhamento
  try { $st = db()->prepare("SELECT data, queimado FROM mimei_dias WHERE usuario_id=0 AND aparelho=? AND data >= CURDATE() - INTERVAL 6 DAY"); $st->execute([$ap]); $queim = $st->fetchAll(PDO::FETCH_KEY_PAIR); } catch (Throwable $e) { $queim = []; }
}
$queim = $queim ?? [];
$h = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
$semana = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
$qtd = fn($q) => rtrim(rtrim(number_format((float)$q, 1, ',', ''), '0'), ',');
$max = 1; foreach ($dias as $d) $max = max($max, (int)$d['kcal']);
?><!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>ME MIMEI — meu histórico</title>
<link rel="icon" href="icons/icon-192.png">
<style>
:root{--bg:#141414;--card:#232325;--txt:#f2f2f2;--txt2:#a3a3a8;--amb:#f5c23b;--lin:rgba(255,255,255,.08)}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--txt);font:16px/1.5 -apple-system,"Segoe UI",Roboto,Arial,sans-serif;padding:16px}
.w{max-width:560px;margin:0 auto}h1{font-size:22px;margin:8px 0 2px;color:var(--amb)}.sub{color:var(--txt2);margin:0 0 18px;font-size:14px}
.card{background:var(--card);border-radius:14px;padding:14px 16px;margin-bottom:12px}
form{display:flex;gap:8px}input{flex:1;min-width:0;background:#111;border:1px solid #3a3a3d;color:var(--txt);border-radius:10px;padding:12px;font-size:18px;letter-spacing:3px;text-transform:uppercase}
button{background:var(--amb);color:#1d1606;border:0;border-radius:10px;padding:0 18px;font-weight:700;font-size:16px;min-height:48px}
.dia{display:flex;justify-content:space-between;align-items:baseline;gap:8px}.dia b{font-size:15px}.dia span{color:var(--amb);font-weight:700;white-space:nowrap}
.barra{height:6px;background:#333;border-radius:4px;margin:6px 0 8px;overflow:hidden}.barra i{display:block;height:100%;background:var(--amb)}
ul{list-style:none;margin:0;padding:0}li{display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-top:1px solid var(--lin);font-size:14px}
li small{color:var(--txt2)}.vazio{color:var(--txt2);text-align:center;padding:18px 0}.erro{color:#ef6b6b}
</style></head><body><div class="w">
<h1>ME MIMEI</h1>
<p class="sub">Histórico dos últimos 7 dias do seu relógio. O código fica no relógio: menu → <b>Meu histórico</b>.</p>
<div class="card"><form method="get"><input name="c" maxlength="8" autocomplete="off" aria-label="Código do relógio" placeholder="CÓDIGO" value="<?= $h($codigo) ?>"><button>Ver</button></form>
<?php if ($codigo !== '' && !$ap): ?><p class="erro" style="margin:10px 0 0">Código não encontrado. Confira as 8 letras no relógio.</p><?php endif; ?></div>
<?php if ($ap): ?>
<?php if ($msg): ?><div class="card aviso" role="status"><?= $h($msg) ?></div><?php endif; ?>
<div class="card seq"><div class="dia"><b><?= (int)$seq[0] ?> dia<?= $seq[0] == 1 ? '' : 's' ?> seguido<?= $seq[0] == 1 ? '' : 's' ?> dentro do saldo 🔥</b></div>
<p class="sub" style="margin:4px 0 0">Melhor sequência: <?= (int)$seq[1] ?> dia<?= $seq[1] == 1 ? '' : 's' ?>. O dia conta quando você comeu no máximo o que queimou (com registro ou atividade).</p></div>
<div class="card"><div class="dia"><b>Adicionar lanche</b><span style="color:var(--txt2);font-weight:400;font-size:13px">vai para o relógio</span></div>
<form method="post" class="add"><input type="hidden" name="csrf" value="<?= $h($csrf) ?>"><input type="hidden" name="f" value="add">
<input type="search" id="busca" placeholder="Buscar lanche" aria-label="Buscar lanche" autocomplete="off" class="busca">
<select name="lanche" id="lanche" aria-label="Lanche" required><?php foreach ($cardapio as $l): ?><option value="<?= (int)$l['id'] ?>"><?= $h($l['nome']) ?> · <?= (int)$l['kcal'] ?> kcal<?= !empty($l['zero']) ? ' · ZERO (livre)' : '' ?></option><?php endforeach; ?></select>
<div class="linha"><select name="qtd" aria-label="Quantidade"><option value="1">1</option><option value="0.5">meia</option><option value="2">2</option></select><button>Adicionar</button></div></form>
<?php if ($hojeReg): ?><ul style="margin-top:10px"><?php foreach ($hojeReg as $c): ?><li><span><?= $h($qtd($c['qtd'])) ?>× <?= $h($c['nome']) ?></span><form method="post" style="display:inline"><input type="hidden" name="csrf" value="<?= $h($csrf) ?>"><input type="hidden" name="f" value="apagar"><input type="hidden" name="id" value="<?= (int)$c['id'] ?>"><small><?= (int)$c['kcal'] ?> kcal</small> <button class="mini-bt" aria-label="Apagar">✕</button></form></li><?php endforeach; ?></ul><?php endif; ?>
</div>
<div class="card"><div class="dia"><b>Conquistas</b><span><?= count($conq) ?>/<?= count(MIMEI116_CONQ) ?></span></div>
<div class="conqs"><?php foreach (MIMEI116_CONQ as $k => $c): $tem = isset($conq[$k]); ?><div class="conq<?= $tem ? ' on' : '' ?>" title="<?= $h($c[2]) ?>"><i><?= $c[0] ?></i><b><?= $h($c[1]) ?></b><small><?= $tem ? date('d/m/Y', strtotime($conq[$k])) : $h($c[2]) ?></small></div><?php endforeach; ?></div></div>
<div class="card"><div class="dia"><b>Amigos / casal</b><span style="color:var(--txt2);font-weight:400;font-size:13px">opcional</span></div>
<?php if ($par): ?>
<p class="sub" style="margin:6px 0">Pareado com <b style="color:var(--txt)"><?= $h($par['nome']) ?></b>. Lanches ganhos = kcal queimadas ÷ 300 (coxinhas).</p>
<?php if ($placar): [$eu, $ele] = $placar; foreach ([['Hoje', 'hoje'], ['Semana', 'semana']] as [$rot, $k]): $a = floor($eu[$k] / 300); $b = floor($ele[$k] / 300); ?>
<div class="placar"><span class="rot"><?= $rot ?></span><span class="<?= $eu[$k] >= $ele[$k] ? 'win' : '' ?>">Você <b><?= $a ?></b> 🍗<small><?= $eu[$k] ?> kcal</small></span><span class="<?= $ele[$k] > $eu[$k] ? 'win' : '' ?>"><?= $h($par['nome']) ?> <b><?= $b ?></b> 🍗<small><?= $ele[$k] ?> kcal</small></span></div>
<?php endforeach; endif; ?>
<form method="post" onsubmit="return confirm('Desfazer o pareamento?')"><input type="hidden" name="csrf" value="<?= $h($csrf) ?>"><input type="hidden" name="f" value="desfazer"><input type="hidden" name="id" value="<?= (int)$par['id'] ?>"><button class="sec">Desfazer pareamento</button></form>
<?php else: ?>
<?php foreach ($convites as $cv): ?><form method="post" class="convite"><input type="hidden" name="csrf" value="<?= $h($csrf) ?>"><input type="hidden" name="id" value="<?= (int)$cv['id'] ?>"><p style="margin:4px 0">O relógio <b><?= $h($cv['de']) ?></b> quer comparar lanches com você.</p><div class="linha"><input name="apelido" maxlength="20" placeholder="Apelido (opcional)" aria-label="Apelido do amigo" class="txt"><button name="f" value="aceitar">Aceitar</button><button name="f" value="recusar" class="sec">Recusar</button></div></form><?php endforeach; ?>
<?php foreach ($enviados as $ev): ?><p class="sub" style="margin:6px 0">Convite enviado para <b><?= $h($ev['para']) ?></b>, aguardando aceitar.</p><?php endforeach; ?>
<p class="sub" style="margin:6px 0">Compare quem “ganhou” mais lanches hoje e na semana. Digite o código do relógio do amigo (menu → Meu histórico).</p>
<form method="post"><input type="hidden" name="csrf" value="<?= $h($csrf) ?>"><input type="hidden" name="f" value="convidar"><div class="linha"><input name="amigo" maxlength="8" placeholder="CÓDIGO DO AMIGO" aria-label="Código do amigo" class="txt cod" required><input name="apelido" maxlength="20" placeholder="Apelido" aria-label="Apelido" class="txt"><button>Convidar</button></div></form>
<?php endif; ?></div>
<?php endif; ?>
<?php if ($ap): ?>
<?php if (!$dias): ?><div class="card vazio">Nada registrado nos últimos 7 dias.</div><?php endif; ?>
<?php if ($queim): $qs = array_sum($queim); $cs = 0; foreach ($queim as $dt => $_) $cs += (int)($dias[$dt]['kcal'] ?? 0); $sal = $qs - $cs; ?>
<div class="card"><div class="dia"><b>Saldo da semana</b><span style="color:<?= $sal >= 0 ? '#5ee08a' : '#ef6b6b' ?>"><?= $sal >= 0 ? '+' : '' ?><?= $sal ?> kcal</span></div>
<p class="sub" style="margin:4px 0 0"><?= $qs ?> kcal queimadas · <?= $cs ?> kcal em lanches · <?= count($queim) ?> dia(s) com o relógio</p></div>
<?php endif; ?>
<?php foreach ($dias as $data => $d): $ts = strtotime($data); ?>
<div class="card">
<div class="dia"><b><?= $data === date('Y-m-d') ? 'Hoje' : $semana[(int)date('w', $ts)] . ', ' . date('d/m', $ts) ?></b><span><?= (int)$d['kcal'] ?> kcal</span></div>
<?php if (isset($queim[$data])): ?><p class="sub" style="margin:2px 0 0">Queimou <?= (int)$queim[$data] ?> kcal · <button type="button" class="compartilhar" data-dia="<?= $h($data === date('Y-m-d') ? 'Hoje' : date('d/m', $ts)) ?>" data-q="<?= (int)$queim[$data] ?>" data-c="<?= (int)$d['kcal'] ?>" data-itens="<?= $h(implode(' · ', array_map(fn($c) => $qtd($c['qtd']) . '× ' . $c['nome'], array_slice($hoje[$data] ?? [], 0, 4)))) ?>">Compartilhar</button></p><?php endif; ?>
<div class="barra"><i style="width:<?= round(100 * $d['kcal'] / $max) ?>%"></i></div>
<ul><?php foreach ($hoje[$data] ?? [] as $c): ?><li><span><?= $h($qtd($c['qtd'])) ?>× <?= $h($c['nome']) ?> <small><?= $h($c['hora']) ?></small></span><small><?= (int)$c['kcal'] ?> kcal</small></li><?php endforeach; ?></ul>
</div>
<?php endforeach; endif; ?>
<p class="sub" style="text-align:center">alequizao.com/garmin</p>
</div>
<style>.aviso{border:1px solid var(--amb)}.seq b{font-size:17px}.add{display:flex;flex-direction:column;gap:8px;margin-top:8px}.add select,.txt,.busca{background:#111;border:1px solid #3a3a3d;color:var(--txt);border-radius:10px;padding:10px;font-size:15px;min-height:44px;width:100%;letter-spacing:0;text-transform:none}.linha{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px}.linha>*{flex:1 1 90px}.linha button{flex:0 0 auto}button.sec{background:none;border:1px solid #555;color:var(--txt);margin-top:8px}.mini-bt{background:none;border:0;color:#ef6b6b;min-height:24px;padding:0 6px;font-size:14px}.cod{text-transform:uppercase;letter-spacing:2px}.conqs{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;margin-top:8px}.conq{background:#1a1a1c;border-radius:12px;padding:10px;text-align:center;opacity:.45;filter:grayscale(1)}.conq.on{opacity:1;filter:none;border:1px solid var(--amb)}.conq i{font-style:normal;font-size:28px;display:block}.conq b{display:block;font-size:13px}.conq small{color:var(--txt2);font-size:11px}.placar{display:grid;grid-template-columns:70px 1fr 1fr;gap:8px;align-items:center;padding:8px 0;border-top:1px solid var(--lin);font-size:14px}.placar .rot{color:var(--txt2)}.placar small{display:block;color:var(--txt2);font-size:11px}.placar .win b{color:var(--amb)}.placar b{font-size:20px}.compartilhar{background:none;border:1px solid var(--amb);color:var(--amb);min-height:30px;padding:0 12px;font-size:13px;margin-left:6px;border-radius:99px}</style>
<script>
/* gera uma imagem 1080x1350 do dia e abre o compartilhar do celular (Instagram, WhatsApp...) ou baixa */
document.querySelectorAll('.compartilhar').forEach(function (b) {
  b.addEventListener('click', async function () {
    var W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H; var x = c.getContext('2d');
    var g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1b1b1d'); g.addColorStop(1, '#0d0d0e'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.textAlign = 'center'; x.fillStyle = '#f5c23b'; x.font = '700 64px system-ui,Arial'; x.fillText('ME MIMEI', W / 2, 170);
    x.fillStyle = '#a3a3a8'; x.font = '40px system-ui,Arial'; x.fillText(b.dataset.dia, W / 2, 240);
    var q = +b.dataset.q, cm = +b.dataset.c, sal = q - cm;
    x.fillStyle = '#fff'; x.font = '800 190px system-ui,Arial'; x.fillText(q, W / 2, 560);
    x.fillStyle = '#a3a3a8'; x.font = '44px system-ui,Arial'; x.fillText('kcal queimadas', W / 2, 630);
    var n = Math.floor(q / 150);
    x.fillStyle = '#f5c23b'; x.font = '700 70px system-ui,Arial'; x.fillText('= ' + n + ' cerveja' + (n === 1 ? '' : 's') + ' 🍺', W / 2, 800);
    x.fillStyle = sal >= 0 ? '#5ee08a' : '#ef6b6b'; x.font = '600 50px system-ui,Arial';
    x.fillText(sal >= 0 ? 'Sobraram ' + sal + ' kcal' : 'Passei ' + (-sal) + ' kcal', W / 2, 920);
    x.fillStyle = '#d0d0d4'; x.font = '38px system-ui,Arial'; x.fillText((b.dataset.itens || '').slice(0, 60), W / 2, 1010);
    x.fillStyle = '#6a6a70'; x.font = '34px system-ui,Arial'; x.fillText('ME MIMEI para relógios Garmin · alequizao.com/garmin', W / 2, 1270);
    c.toBlob(async function (blob) {
      var f = new File([blob], 'me-mimei.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f], text: 'Meu dia no ME MIMEI' }); return; } catch (e) { } }
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'me-mimei.png'; a.click();
    }, 'image/png');
  });
});
</script>
<script>
/* busca simples no select do cardápio */
(function () { var b = document.getElementById('busca'), s = document.getElementById('lanche'); if (!b || !s) return;
  var ops = Array.prototype.slice.call(s.options).map(function (o) { return [o.value, o.text]; });
  var sa = function (t) { return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); };
  b.addEventListener('input', function () { var q = sa(b.value); s.innerHTML = ''; ops.filter(function (o) { return !q || sa(o[1]).indexOf(q) >= 0; }).forEach(function (o) { var e = document.createElement('option'); e.value = o[0]; e.textContent = o[1]; s.appendChild(e); }); });
})();
</script>
</body></html>
