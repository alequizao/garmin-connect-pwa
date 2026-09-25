<?php require __DIR__ . '/config.php'; $v = max(filemtime(__DIR__.'/app.js'), filemtime(__DIR__.'/style.css'));
// app.min.js (gerado por /root/perf-garmin/build.sh) so e usado se estiver mais novo que o fonte app.js
$js = (is_file(__DIR__.'/app.min.js') && filemtime(__DIR__.'/app.min.js') >= filemtime(__DIR__.'/app.js')) ? 'app.min.js' : 'app.js';
$vjs = filemtime(__DIR__.'/'.$js); ?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Garmin Connect</title>
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0a0a0b">
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f2f2f7">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Connect">
<link rel="manifest" href="manifest.json">
<link rel="icon" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/icon-192.png">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="style.css?v=<?= $v ?>">
</head>
<body>
<div id="app"><div class="splash"><div class="logo-anim"></div><div>GARMIN CONNECT</div></div></div>
<div id="toast"></div>
<div id="modal" hidden><div class="modal-box" id="modalBox"></div></div>
<script>window.SW_V="<?= filemtime(__DIR__ . "/sw.js") ?>";window.APP_VERSAO='<?= APP_VERSAO ?>';</script>
<script src="<?= $js ?>?v=<?= $vjs ?>"></script>
</body>
</html>
