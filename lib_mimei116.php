<?php
/*
 * ME MIMEI 1.16.0 · Desenvolvido por Alequizao <alequizao.dev@gmail.com>
 * Sequência de dias dentro do saldo, conquistas, modo amigos (duelo), traduções en/es do cardápio público
 * e registro pelo celular. Usado por mimei.php e meu.php.
 * Contexto $cx = ['uid' => usuario_id (0 = relógio da loja), 'ap' => aparelho ('' quando conta)].
 */

function mimei116Tabelas(): void {
  static $ok = false; if ($ok) return; $ok = true;
  db()->exec("CREATE TABLE IF NOT EXISTS mimei_conquistas (usuario_id INT NOT NULL, aparelho VARCHAR(64) NOT NULL DEFAULT '', conquista VARCHAR(20) NOT NULL, quando TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (usuario_id, aparelho, conquista)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  db()->exec("CREATE TABLE IF NOT EXISTS mimei_pares (id INT AUTO_INCREMENT PRIMARY KEY, de CHAR(8) NOT NULL, para CHAR(8) NOT NULL, apelido_de VARCHAR(20) NULL, apelido_para VARCHAR(20) NULL, status VARCHAR(10) NOT NULL DEFAULT 'pendente', criado TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY dp (de, para), KEY p (para)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  db()->exec("CREATE TABLE IF NOT EXISTS mimei_treinos (usuario_id INT NOT NULL, aparelho VARCHAR(64) NOT NULL DEFAULT '', treinos INT NOT NULL DEFAULT 0, PRIMARY KEY (usuario_id, aparelho)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

/* WHERE do consumo para o contexto */
function mimei116Cons(array $cx): array { return $cx['uid'] ? ['usuario_id=?', [$cx['uid']]] : ['usuario_id=0 AND aparelho=?', [$cx['ap']]]; }

/* [data => [queimado, comido]] dos últimos $dias dias */
function mimei116Dias(array $cx, int $dias = 400): array {
  $r = [];
  $st = db()->prepare("SELECT data, queimado FROM mimei_dias WHERE usuario_id=? AND aparelho=? AND data >= CURDATE() - INTERVAL $dias DAY");
  $st->execute([$cx['uid'], $cx['uid'] ? '' : $cx['ap']]);
  foreach ($st->fetchAll() as $x) $r[$x['data']] = [(int)$x['queimado'], 0];
  [$w, $a] = mimei116Cons($cx);
  $st = db()->prepare("SELECT data, SUM(kcal) k FROM mimei_consumo WHERE $w AND data >= CURDATE() - INTERVAL $dias DAY GROUP BY data"); $st->execute($a);
  foreach ($st->fetchAll() as $x) { $r[$x['data']] = $r[$x['data']] ?? [0, 0]; $r[$x['data']][1] = (int)$x['k']; }
  return $r;
}
function mimei116DiaConta(?array $v): bool { return $v !== null && ($v[0] > 0 || $v[1] > 0) && $v[1] <= $v[0]; }

/* [atual, melhor]: dias seguidos dentro do saldo (a atual termina hoje; se hoje ainda não conta, ontem) */
function mimei116Seq(array $cx, ?array $dias = null): array {
  $dias = $dias ?? mimei116Dias($cx);
  $t = strtotime(date('Y-m-d'));
  if (!mimei116DiaConta($dias[date('Y-m-d', $t)] ?? null)) $t -= 86400;
  $atual = 0; while (mimei116DiaConta($dias[date('Y-m-d', $t)] ?? null)) { $atual++; $t -= 86400; }
  ksort($dias); $melhor = 0; $run = 0; $ant = null;
  foreach ($dias as $d => $v) {
    $ts = strtotime($d);
    if (mimei116DiaConta($v)) { $run = ($ant !== null && $ts - $ant <= 90000 && $run > 0) ? $run + 1 : 1; $melhor = max($melhor, $run); } else $run = 0;
    $ant = $ts;
  }
  return [$atual, max($melhor, $atual)];
}

const MIMEI116_CONQ = [ // id => [emoji, nome pt, descrição pt, en nome, es nome]
  'primeiro'    => ['🍽️', 'Primeiro lanche', 'Registrou o primeiro lanche', 'First snack', 'Primer antojo'],
  'coxinhas10'  => ['🔥', '10 coxinhas queimadas', 'Queimou 3.000 kcal em 7 dias (10 coxinhas)', '10 snacks burned', '10 antojos quemados'],
  'seq3'        => ['🥉', '3 dias seguidos', '3 dias seguidos dentro do saldo', '3-day streak', 'Racha de 3 días'],
  'seq7'        => ['🥈', '7 dias seguidos', 'Uma semana inteira dentro do saldo', '7-day streak', 'Racha de 7 días'],
  'seq30'       => ['🥇', '30 dias seguidos', 'Um mês inteiro dentro do saldo', '30-day streak', 'Racha de 30 días'],
  'kcal1000'    => ['⚡', '1.000 kcal num dia', 'Queimou 1.000 kcal ativas num dia', '1,000 kcal in a day', '1.000 kcal en un día'],
  'treinos5'    => ['🏃', '5 treinos', 'Concluiu 5 treinos com o app instalado', '5 workouts', '5 entrenos'],
  'variedade10' => ['🌮', '10 lanches diferentes', 'Experimentou 10 lanches diferentes', '10 different snacks', '10 antojos distintos'],
];

/* calcula, grava as novas e devolve [id => data de desbloqueio] */
function mimei116Conquistas(array $cx, ?int $treinos = null, ?array $dias = null, ?array $seq = null): array {
  mimei116Tabelas();
  $ap = $cx['uid'] ? '' : $cx['ap'];
  if ($treinos !== null && $treinos > 0) {
    db()->prepare("INSERT INTO mimei_treinos (usuario_id, aparelho, treinos) VALUES (?,?,?) ON DUPLICATE KEY UPDATE treinos=GREATEST(treinos, VALUES(treinos))")->execute([$cx['uid'], $ap, min(100000, $treinos)]);
  }
  $st = db()->prepare("SELECT treinos FROM mimei_treinos WHERE usuario_id=? AND aparelho=?"); $st->execute([$cx['uid'], $ap]); $tr = (int)$st->fetchColumn();
  $dias = $dias ?? mimei116Dias($cx); $seq = $seq ?? mimei116Seq($cx, $dias);
  [$w, $a] = mimei116Cons($cx);
  $st = db()->prepare("SELECT COUNT(*) n, COUNT(DISTINCT lanche_id) d FROM mimei_consumo WHERE $w"); $st->execute($a); $c = $st->fetch();
  $q7 = 0; foreach ($dias as $d => $v) if ($d >= date('Y-m-d', strtotime('-6 days'))) $q7 += $v[0];
  $maxQ = 0; foreach ($dias as $v) $maxQ = max($maxQ, $v[0]);
  $ok = ['primeiro' => $c['n'] >= 1, 'coxinhas10' => $q7 >= 3000, 'seq3' => $seq[1] >= 3, 'seq7' => $seq[1] >= 7, 'seq30' => $seq[1] >= 30,
    'kcal1000' => $maxQ >= 1000, 'treinos5' => $tr >= 5, 'variedade10' => $c['d'] >= 10];
  $ins = db()->prepare("INSERT IGNORE INTO mimei_conquistas (usuario_id, aparelho, conquista) VALUES (?,?,?)");
  foreach ($ok as $k => $v) if ($v) $ins->execute([$cx['uid'], $ap, $k]);
  $st = db()->prepare("SELECT conquista, quando FROM mimei_conquistas WHERE usuario_id=? AND aparelho=?"); $st->execute([$cx['uid'], $ap]);
  $r = []; foreach ($st->fetchAll() as $x) if (isset(MIMEI116_CONQ[$x['conquista']])) $r[$x['conquista']] = $x['quando'];
  return $r;
}

/* ---------- amigos / casal ---------- */
function mimei116Par(string $codigo): ?array {
  mimei116Tabelas();
  $st = db()->prepare("SELECT * FROM mimei_pares WHERE status='ok' AND (de=? OR para=?) ORDER BY id DESC LIMIT 1"); $st->execute([$codigo, $codigo]);
  $p = $st->fetch(); if (!$p) return null;
  $amigo = $p['de'] === $codigo ? $p['para'] : $p['de'];
  $apelido = $p['de'] === $codigo ? $p['apelido_de'] : $p['apelido_para'];
  return ['id' => (int)$p['id'], 'codigo' => $amigo, 'nome' => $apelido ?: $amigo];
}
/* kcal queimadas/comidas hoje e em 7 dias de um relógio (pelo aparelho) */
function mimei116Placar(string $ap): array {
  $d = mimei116Dias(['uid' => 0, 'ap' => $ap], 7); $h = $d[date('Y-m-d')] ?? [0, 0]; $s = [0, 0];
  foreach ($d as $k => $v) if ($k >= date('Y-m-d', strtotime('-6 days'))) { $s[0] += $v[0]; $s[1] += $v[1]; }
  return ['hoje' => $h[0], 'hojeC' => $h[1], 'semana' => $s[0], 'semanaC' => $s[1]];
}
function mimei116Duelo(string $codigo, string $ap): ?array {
  $p = mimei116Par($codigo); if (!$p) return null;
  $st = db()->prepare("SELECT aparelho FROM mimei_aparelhos WHERE codigo=?"); $st->execute([$p['codigo']]); $apA = $st->fetchColumn();
  if (!$apA) return null;
  $eu = mimei116Placar($ap); $ele = mimei116Placar($apA);
  return ['nome' => $p['nome'], 'eu' => $eu['hoje'], 'ele' => $ele['hoje'], 'euS' => $eu['semana'], 'eleS' => $ele['semana'], 'euC' => $eu['hojeC'], 'eleC' => $ele['hojeC']];
}

/* ---------- traduções do cardápio público ---------- */
function mimei116Lingua($idioma): string {
  $i = (string)$idioma;
  if ($i === 'Português' || $i === 'Portugues') return 'pt';
  if ($i === 'Español' || $i === 'Espanol') return 'es';
  return 'en';
}
function mimei116Trad(): array { static $t = null; if ($t === null) $t = (@include __DIR__ . '/mimei_traducoes.php') ?: []; return $t; }
function mimei116TraduzLanche(array $l, string $lg): array {
  if ($lg === 'pt') return $l; $t = mimei116Trad()[$l['id']][$lg] ?? null; if (!$t) return $l;
  $l['nome'] = $t[0]; if (array_key_exists('grupo', $l)) $l['grupo'] = $t[1]; if (array_key_exists('sabor', $l)) $l['sabor'] = $t[2];
  if (array_key_exists('porcao', $l) && $t[3] !== null) $l['porcao'] = $t[3];
  return $l;
}
function mimei116NomePorId(?int $id, string $nome, string $lg): string {
  if ($lg === 'pt' || !$id) return $nome; return mimei116Trad()[$id][$lg][0] ?? $nome;
}
