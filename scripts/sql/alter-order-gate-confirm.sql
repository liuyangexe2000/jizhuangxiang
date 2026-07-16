-- 阶段B：提/还箱现场确认（R04/R06），为已有库追加字段（全量 db:init 可不跑）
-- 用法：mysql -u root -p container_biz < scripts/sql/alter-order-gate-confirm.sql
-- 若列已存在会报错，可忽略对应语句。

USE `container_biz`;

ALTER TABLE `use_box_orders` ADD COLUMN `pickupGateBy` VARCHAR(60) NULL AFTER `adminRemark`;
ALTER TABLE `use_box_orders` ADD COLUMN `pickupGateAt` VARCHAR(32) NULL AFTER `pickupGateBy`;
ALTER TABLE `use_box_orders` ADD COLUMN `returnGateBy` VARCHAR(60) NULL AFTER `pickupGateAt`;
ALTER TABLE `use_box_orders` ADD COLUMN `returnGateAt` VARCHAR(32) NULL AFTER `returnGateBy`;
