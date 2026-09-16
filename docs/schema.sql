
CREATE TABLE IF NOT EXISTS `atividades` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `usuario_id` int(11) NOT NULL,
  `uid` varchar(40) DEFAULT NULL,
  `tipo` varchar(30) NOT NULL,
  `nome` varchar(150) NOT NULL,
  `inicio` datetime NOT NULL,
  `fim` datetime DEFAULT NULL,
  `duracao_s` int(11) DEFAULT '0',
  `tempo_movimento_s` int(11) DEFAULT '0',
  `distancia_m` decimal(10,1) DEFAULT '0.0',
  `calorias` int(11) DEFAULT '0',
  `fc_media` smallint(6) DEFAULT NULL,
  `fc_max` smallint(6) DEFAULT NULL,
  `velocidade_media` decimal(6,2) DEFAULT NULL,
  `velocidade_max` decimal(6,2) DEFAULT NULL,
  `ritmo_medio` decimal(6,2) DEFAULT NULL,
  `elevacao_ganho` int(11) DEFAULT '0',
  `elevacao_perda` int(11) DEFAULT '0',
  `passos` int(11) DEFAULT '0',
  `cadencia` smallint(6) DEFAULT NULL,
  `esforco` tinyint(4) DEFAULT NULL,
  `notas` text,
  `pontos` longtext,
  `voltas` text,
  `clima` varchar(80) DEFAULT NULL,
  `criado` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_uid` (`usuario_id`,`uid`),
  KEY `k_user_inicio` (`usuario_id`,`inicio`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS `config_app` (
  `chave` varchar(60) NOT NULL,
  `valor` text,
  PRIMARY KEY (`chave`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS `dispositivos` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `usuario_id` int(11) NOT NULL,
  `nome` varchar(120) NOT NULL,
  `tipo` varchar(40) NOT NULL,
  `identificador` varchar(120) DEFAULT NULL,
  `ultimo_uso` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk` (`usuario_id`,`identificador`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS `fc_amostras` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `usuario_id` int(11) NOT NULL,
  `ts` datetime NOT NULL,
  `bpm` smallint(6) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `k` (`usuario_id`,`ts`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS `garmin_dados` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `usuario_id` int(11) NOT NULL,
  `tipo` varchar(60) NOT NULL,
  `chave` varchar(40) NOT NULL,
  `data` date DEFAULT NULL,
  `json` longtext,
  `atualizado` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `u` (`usuario_id`,`tipo`,`chave`),
  KEY `d` (`usuario_id`,`tipo`,`data`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS `integracoes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `usuario_id` int(11) NOT NULL,
  `servico` varchar(20) NOT NULL,
  `config` text,
  `status` varchar(20) DEFAULT 'pendente',
  `erro` text,
  `ultimo_sync` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk` (`usuario_id`,`servico`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS `livetrack_pontos` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `sessao_id` int(11) DEFAULT NULL,
  `ts` bigint(20) DEFAULT NULL,
  `lat` double DEFAULT NULL,
  `lon` double DEFAULT NULL,
  `alt` double DEFAULT NULL,
  `vel` double DEFAULT NULL,
  `fc` int(11) DEFAULT NULL,
  `dist` double DEFAULT NULL,
  `dur` int(11) DEFAULT NULL,
  `extra` text,
  PRIMARY KEY (`id`),
  UNIQUE KEY `u` (`sessao_id`,`ts`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS `livetrack_sessoes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `usuario_id` int(11) NOT NULL DEFAULT '1',
  `sessao` varchar(60) DEFAULT NULL,
  `token` varchar(60) DEFAULT NULL,
  `nome` varchar(200) DEFAULT NULL,
  `status` varchar(20) DEFAULT 'nova',
  `origem` varchar(20) DEFAULT NULL,
  `pontos` int(11) DEFAULT '0',
  `ultimo_ponto` bigint(20) DEFAULT NULL,
  `lat` double DEFAULT NULL,
  `lon` double DEFAULT NULL,
  `erro` varchar(300) DEFAULT NULL,
  `criado` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `atualizado` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `tentativas` int(11) DEFAULT '0',
  `proxima` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `sessao` (`sessao`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS `login_falhas` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `ip` varchar(45) DEFAULT NULL,
  `email` varchar(190) DEFAULT NULL,
  `quando` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `k` (`ip`,`quando`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS `medalhas` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `usuario_id` int(11) NOT NULL,
  `codigo` varchar(60) NOT NULL,
  `conquistada` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk` (`usuario_id`,`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS `metas` (
  `usuario_id` int(11) NOT NULL,
  `passos` int(11) DEFAULT '10000',
  `calorias` int(11) DEFAULT '500',
  `minutos_intensidade` int(11) DEFAULT '150',
  `agua_ml` int(11) DEFAULT '2500',
  `sono_h` decimal(3,1) DEFAULT '8.0',
  `distancia_semana_km` decimal(6,1) DEFAULT '20.0',
  `peso_alvo` decimal(5,1) DEFAULT NULL,
  `andares` int(11) DEFAULT '10',
  PRIMARY KEY (`usuario_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS `metricas` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `usuario_id` int(11) NOT NULL,
  `data` date NOT NULL,
  `tipo` varchar(30) NOT NULL,
  `valor` decimal(10,2) NOT NULL DEFAULT '0.00',
  `extra` text,
  `atualizado` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk` (`usuario_id`,`data`,`tipo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS `push_inscricoes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `usuario_id` int(11) NOT NULL,
  `endpoint` varchar(500) NOT NULL,
  `p256dh` varchar(200) NOT NULL,
  `auth` varchar(100) NOT NULL,
  `agente` varchar(200) DEFAULT NULL,
  `criado` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `e` (`endpoint`(255)),
  KEY `u` (`usuario_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS `relogio_apps` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `usuario_id` int(11) NOT NULL,
  `nome` varchar(60) DEFAULT NULL,
  `device` varchar(40) DEFAULT NULL,
  `modelo` varchar(20) DEFAULT 'fr165',
  `token` char(32) DEFAULT NULL,
  `status` varchar(20) DEFAULT 'pendente',
  `erro` varchar(300) DEFAULT NULL,
  `traccar_id` int(11) DEFAULT NULL,
  `criado` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `pronto_em` datetime DEFAULT NULL,
  `tipo` varchar(20) NOT NULL DEFAULT 'rastreador',
  `canal_id` int(11) DEFAULT NULL,
  `visto` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `token` (`token`),
  KEY `d` (`device`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS `relogio_leituras` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `app_id` int(11) DEFAULT NULL,
  `usuario_id` int(11) DEFAULT NULL,
  `recebido` datetime DEFAULT CURRENT_TIMESTAMP,
  `relogio_ts` int(11) DEFAULT NULL,
  `origem` varchar(20) DEFAULT NULL,
  `bateria` decimal(5,1) DEFAULT NULL,
  `carregando` tinyint(4) DEFAULT NULL,
  `bateria_dias` decimal(6,1) DEFAULT NULL,
  `lat` double DEFAULT NULL,
  `lon` double DEFAULT NULL,
  `precisao` tinyint(4) DEFAULT NULL,
  `fix_ts` int(11) DEFAULT NULL,
  `alt` double DEFAULT NULL,
  `vel` double DEFAULT NULL,
  `fc` smallint(6) DEFAULT NULL,
  `passos` int(11) DEFAULT NULL,
  `body_battery` smallint(6) DEFAULT NULL,
  `estresse` smallint(6) DEFAULT NULL,
  `spo2` smallint(6) DEFAULT NULL,
  `traccar` varchar(20) DEFAULT NULL,
  `json` text,
  PRIMARY KEY (`id`),
  KEY `r` (`usuario_id`,`recebido`),
  KEY `a` (`app_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS `senha_tokens` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `usuario_id` int(11) NOT NULL,
  `hash` char(64) DEFAULT NULL,
  `ip` varchar(45) DEFAULT NULL,
  `criado` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `expira` datetime DEFAULT NULL,
  `usado` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `hash` (`hash`),
  KEY `u` (`usuario_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS `strava_envios` (
  `atividade_id` int(11) NOT NULL,
  `usuario_id` int(11) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'fila',
  `strava_id` bigint(20) DEFAULT NULL,
  `upload_id` bigint(20) DEFAULT NULL,
  `erro` varchar(300) DEFAULT NULL,
  `tentativas` int(11) DEFAULT '0',
  `enviado` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`atividade_id`),
  KEY `u` (`usuario_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS `traccar_envios` (
  `atividade_id` int(11) NOT NULL,
  `device` varchar(60) DEFAULT NULL,
  `pontos` int(11) DEFAULT NULL,
  `enviados` int(11) DEFAULT NULL,
  `status` varchar(20) DEFAULT NULL,
  `erro` varchar(300) DEFAULT NULL,
  `enviado` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`atividade_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS `treinos` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `usuario_id` int(11) NOT NULL,
  `nome` varchar(150) NOT NULL,
  `tipo` varchar(30) NOT NULL,
  `etapas` text NOT NULL,
  `agendado` date DEFAULT NULL,
  `concluido` tinyint(4) DEFAULT '0',
  `criado` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS `usuarios` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nome` varchar(120) NOT NULL,
  `email` varchar(190) NOT NULL,
  `email_recuperacao` varchar(190) DEFAULT NULL,
  `senha` varchar(255) NOT NULL,
  `nascimento` date DEFAULT NULL,
  `sexo` enum('M','F','O') DEFAULT NULL,
  `altura_cm` smallint(6) DEFAULT NULL,
  `peso_kg` decimal(5,1) DEFAULT NULL,
  `fc_max` smallint(6) DEFAULT NULL,
  `fc_repouso` smallint(6) DEFAULT NULL,
  `avatar` varchar(255) DEFAULT NULL,
  `criado` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS `walkie_canais` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nome` varchar(40) NOT NULL,
  `codigo` varchar(8) NOT NULL,
  `frases` text,
  `criado_por` int(11) NOT NULL,
  `criado` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `chave_api` char(32) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `codigo` (`codigo`),
  UNIQUE KEY `ch` (`chave_api`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS `walkie_membros` (
  `canal_id` int(11) NOT NULL,
  `usuario_id` int(11) NOT NULL,
  `entrou` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`canal_id`,`usuario_id`),
  KEY `u` (`usuario_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS `walkie_mensagens` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `canal_id` int(11) NOT NULL,
  `usuario_id` int(11) DEFAULT NULL,
  `app_id` int(11) DEFAULT NULL,
  `autor` varchar(40) DEFAULT NULL,
  `texto` varchar(160) NOT NULL,
  `sos` tinyint(4) DEFAULT '0',
  `tipo` varchar(10) DEFAULT 'texto',
  `lat` double DEFAULT NULL,
  `lon` double DEFAULT NULL,
  `origem` varchar(10) DEFAULT NULL,
  `criado` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `c` (`canal_id`,`id`),
  KEY `a` (`app_id`,`criado`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


