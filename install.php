<?php
/*
 * Garmin Connect PWA · Desenvolvido por Alequizao <alequizao.dev@gmail.com>
 * https://github.com/alequizao · © 2026 Alequizao
 *
 * Instalação (somente pelo terminal):  php install.php
 * Cria/atualiza as tabelas a partir de docs/schema.sql. Se ainda não houver usuários, cria o primeiro
 * com senha SORTEADA (mostrada só aqui). Para escolher: ADMIN_USUARIO=eu ADMIN_SENHA=minhasenha php install.php
 */
if (PHP_SAPI !== 'cli') { http_response_code(403); exit('Somente pelo terminal'); }
require __DIR__ . '/config.php';
$pdo = db();
$sql = preg_replace('~^--.*$~m', '', file_get_contents(__DIR__ . '/docs/schema.sql'));
foreach (array_filter(array_map('trim', explode(';', $sql))) as $cmd) $pdo->exec($cmd);
echo "Tabelas prontas.\n";
if (!(int)$pdo->query("SELECT COUNT(*) FROM usuarios")->fetchColumn()) {
  $usuario = getenv('ADMIN_USUARIO') ?: 'admin';
  $senha = getenv('ADMIN_SENHA') ?: substr(strtr(base64_encode(random_bytes(12)), '+/', 'ab'), 0, 14);
  $pdo->prepare("INSERT INTO usuarios (nome, email, senha) VALUES (?,?,?)")->execute(['Administrador', $usuario, password_hash($senha, PASSWORD_DEFAULT)]);
  $pdo->prepare("INSERT INTO metas (usuario_id) VALUES (?)")->execute([(int)$pdo->lastInsertId()]);
  echo "Primeiro acesso criado → usuário: $usuario  senha: $senha  (troque em Mais → Perfil)\n";
}
