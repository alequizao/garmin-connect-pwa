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
  ['Cuscuz com charque', '1 prato 200 g', 390, 'cuscuz_charque'], ['Cuscuz com ovo', '1 prato com 1 ovo frito', 320, 'cuscuz_ovo'], ['Cuscuz com ovo mexido', '1 prato com 2 ovos', 380, 'cuscuz_ovo_mexido'],
  ['Cuscuz com linguiça', '1 prato 200 g', 450, 'cuscuz_linguica'], ['Cuscuz com sardinha', '1 prato 200 g', 360, 'cuscuz_sardinha'], ['Cuscuz com queijo coalho', '1 prato 200 g', 380, 'cuscuz_queijo'],
  ['Cuscuz com carne de sol', '1 prato 200 g', 420, 'cuscuz_carne_sol'], ['Cuscuz com frango', '1 prato 200 g', 340, 'cuscuz_frango'], ['Cuscuz com carne moída', '1 prato 200 g', 380, 'cuscuz_carne_moida'],
  ['Cuscuz com leite', '1 prato com leite', 290, 'cuscuz_leite'], ['Cuscuz com leite de coco', '1 prato com leite de coco', 330, 'cuscuz_leite_coco'], ['Cuscuz com calabresa e queijo', '1 prato 250 g', 520, 'cuscuz_calabresa_queijo'],
  ['Cuscuz com bacon', '1 prato 200 g', 440, 'cuscuz_bacon'], ['Cuscuz com atum', '1 prato 200 g', 330, 'cuscuz_atum'], ['Cuscuz com salsicha', '1 prato 200 g', 380, 'cuscuz_salsicha'],
  ['Cuscuz recheado', '1 fatia recheada 200 g', 430, 'cuscuz_recheado'], ['Cuscuz de tapioca', '1 fatia', 250, 'cuscuz_tapioca'], ['Cuscuz paulista', '1 fatia', 300, 'cuscuz_paulista'],
  /* tapiocas (sabores) */
  ['Tapioca de coco', '1 tapioca', 250, 'tapioca_coco'],
  ['Tapioca de queijo coalho', '1 tapioca', 300, 'tapioca_queijo'],
  ['Tapioca de manteiga', '1 tapioca', 230, 'tapioca_manteiga'],
  ['Tapioca coco e leite condensado', '1 tapioca', 360, 'tapioca_coco_leite_condensado'],
  ['Tapioca de queijo com coco', '1 tapioca', 340, 'tapioca_queijo_coco'],
  ['Tapioca carne de sol e queijo', '1 tapioca', 420, 'tapioca_carne_sol_queijo'],
  ['Tapioca de charque', '1 tapioca', 380, 'tapioca_charque'],
  ['Tapioca de frango com catupiry', '1 tapioca', 390, 'tapioca_frango_catupiry'],
  ['Tapioca de presunto e queijo', '1 tapioca', 350, 'tapioca_presunto_queijo'],
  ['Tapioca de ovo', '1 tapioca com 1 ovo', 300, 'tapioca_ovo'],
  ['Tapioca de calabresa com queijo', '1 tapioca', 420, 'tapioca_calabresa_queijo'],
  ['Tapioca de carne moída', '1 tapioca', 370, 'tapioca_carne_moida'],
  ['Tapioca de atum', '1 tapioca', 320, 'tapioca_atum'],
  ['Tapioca de bacon com queijo', '1 tapioca', 420, 'tapioca_bacon_queijo'],
  ['Tapioca de banana com canela', '1 tapioca', 290, 'tapioca_banana_canela'],
  ['Tapioca de chocolate', '1 tapioca', 380, 'tapioca_chocolate'],
  ['Tapioca de Nutella com morango', '1 tapioca', 400, 'tapioca_nutella_morango'],
  ['Tapioca de doce de leite', '1 tapioca', 360, 'tapioca_doce_leite'],
  ['Tapioca Romeu e Julieta', '1 tapioca', 360, 'tapioca_romeu_julieta'],
  ['Tapioca de requeijão', '1 tapioca', 290, 'tapioca_requeijao'],
  ['Tapioca de peru com queijo', '1 tapioca', 280, 'tapioca_peru'],
  ['Tapioca de camarão', '1 tapioca', 360, 'tapioca_camarao'],
  ['Tapioca carne de sol e nata', '1 tapioca', 450, 'tapioca_carne_sol_nata'],
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
  $grupos = mimeiGrupoAuto(array_merge(array_column(MIMEI_PADRAO, 0), array_column(MIMEI_NORDESTE, 0)));
  $ins = db()->prepare("INSERT INTO mimei_lanches (usuario_id, nome, grupo, porcao, kcal, emoji, ordem) VALUES (?,?,?,?,?,?,?)");
  $i = 0;
  foreach (MIMEI_PADRAO as [$n, $p, $k, $e, $b]) { $ins->execute([$uid, $n, $grupos[$n] ?? null, $p, $k, $e, $i++]); mimeiIconeMelhor($uid, (int)db()->lastInsertId(), $e, $b); }
  foreach (MIMEI_NORDESTE as [$n, $p, $k, $b]) { $ins->execute([$uid, $n, $grupos[$n] ?? null, $p, $k, null, $i++]); mimeiIconeMelhor($uid, (int)db()->lastInsertId(), null, $b); }
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

