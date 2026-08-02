-- 增量：用箱价目表（本机已有库不重跑 db:init 时使用）
CREATE TABLE IF NOT EXISTS `use_box_price_rules` (
  `id` VARCHAR(32) NOT NULL,
  `pickupCity` VARCHAR(60) NOT NULL,
  `returnCity` VARCHAR(60) NOT NULL,
  `containerType` VARCHAR(10) NOT NULL,
  `unitPrice` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `enabled` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ubpr_route_type` (`pickupCity`, `returnCity`, `containerType`),
  KEY `idx_ubpr_pickup` (`pickupCity`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
