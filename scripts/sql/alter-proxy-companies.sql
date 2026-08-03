-- 增量：代管公司主档
CREATE TABLE IF NOT EXISTS `proxy_companies` (
  `id` VARCHAR(32) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `contactUser` VARCHAR(100) NOT NULL DEFAULT '',
  `phone` VARCHAR(120) NOT NULL DEFAULT '',
  `email` VARCHAR(200) NOT NULL DEFAULT '',
  `enabled` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_proxy_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