/* Sabores: nomes que compartilham a 1ª palavra com outro lanche formam um grupo ("Cuscuz com ovo", "Cuscuz de tapioca" → Cuscuz). Retorna [nome => grupo|null]. */
function mimeiPrimeiraPalavra(string $nome): string { return (string)preg_split('/\s+/u', trim($nome))[0]; }
function mimeiGrupoAuto(array $nomes): array {
  $cont = [];
  foreach ($nomes as $n) { $k = mb_strtolower(mimeiPrimeiraPalavra($n)); $cont[$k] = ($cont[$k] ?? 0) + 1; }
  $r = [];
  foreach ($nomes as $n) { $p = mimeiPrimeiraPalavra($n); $r[$n] = mb_strlen($p) >= 2 && $cont[mb_strtolower($p)] > 1 ? mb_strtoupper(mb_substr($p, 0, 1)) . mb_substr($p, 1) : null; }
  return $r;
}
/* preenche grupo dos lanches ainda sem grupo de um usuário (não mexe em grupos definidos à mão) */
function mimeiAgruparUsuario(int $uid): int {
  $st = db()->prepare("SELECT id, nome, grupo FROM mimei_lanches WHERE usuario_id=?"); $st->execute([$uid]); $rows = $st->fetchAll();
  $g = mimeiGrupoAuto(array_column($rows, 'nome')); $up = db()->prepare("UPDATE mimei_lanches SET grupo=? WHERE id=? AND grupo IS NULL"); $n = 0;
  foreach ($rows as $l) if ($l['grupo'] === null && !empty($g[$l['nome']])) { $up->execute([$g[$l['nome']], $l['id']]); $n++; }
  return $n;
}
function mimeiSabor(string $nome, ?string $grupo): string {
  $s = trim($nome);
  if ($grupo !== null && $grupo !== '' && mb_strtolower(mb_substr($s, 0, mb_strlen($grupo))) === mb_strtolower($grupo)) {
    $s = preg_replace('/^(com|de|da|do)\s+/iu', '', trim(mb_substr($s, mb_strlen($grupo))));
  }
  $s = trim($s); if ($s === '') return 'Tradicional';
  return mb_strtoupper(mb_substr($s, 0, 1)) . mb_substr($s, 1);
}

/* 1.17.0: 'zero' = bebida zero/sem açúcar — registra as kcal reais, mas não entra na conversão "cabem N" */
function mimeiLanches(int $uid, string $base = ''): array {
  $st = db()->prepare("SELECT id, nome, grupo, porcao, kcal, zero, emoji, icone, UNIX_TIMESTAMP(atualizado) v FROM mimei_lanches WHERE usuario_id=? AND ativo=1 ORDER BY ordem, id");
  $st->execute([$uid]);
  return array_map(fn($l) => ['id' => (int)$l['id'], 'nome' => $l['nome'], 'grupo' => $l['grupo'] !== null && $l['grupo'] !== '' ? $l['grupo'] : null,
    'sabor' => mimeiSabor($l['nome'], $l['grupo']), 'porcao' => $l['porcao'], 'kcal' => (int)$l['kcal'], 'zero' => (bool)$l['zero'], 'emoji' => $l['emoji'],
    'icone' => $l['icone'] ? $base . 'app/mimei/' . $uid . '/' . $l['icone'] : null], $st->fetchAll());
}

/* 1.13.0: código curto do relógio sem conta, para ver o histórico em /garmin/meu (sem login).
   Aleatório (não derivado do ID do aparelho) e guardado em mimei_aparelhos. */
function mimeiCodigoAparelho(string $aparelho): string {
  $st = db()->prepare("SELECT codigo FROM mimei_aparelhos WHERE aparelho=?"); $st->execute([$aparelho]);
  $info = mimeiInfoRelogio();
  if ($c = $st->fetchColumn()) {
    db()->prepare("UPDATE mimei_aparelhos SET visto=NOW(), modelo=COALESCE(?, modelo), idioma=COALESCE(?, idioma), fw=COALESCE(?, fw), versao=COALESCE(?, versao) WHERE codigo=?")
      ->execute([$info['modelo'], $info['idioma'], $info['fw'], $info['versao'], $c]);
    return $c;
  }
  $abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  for ($t = 0; $t < 10; $t++) {
    $c = ''; for ($i = 0; $i < 8; $i++) $c .= $abc[random_int(0, strlen($abc) - 1)];
    try {
      $local = mimeiLocalidade();
      db()->prepare("INSERT INTO mimei_aparelhos (codigo, aparelho, modelo, idioma, fw, versao, fuso, localidade) VALUES (?,?,?,?,?,?,?,?)")
        ->execute([$c, $aparelho, $info['modelo'], $info['idioma'], $info['fw'], $info['versao'], $info['fuso'], $local]);
      mimeiAvisarNovoRelogio($c, $info, $local);
      return $c;
    }
    catch (PDOException $e) { $st->execute([$aparelho]); if ($x = $st->fetchColumn()) return $x; }
  }
  return '';
}

