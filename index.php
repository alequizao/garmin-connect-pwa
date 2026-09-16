<?php require __DIR__ . '/config.php'; $v = max(filemtime(__DIR__.'/app.js'), filemtime(__DIR__.'/style.css')); ?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Garmin Connect</title>
<meta name="theme-color" content="#141414">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Connect">
<link rel="manifest" href="manifest.json">
<link rel="icon" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/icon-192.png">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<link rel="stylesheet" href="style.css?v=<?= $v ?>">
</head>
<body>
<div id="app"><div class="splash"><div class="logo-anim"></div><div>GARMIN CONNECT</div></div></div>
<div id="toast"></div>
<div id="modal" hidden><div class="modal-box" id="modalBox"></div></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script>window.APP_VERSAO='<?= APP_VERSAO ?>';</script>
<script src="app.js?v=<?= $v ?>"></script>
</body>
</html>
