<?php
/*
 * Garmin Connect PWA · Desenvolvido por Alequizao <alequizao.dev@gmail.com>
 * https://github.com/alequizao · © 2026 Alequizao
 */
if (!function_exists('walkieNotificar')) {
/* Web Push para os membros do canal (menos o autor). O Garmin Connect espelha a notificação do celular no relógio. */
function walkieNotificar(int $canal, int $autorUid, string $autor, string $texto, string $tipo): void {
  require_once __DIR__ . '/lib_push.php';
  $st = db()->prepare("SELECT nome FROM walkie_canais WHERE id=?"); $st->execute([$canal]); $nomeCanal = (string)$st->fetchColumn();
  $st = db()->prepare("SELECT p.id, p.endpoint, p.p256dh, p.auth FROM push_inscricoes p JOIN walkie_membros m ON m.usuario_id=p.usuario_id AND m.canal_id=? WHERE p.usuario_id<>?");
  $st->execute([$canal, $autorUid]);
  $titulo = ($tipo === 'sos' ? '🆘 SOS — ' : ($tipo === 'atencao' ? '📣 ' : '📻 ')) . $autor . ' · ' . $nomeCanal;
  $json = json_encode(['titulo' => $titulo, 'corpo' => $tipo === 'atencao' ? 'Está chamando sua atenção! ' . $texto : $texto, 'tag' => 'walkie-' . $canal, 'critico' => $tipo !== 'texto', 'url' => '?tela=app&arg=walkie'], JSON_UNESCAPED_UNICODE);
  foreach ($st->fetchAll() as $s) {
    try { $r = push_enviar($s['endpoint'], $s['p256dh'], $s['auth'], $json); if (in_array((int)($r['status'] ?? 0), [404, 410], true)) db()->prepare("DELETE FROM push_inscricoes WHERE id=?")->execute([$s['id']]); }
    catch (\Throwable $e) { error_log('walkie push: ' . $e->getMessage()); }
  }
}
}
