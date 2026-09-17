<?php
/*
 * Garmin Connect PWA · Desenvolvido por Alequizao <alequizao.dev@gmail.com>
 * https://github.com/alequizao · © 2026 Alequizao
 *
 * ME MIMEI 1.13.0+: histórico de quem usa o app da loja sem conta. Sem login: o código de 8 letras
 * aparece no relógio (menu → Meu histórico). Só leitura.
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
if ($ap) {
  $st = db()->prepare("SELECT data, SUM(kcal) kcal, COUNT(*) n FROM mimei_consumo WHERE usuario_id=0 AND aparelho=? AND data >= CURDATE() - INTERVAL 6 DAY GROUP BY data ORDER BY data DESC");
  $st->execute([$ap]); foreach ($st->fetchAll() as $r) $dias[$r['data']] = $r;
  $st = db()->prepare("SELECT nome, qtd, kcal, data, TIME_FORMAT(criado,'%H:%i') hora FROM mimei_consumo WHERE usuario_id=0 AND aparelho=? AND data >= CURDATE() - INTERVAL 6 DAY ORDER BY data DESC, id DESC");
  $st->execute([$ap]); foreach ($st->fetchAll() as $r) $hoje[$r['data']][] = $r;
}
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
<?php if (!$dias): ?><div class="card vazio">Nada registrado nos últimos 7 dias.</div><?php endif; ?>
<?php foreach ($dias as $data => $d): $ts = strtotime($data); ?>
<div class="card">
<div class="dia"><b><?= $data === date('Y-m-d') ? 'Hoje' : $semana[(int)date('w', $ts)] . ', ' . date('d/m', $ts) ?></b><span><?= (int)$d['kcal'] ?> kcal</span></div>
<div class="barra"><i style="width:<?= round(100 * $d['kcal'] / $max) ?>%"></i></div>
<ul><?php foreach ($hoje[$data] ?? [] as $c): ?><li><span><?= $h($qtd($c['qtd'])) ?>× <?= $h($c['nome']) ?> <small><?= $h($c['hora']) ?></small></span><small><?= (int)$c['kcal'] ?> kcal</small></li><?php endforeach; ?></ul>
</div>
<?php endforeach; endif; ?>
<p class="sub" style="text-align:center">alequizao.com/garmin</p>
</div></body></html>