/* dados do relógio enviados pelo app 1.14.0+ (nada pessoal): modelo, idioma, firmware, versão e fuso */
function mimeiInfoRelogio(): array {
  global $d;
  $limpa = fn($v, $n, $re = '/[^\p{L}0-9 ._-]/u') => ($v === null || $v === '') ? null : mb_substr(preg_replace($re, '', (string)$v), 0, $n);
  $parte = $limpa($d['modelo'] ?? null, 20, '/[^A-Za-z0-9-]/');
  $nomes = @include __DIR__ . '/mimei_modelos.php';
  $modelo = $parte ? (is_array($nomes) && isset($nomes[$parte]) ? $nomes[$parte] . " ($parte)" : $parte) : null;
  $fuso = isset($d['fuso']) && is_numeric($d['fuso']) ? (int)$d['fuso'] : null;
  return ['modelo' => $modelo ? mb_substr($modelo, 0, 60) : null, 'idioma' => $limpa($d['idioma'] ?? null, 20), 'fw' => $limpa($d['fw'] ?? null, 12),
    'versao' => $limpa($d['versao'] ?? null, 12, '/[^0-9.]/'), 'fuso' => $fuso === null ? null : sprintf('UTC%+d', intdiv($fuso, 3600))];
}

/* localidade aproximada (cidade/estado/país) pelo IP da conexão do celular — só texto, o IP não é guardado */
function mimeiLocalidade(): ?string {
  $ip = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '';
  if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) return null;
  $ctx = stream_context_create(['http' => ['timeout' => 4], 'ssl' => ['verify_peer' => true]]);
  $j = json_decode((string)@file_get_contents('https://ipwho.is/' . rawurlencode($ip) . '?fields=success,city,region,country&lang=pt-BR', false, $ctx), true);
  if (empty($j['success'])) return null;
  $partes = array_filter([$j['city'] ?? '', $j['region'] ?? '', $j['country'] ?? '']);
  return $partes ? mb_substr(implode(', ', $partes), 0, 120) : null;
}

/* e-mail ao dono quando um relógio novo usa o app pela 1ª vez (a Garmin não avisa instalações;
   isto dispara na primeira vez que o app abre com internet) */
const MIMEI_AVISO_PARA = 'alexjuniorcalado@gmail.com';
function mimeiAvisarNovoRelogio(string $codigo, array $info = [], ?string $local = null): void {
  try {
    require_once __DIR__ . '/lib_email.php';
    $total = (int)db()->query("SELECT COUNT(*) FROM mimei_aparelhos")->fetchColumn();
    $e = fn($v) => htmlspecialchars((string)($v ?? '—'), ENT_QUOTES, 'UTF-8');
    $quando = date('d/m/Y H:i');
    $html = '<div style="font-family:Arial,sans-serif;font-size:15px;color:#222">'
      . '<h2 style="color:#e0a100;margin:0 0 8px">🍗 ME MIMEI: novo relógio</h2>'
      . "<p>Um relógio novo abriu o ME MIMEI pela primeira vez.</p>"
      . "<ul><li><b>Quando:</b> $quando</li><li><b>Relógio:</b> " . $e($info['modelo'] ?? null) . "</li>"
      . "<li><b>Localidade (aproximada):</b> " . $e($local) . "</li><li><b>Fuso:</b> " . $e($info['fuso'] ?? null) . "</li>"
      . "<li><b>Idioma do relógio:</b> " . $e($info['idioma'] ?? null) . "</li><li><b>Firmware:</b> " . $e($info['fw'] ?? null) . "</li>"
      . "<li><b>Versão do app:</b> " . $e($info['versao'] ?? null) . "</li><li><b>Código do relógio:</b> $codigo</li>"
      . "<li><b>Total de relógios:</b> $total</li></ul>"
      . '<p style="color:#777;font-size:13px">A Garmin não informa instalações nem dados da conta; este aviso chega quando o app é aberto com internet pela 1ª vez. A localidade vem do IP do celular (aproximada). Relógios com app anterior à 1.14.0 não enviam modelo, idioma e firmware.</p></div>';
    $det = '';
    smtpEnviar(MIMEI_AVISO_PARA, "ME MIMEI: novo relógio (total $total)", $html, $det);
  } catch (Throwable $e) { error_log('mimei aviso: ' . $e->getMessage()); }
}
