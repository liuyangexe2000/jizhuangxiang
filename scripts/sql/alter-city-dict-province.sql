-- 城市字典追加省/州字段（全量 db:init 可不跑）
-- 用法：mysql -u root -p container_biz < scripts/sql/alter-city-dict-province.sql
-- 若列已存在会报错，可忽略对应语句。

USE `container_biz`;

ALTER TABLE `city_dict` ADD COLUMN `province` VARCHAR(60) NOT NULL DEFAULT '' AFTER `country`;
