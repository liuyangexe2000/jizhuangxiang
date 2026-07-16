-- 阶段C：账单异议→箱管调整→客户再确认闭环，为已有库追加字段（全量 db:init 可不跑）
-- 用法：mysql -u root -p container_biz < scripts/sql/alter-bill-dispute.sql
-- 若列已存在会报错，可忽略对应语句。

USE `container_biz`;

ALTER TABLE `bills` ADD COLUMN `disputeReason` VARCHAR(255) NULL AFTER `items`;
ALTER TABLE `bills` ADD COLUMN `adjustedBy` VARCHAR(60) NULL AFTER `disputeReason`;
