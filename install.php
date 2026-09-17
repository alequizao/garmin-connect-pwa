<?php
if (PHP_SAPI !== 'cli') { http_response_code(403); exit('CLI only'); }
require __DIR__ . '/config.php';
$sql = [
"CREATE TABLE IF NOT EXISTS usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  senha VARCHAR(255) NOT NULL,
  nascimento DATE NULL,
  sexo ENUM('M','F','O') NULL,
  altura_cm SMALLINT NULL,
  peso_kg DECIMAL(5,1) NULL,
  fc_max SMALLINT NULL,
  fc_repouso SMALLINT NULL,
  avatar VARCHAR(255) NULL,
  criado DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
"CREATE TABLE IF NOT EXISTS atividades (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  uid VARCHAR(40) NULL,
  tipo VARCHAR(30) NOT NULL,
  nome VARCHAR(150) NOT NULL,
  inicio DATETIME NOT NULL,
  fim DATETIME NULL,
  duracao_s INT DEFAULT 0,
  tempo_movimento_s INT DEFAULT 0,
  distancia_m DECIMAL(10,1) DEFAULT 0,
  calorias INT DEFAULT 0,
  fc_media SMALLINT NULL,
  fc_max SMALLINT NULL,
  velocidade_media DECIMAL(6,2) NULL,
  velocidade_max DECIMAL(6,2) NULL,
  ritmo_medio DECIMAL(6,2) NULL,
  elevacao_ganho INT DEFAULT 0,
  elevacao_perda INT DEFAULT 0,
  passos INT DEFAULT 0,
  cadencia SMALLINT NULL,
  esforco TINYINT NULL,
  notas TEXT NULL,
  pontos LONGTEXT NULL,
  voltas TEXT NULL,
  clima VARCHAR(80) NULL,
  criado DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_uid (usuario_id, uid),
  KEY k_user_inicio (usuario_id, inicio)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
"CREATE TABLE IF NOT EXISTS metricas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  data DATE NOT NULL,
  tipo VARCHAR(30) NOT NULL,
  valor DECIMAL(10,2) NOT NULL DEFAULT 0,
  extra TEXT NULL,
  atualizado DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk (usuario_id, data, tipo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
"CREATE TABLE IF NOT EXISTS fc_amostras (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  ts DATETIME NOT NULL,
  bpm SMALLINT NOT NULL,
  KEY k (usuario_id, ts)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
"CREATE TABLE IF NOT EXISTS metas (
  usuario_id INT PRIMARY KEY,
  passos INT DEFAULT 10000,
  calorias INT DEFAULT 500,
  minutos_intensidade INT DEFAULT 150,
  agua_ml INT DEFAULT 2500,
  sono_h DECIMAL(3,1) DEFAULT 8,
  distancia_semana_km DECIMAL(6,1) DEFAULT 20,
  peso_alvo DECIMAL(5,1) NULL,
  andares INT DEFAULT 10
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
"CREATE TABLE IF NOT EXISTS medalhas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  codigo VARCHAR(60) NOT NULL,
  conquistada DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk (usuario_id, codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
"CREATE TABLE IF NOT EXISTS dispositivos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  nome VARCHAR(120) NOT NULL,
  tipo VARCHAR(40) NOT NULL,
  identificador VARCHAR(120) NULL,
  ultimo_uso DATETIME NULL,
  UNIQUE KEY uk (usuario_id, identificador)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
"CREATE TABLE IF NOT EXISTS treinos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  nome VARCHAR(150) NOT NULL,
  tipo VARCHAR(30) NOT NULL,
  etapas TEXT NOT NULL,
  agendado DATE NULL,
  concluido TINYINT DEFAULT 0,
  criado DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
"CREATE TABLE IF NOT EXISTS integracoes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  servico VARCHAR(20) NOT NULL,
  config TEXT NULL,
  status VARCHAR(20) DEFAULT 'pendente',
  erro TEXT NULL,
  ultimo_sync DATETIME NULL,
  UNIQUE KEY uk (usuario_id, servico)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
];
$pdo = db();
foreach ($sql as $s) { $pdo->exec($s); echo "ok\n"; }
$n = $pdo->query("SELECT COUNT(*) FROM usuarios")->fetchColumn();
if (!$n) {
  $pdo->prepare("INSERT INTO usuarios (nome,email,senha,altura_cm,peso_kg,fc_max,fc_repouso,sexo,nascimento) VALUES (?,?,?,?,?,?,?,?,?)")
      ->execute(['Alequizão','alequizao','$2y$10$'.substr(strtr(base64_encode(random_bytes(30)),'+','.'),0,53),175,80,190,60,'M','1990-01-01']);
  $id = $pdo->lastInsertId();
  $pdo->prepare("UPDATE usuarios SET senha=? WHERE id=?")->execute([password_hash('alequizao', PASSWORD_DEFAULT), $id]);
  $pdo->prepare("INSERT INTO metas (usuario_id) VALUES (?)")->execute([$id]);
  echo "usuario alequizao/alequizao criado\n";
}
echo "pronto\n";
