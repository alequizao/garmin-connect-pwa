<?php
/*
 * Garmin Connect PWA · Desenvolvido por Alequizao <alequizao.dev@gmail.com>
 * https://github.com/alequizao · © 2026 Alequizao
 *
 * Me Mimei — lanches que "cabem" nas calorias ativas do dia (ícones em app/mimei/<usuario>/).
 */

const MIMEI_PADRAO = [ // [nome, porção, kcal, emoji, ícone da biblioteca]
  ['Coxinha', '1 unidade média', 300, '🍗', 'coxinha'], ['Pastel', '1 pastel de feira', 290, '🥟', 'pastel'], ['Bolo', '1 fatia', 350, '🍰', null],
  ['Torta', '1 fatia', 400, '🥧', null], ['Ruffles', 'pacote 45 g', 245, '🥔', 'chips_batata'], ['Cheetos', 'pacote 45 g', 225, '🧀', 'salgadinho_queijo'],
  ['Doritos', 'pacote 45 g', 230, '🔺', 'chips_milho'], ['Acarajé', '1 unidade', 420, '🧆', 'acaraje'], ['Tapioca', '1 tapioca recheada', 280, '🫓', 'tapioca'],
  ['Cerveja lata', '1 lata 350 ml', 150, '🍺', null], ['Cerveja long neck', '1 garrafa 355 ml', 152, '🍺', 'longneck'], ['Cerveja 600 ml', '1 garrafa 600 ml', 258, '🍻', 'garrafa600'],
  ['Pizza', '1 fatia', 280, '🍕', null], ['Sushi', 'combinado 8 peças', 350, '🍣', null], ['Hambúrguer', '1 sanduíche', 500, '🍔', null],
  ['Brigadeiro', '1 unidade', 100, '🍫', null], ['Sorvete', '1 bola', 200, '🍦', null], ['Açaí', 'tigela 500 ml', 480, '🍇', null],
];
/* lanches nordestinos (ícones 3D gerados sob medida) */
const MIMEI_NORDESTE = [
  ['Abará', '1 unidade', 300, 'abara'], ['Cuscuz com manteiga', '1 fatia 150 g', 230, 'cuscuz'], ['Beiju com coco', '1 unidade', 180, 'beiju'],
  ['Bolo de rolo', '1 fatia', 280, 'bolo_rolo'], ['Bolo de macaxeira', '1 fatia', 300, 'bolo_macaxeira'], ['Cocada', '1 unidade', 200, 'cocada'],
  ['Pé de moleque', '1 unidade', 150, 'pe_moleque'], ['Cartola', '1 porção', 450, 'cartola'], ['Canjica', '1 tigela', 300, 'canjica'],
  ['Pamonha', '1 unidade', 280, 'pamonha'], ['Mungunzá', '1 tigela', 330, 'mungunza'], ['Queijo coalho assado', '1 espeto', 200, 'queijo_coalho'],
  ['Macaxeira frita', '1 porção', 380, 'macaxeira_frita'], ['Baião de dois', '1 prato', 450, 'baiao_dois'], ['Carne de sol com macaxeira', '1 prato', 550, 'carne_sol'],
  ['Vatapá', '1 porção', 400, 'vatapa'], ['Caldo de cana', '1 copo 300 ml', 210, 'caldo_cana'], ['Quebra-queixo', '1 pedaço', 180, 'quebra_queixo'],
  ['Rapadura', '1 pedaço 25 g', 95, 'rapadura'], ['Bolinho de estudante', '3 unidades', 250, 'bolinho_estudante'],
];
function mimeiBibliotecaPasta(): string { return __DIR__ . '/app/mimei/biblioteca'; }
function mimeiBiblioteca(): array { return array_map(fn($f) => basename($f, '.png'), glob(mimeiBibliotecaPasta() . '/*.png') ?: []); }
function mimeiIconeBiblioteca(int $uid, int $id, string $slug): ?string {
  $slug = preg_replace('/[^a-z0-9_]/', '', $slug); $f = mimeiBibliotecaPasta() . "/$slug.png";
  return is_file($f) ? mimeiSalvarPng($uid, $id, file_get_contents($f)) : null;
}
function mimeiIconeMelhor(int $uid, int $id, ?string $emoji, ?string $slug): void {
  if ($slug && mimeiIconeBiblioteca($uid, $id, $slug)) return;
  if ($emoji) mimeiIconeEmoji($uid, $id, $emoji);
}

function mimeiPasta(int $uid): string { $p = __DIR__ . '/app/mimei/' . $uid; if (!is_dir($p)) @mkdir($p, 0755, true); return $p; }

