-- 用箱确认流程：为已有库追加字段（全量 db:init 可不跑）
-- 用法：mysql -u root -p container_biz < scripts/sql/alter-usebox-confirm.sql
-- 若列已存在会报错，可忽略对应语句。

USE `container_biz`;

ALTER TABLE `use_box_orders` ADD COLUMN `quotedUnitPrice` DECIMAL(12,2) NULL AFTER `unitPrice`;
ALTER TABLE `use_box_orders` ADD COLUMN `confirmedBy` VARCHAR(120) NULL AFTER `confirmedAt`;
ALTER TABLE `use_box_orders` ADD COLUMN `adminRemark` VARCHAR(255) NULL AFTER `remark`;
