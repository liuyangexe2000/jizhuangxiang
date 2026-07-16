-- 阶段A：预约确认动作，为已有库追加字段（全量 db:init 可不跑）
-- 用法：mysql -u root -p container_biz < scripts/sql/alter-booking-confirm.sql
-- 若列已存在会报错，可忽略对应语句。

USE `container_biz`;

ALTER TABLE `bookings` ADD COLUMN `confirmedBy` VARCHAR(60) NULL AFTER `withinWorkHours`;
ALTER TABLE `bookings` ADD COLUMN `confirmedAt` VARCHAR(32) NULL AFTER `confirmedBy`;