function mimeiSemear(int $uid): void {
  $st = db()->prepare("SELECT COUNT(*) FROM mimei_lanches WHERE usuario_id=?"); $st->execute([$uid]);
  if ((int)$st->fetchColumn()) return;
  $ins = db()->prepare("INSERT INTO mimei_lanches (usuario_id, nome, porcao, kcal, emoji, ordem) VALUES (?,?,?,?,?,?)");
  $i = 0;
  foreach (MIMEI_PADRAO as [$n, $p, $k, $e, $b]) { $ins->execute([$uid, $n, $p, $k, $e, $i++]); mimeiIconeMelhor($uid, (int)db()->lastInsertId(), $e, $b); }
  foreach (MIMEI_NORDESTE as [$n, $p, $k, $b]) { $ins->execute([$uid, $n, $p, $k, null, $i++]); mimeiIconeMelhor($uid, (int)db()->lastInsertId(), null, $b); }
}

/* código do Twemoji a partir do emoji (sem o seletor de variação FE0F) */
function mimeiCodigoEmoji(string $e): string {
  $cps = []; foreach (mb_str_split($e) as $ch) { $cp = mb_ord($ch, 'UTF-8'); if ($cp !== 0xFE0F) $cps[] = dechex($cp); }
  return implode('-', $cps);
}

/* grava o ícone PNG 128x128 (fundo transparente) a partir de uma imagem binária */
function mimeiSalvarPng(int $uid, int $id, string $bin): ?string {
  $img = @imagecreatefromstring($bin); if (!$img) return null;
  $t = 128; $dst = imagecreatetruecolor($t, $t); imagealphablending($dst, false); imagesavealpha($dst, true);
  imagefill($dst, 0, 0, imagecolorallocatealpha($dst, 0, 0, 0, 127));
  $w = imagesx($img); $h = imagesy($img); $s = min($t / $w, $t / $h); $nw = (int)round($w * $s); $nh = (int)round($h * $s);
  imagecopyresampled($dst, $img, (int)(($t - $nw) / 2), (int)(($t - $nh) / 2), 0, 0, $nw, $nh, $w, $h);
  foreach (glob(mimeiPasta($uid) . "/$id-*.png") ?: [] as $velho) @unlink($velho);
  $nome = $id . '-' . substr(md5($bin . microtime()), 0, 8) . '.png';
  imagepng($dst, mimeiPasta($uid) . '/' . $nome); imagedestroy($img); imagedestroy($dst);
  db()->prepare("UPDATE mimei_lanches SET icone=? WHERE id=? AND usuario_id=?")->execute([$nome, $id, $uid]);
  return $nome;
}

function mimeiIconeEmoji(int $uid, int $id, string $emoji): ?string {
  $cod = mimeiCodigoEmoji($emoji); if ($cod === '') return null;
  $ctx = stream_context_create(['http' => ['timeout' => 10]]);
  // 1º Fluent Emoji 3D da Microsoft (MIT, 256 px, fica bonito no relógio e em fotos); 2º Twemoji
  foreach (["https://cdn.jsdelivr.net/npm/@lobehub/fluent-emoji-3d@latest/assets/$cod.webp", "https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/72x72/$cod.png"] as $url) {
    $bin = @file_get_contents($url, false, $ctx);
    if ($bin && strlen($bin) > 200 && ($nome = mimeiSalvarPng($uid, $id, $bin))) return $nome;
  }
  return null;
}

/* calorias ativas do dia (Garmin) e o que já foi comido */
function mimeiResumo(int $uid, ?int $kcalRelogio = null): array {
  $st = db()->prepare("SELECT valor FROM metricas WHERE usuario_id=? AND data=CURDATE() AND tipo='calorias_ativas'"); $st->execute([$uid]);
  $garmin = (int)round((float)$st->fetchColumn());
  $st = db()->prepare("SELECT COALESCE(SUM(kcal),0) FROM mimei_consumo WHERE usuario_id=? AND data=CURDATE()"); $st->execute([$uid]);
  $comido = (int)$st->fetchColumn();
  $queimado = max($garmin, (int)$kcalRelogio);
  return ['queimado' => $queimado, 'garmin' => $garmin, 'relogio' => $kcalRelogio, 'comido' => $comido, 'saldo' => max(0, $queimado - $comido)];
}

function mimeiLanches(int $uid, string $base = ''): array {
  $st = db()->prepare("SELECT id, nome, porcao, kcal, emoji, icone, UNIX_TIMESTAMP(atualizado) v FROM mimei_lanches WHERE usuario_id=? AND ativo=1 ORDER BY ordem, id");
  $st->execute([$uid]);
  return array_map(fn($l) => ['id' => (int)$l['id'], 'nome' => $l['nome'], 'porcao' => $l['porcao'], 'kcal' => (int)$l['kcal'], 'emoji' => $l['emoji'],
    'icone' => $l['icone'] ? $base . 'app/mimei/' . $uid . '/' . $l['icone'] : null], $st->fetchAll());
}
