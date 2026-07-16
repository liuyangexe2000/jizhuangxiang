-- 堆场表扩展：导入老系统 base_container_factory 全字段
-- 用法：mysql ... < scripts/sql/alter-yards-legacy.sql
-- 若列已存在会报错，可忽略对应语句；也可直接跑 pnpm db:import-yards（脚本会尝试 ALTER）

USE `container_biz`;

ALTER TABLE `yards` ADD COLUMN `legacyId` INT NOT NULL DEFAULT 0 AFTER `id`;
ALTER TABLE `yards` ADD COLUMN `factoryId` VARCHAR(32) NOT NULL DEFAULT '' AFTER `legacyId`;
ALTER TABLE `yards` ADD COLUMN `factoryNumber` VARCHAR(50) NOT NULL DEFAULT '' AFTER `factoryId`;
ALTER TABLE `yards` ADD COLUMN `factoryCode` VARCHAR(100) NOT NULL DEFAULT '' AFTER `factoryNumber`;
ALTER TABLE `yards` ADD COLUMN `regionId` INT NULL AFTER `city`;
ALTER TABLE `yards` ADD COLUMN `proxyCompanyId` VARCHAR(32) NOT NULL DEFAULT '' AFTER `agent`;
ALTER TABLE `yards` ADD COLUMN `contactUser` VARCHAR(100) NOT NULL DEFAULT '' AFTER `phone`;
ALTER TABLE `yards` ADD COLUMN `creditCode` VARCHAR(60) NOT NULL DEFAULT '' AFTER `email`;
ALTER TABLE `yards` ADD COLUMN `currencyId` INT NULL AFTER `creditCode`;
ALTER TABLE `yards` ADD COLUMN `dailyExpenses` DECIMAL(12,4) NULL AFTER `currencyId`;
ALTER TABLE `yards` ADD COLUMN `freeDuration` INT NULL AFTER `dailyExpenses`;
ALTER TABLE `yards` ADD COLUMN `boardingFee` DECIMAL(12,4) NULL AFTER `freeDuration`;
ALTER TABLE `yards` ADD COLUMN `alightingFee` DECIMAL(12,4) NULL AFTER `boardingFee`;
ALTER TABLE `yards` ADD COLUMN `secondaryRemovalFee` DECIMAL(12,4) NULL AFTER `alightingFee`;
ALTER TABLE `yards` ADD COLUMN `hasSeal` TINYINT(1) NOT NULL DEFAULT 0 AFTER `secondaryRemovalFee`;
ALTER TABLE `yards` ADD COLUMN `deleted` TINYINT(1) NOT NULL DEFAULT 0 AFTER `enabled`;
ALTER TABLE `yards` ADD COLUMN `version` INT NULL AFTER `deleted`;
ALTER TABLE `yards` ADD COLUMN `remark` TEXT NULL AFTER `version`;
ALTER TABLE `yards` ADD COLUMN `receiveRemark` VARCHAR(200) NOT NULL DEFAULT '' AFTER `remark`;
ALTER TABLE `yards` ADD COLUMN `remarkReturnOrder` TEXT NULL AFTER `receiveRemark`;
ALTER TABLE `yards` ADD COLUMN `createBy` VARCHAR(60) NOT NULL DEFAULT '' AFTER `remarkReturnOrder`;
ALTER TABLE `yards` ADD COLUMN `createName` VARCHAR(50) NOT NULL DEFAULT '' AFTER `createBy`;
ALTER TABLE `yards` ADD COLUMN `createTime` VARCHAR(32) NOT NULL DEFAULT '' AFTER `createName`;
ALTER TABLE `yards` ADD COLUMN `updateBy` VARCHAR(60) NOT NULL DEFAULT '' AFTER `createTime`;
ALTER TABLE `yards` ADD COLUMN `updateName` VARCHAR(50) NOT NULL DEFAULT '' AFTER `updateBy`;
ALTER TABLE `yards` ADD COLUMN `updateTime` VARCHAR(32) NOT NULL DEFAULT '' AFTER `updateName`;

ALTER TABLE `yards` MODIFY COLUMN `address` VARCHAR(500) NOT NULL DEFAULT '';
ALTER TABLE `yards` MODIFY COLUMN `phone` VARCHAR(120) NOT NULL DEFAULT '';
ALTER TABLE `yards` MODIFY COLUMN `email` VARCHAR(200) NOT NULL DEFAULT '';
