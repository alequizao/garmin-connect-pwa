<?php
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
@mkdir(__DIR__ . '/icons');
foreach ([['icon-192.png', 192, false], ['icon-512.png', 512, false], ['icon-512-maskable.png', 512, true]] as [$f, $s, $mask]) {
  $im = imagecreatetruecolor($s, $s); imagesavealpha($im, true); imageantialias($im, true);
  $bg = imagecolorallocate($im, 0, 0, 0); imagefill($im, 0, 0, $bg);
  $azul = imagecolorallocate($im, 0, 160, 223); $branco = imagecolorallocate($im, 255, 255, 255);
  $c = $s / 2; $r = $mask ? $s * 0.36 : $s * 0.42;
  // anel azul
  for ($i = 0; $i < $s * 0.07; $i++) imageellipse($im, $c, $c, ($r - $i) * 2, ($r - $i) * 2, $azul);
  // triângulo (delta) branco no centro
  $h = $r * 0.9;
  imagefilledpolygon($im, [$c, $c - $h * 0.55, $c - $h * 0.5, $c + $h * 0.4, $c + $h * 0.5, $c + $h * 0.4], $branco);
  imagefilledpolygon($im, [$c, $c - $h * 0.2, $c - $h * 0.22, $c + $h * 0.25, $c + $h * 0.22, $c + $h * 0.25], $bg);
  imagepng($im, __DIR__ . "/icons/$f"); imagedestroy($im); echo "$f\n";
}
