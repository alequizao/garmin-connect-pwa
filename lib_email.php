<?php
/*
 * Garmin Connect PWA · Desenvolvido por Alequizao <alequizao.dev@gmail.com>
 * https://github.com/alequizao · © 2026 Alequizao. Todos os direitos reservados.
 *
 * Envio de e-mail por SMTP (sem dependências). Configuração em config.php: SMTP_HOST, SMTP_PORTA,
 * SMTP_SEGURANCA (tls|ssl|nenhuma), SMTP_USUARIO, SMTP_SENHA, SMTP_DE, SMTP_NOME.
 */

function smtpEnviar(string $para, string $assunto, string $html, string &$detalhe = ''): bool {
  if (!defined('SMTP_HOST') || SMTP_HOST === '') { $detalhe = 'SMTP não configurado'; return false; }
  $seg = defined('SMTP_SEGURANCA') ? SMTP_SEGURANCA : 'tls';
  $user = defined('SMTP_USUARIO') ? SMTP_USUARIO : '';
  $de = defined('SMTP_DE') && SMTP_DE ? SMTP_DE : $user;
  $nome = defined('SMTP_NOME') ? SMTP_NOME : APP_NOME;
  $alvo = ($seg === 'ssl' ? 'ssl://' : '') . SMTP_HOST . ':' . (defined('SMTP_PORTA') ? SMTP_PORTA : 587);
  $fp = @stream_socket_client($alvo, $eno, $estr, 20, STREAM_CLIENT_CONNECT, stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true]]));
  if (!$fp) { $detalhe = "Sem conexão com $alvo: $estr"; return false; }
  stream_set_timeout($fp, 20);
  $ler = function () use ($fp) { $s = ''; while (($l = fgets($fp, 515)) !== false) { $s .= $l; if (strlen($l) < 4 || $l[3] === ' ') break; } return $s; };
  $cmd = function (string $c, string $ok) use ($fp, $ler, &$detalhe) {
    if ($c !== '') fwrite($fp, $c . "\r\n");
    $r = $ler();
    if (strncmp($r, $ok, strlen($ok)) !== 0) { $detalhe = trim(explode(' ', $c)[0] . ': ' . $r); return false; }
    return true;
  };
  $eu = gethostname() ?: 'localhost';
  $passos = [['', '220'], ['EHLO ' . $eu, '250']];
  foreach ($passos as [$c, $ok]) if (!$cmd($c, $ok)) { fclose($fp); return false; }
  if ($seg === 'tls') {
    if (!$cmd('STARTTLS', '220') || !@stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT) || !$cmd('EHLO ' . $eu, '250')) { $detalhe = $detalhe ?: 'Falha no STARTTLS'; fclose($fp); return false; }
  }
  if ($user !== '' && (!$cmd('AUTH LOGIN', '334') || !$cmd(base64_encode($user), '334') || !$cmd(base64_encode(SMTP_SENHA), '235'))) { fclose($fp); return false; }
  foreach ([['MAIL FROM:<' . $de . '>', '250'], ['RCPT TO:<' . $para . '>', '250'], ['DATA', '354']] as [$c, $ok]) if (!$cmd($c, $ok)) { fclose($fp); return false; }
  $b = '=_b_' . bin2hex(random_bytes(8));
  $texto = trim(html_entity_decode(strip_tags(preg_replace('~<(br|/p|/div|/h\d|/tr)[^>]*>~i', "\n", $html)), ENT_QUOTES, 'UTF-8'));
  $msg = implode("\r\n", [
    'Date: ' . date('r'), 'From: ' . mb_encode_mimeheader($nome, 'UTF-8') . ' <' . $de . '>', 'To: <' . $para . '>',
    'Subject: ' . mb_encode_mimeheader($assunto, 'UTF-8'), 'Message-ID: <' . bin2hex(random_bytes(12)) . '@' . $eu . '>',
    'MIME-Version: 1.0', 'Content-Type: multipart/alternative; boundary="' . $b . '"']) . "\r\n\r\n"
    . "--$b\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode(preg_replace("/\n{3,}/", "\n\n", $texto)))
    . "--$b\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($html)) . "--$b--\r\n";
  fwrite($fp, preg_replace('/^\./m', '..', $msg) . "\r\n.\r\n");
  $ok = $cmd('', '250'); $cmd('QUIT', '221'); fclose($fp);
  return $ok;
}

/* modelo do e-mail de redefinição de senha, no mesmo visual do app (escuro, faixa azul) */
function emailRedefinirSenha(string $nome, string $link): string {
  $n = htmlspecialchars($nome, ENT_QUOTES); $l = htmlspecialchars($link, ENT_QUOTES);
  return <<<HTML
<!doctype html><html lang="pt-BR"><body style="margin:0;background:#141414;font-family:Roboto,Arial,sans-serif;color:#f2f2f2">
<span style="display:none">Link para criar uma nova senha — vale por 1 hora.</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#141414;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#2a2a2c;border-radius:18px;overflow:hidden">
<tr><td style="background:#39393c;padding:16px 22px;font-size:18px;color:#fff;border-bottom:3px solid #1fa3e3">▲ GARMIN CONNECT</td></tr>
<tr><td style="padding:26px 22px 8px;font-size:22px;font-weight:300;color:#fff">Olá, {$n}</td></tr>
<tr><td style="padding:0 22px 20px;font-size:15px;line-height:1.6;color:#d4d4d8">Recebemos um pedido para redefinir a sua senha. Toque no botão abaixo para criar uma nova. O link vale por <b style="color:#fff">1 hora</b> e só pode ser usado uma vez.</td></tr>
<tr><td align="center" style="padding:4px 22px 26px"><a href="{$l}" style="display:inline-block;background:#1fa3e3;color:#fff;text-decoration:none;font-size:16px;font-weight:500;padding:14px 34px;border-radius:24px">Criar nova senha</a></td></tr>
<tr><td style="padding:0 22px 24px;font-size:12.5px;line-height:1.6;color:#a3a3a8">Se você não pediu, ignore este e-mail — sua senha continua a mesma.<br>Se o botão não abrir, copie o endereço: <span style="color:#1fa3e3;word-break:break-all">{$l}</span></td></tr>
</table></td></tr></table></body></html>
HTML;
}
