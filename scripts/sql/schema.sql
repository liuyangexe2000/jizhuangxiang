-- ============================================================
-- 集装箱业务管理系统 — MySQL 8 建表脚本
-- 列名采用 camelCase，与前端 TypeScript 接口一致（用反引号包裹）
-- 使用：mysql -u root -p < scripts/sql/schema.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS `container_biz`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE `container_biz`;

SET FOREIGN_KEY_CHECKS = 0;

-- ---------- M01 用箱订单 ----------
DROP TABLE IF EXISTS `use_box_orders`;
CREATE TABLE `use_box_orders` (
  `id` VARCHAR(32) NOT NULL,
  `orderNo` VARCHAR(40) NOT NULL,
  `customer` VARCHAR(120) NOT NULL,
  `customerType` VARCHAR(20) NOT NULL,
  `pickupCity` VARCHAR(60) NOT NULL,
  `returnCity` VARCHAR(60) NOT NULL,
  `pickupYard` VARCHAR(120) NULL,
  `returnYard` VARCHAR(120) NULL,
  `containerType` VARCHAR(10) NOT NULL,
  `quantity` INT NOT NULL DEFAULT 0,
  `unitPrice` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `quotedUnitPrice` DECIMAL(12,2) NULL,
  `status` VARCHAR(20) NOT NULL,
  `createdAt` VARCHAR(32) NOT NULL,
  `confirmedAt` VARCHAR(32) NULL,
  `confirmedBy` VARCHAR(120) NULL,
  `cancelDeadline` VARCHAR(32) NULL,
  `releaseDocReady` TINYINT(1) NOT NULL DEFAULT 0,
  `stuffingListUploaded` TINYINT(1) NOT NULL DEFAULT 0,
  `returnProofUploaded` TINYINT(1) NOT NULL DEFAULT 0,
  `conditionCheck` VARCHAR(10) NULL,
  `conditionNote` VARCHAR(255) NULL,
  `channel` VARCHAR(20) NOT NULL,
  `remark` VARCHAR(255) NULL,
  `adminRemark` VARCHAR(255) NULL,
  `pickupGateBy` VARCHAR(60) NULL,
  `pickupGateAt` VARCHAR(32) NULL,
  `returnGateBy` VARCHAR(60) NULL,
  `returnGateAt` VARCHAR(32) NULL,
  PRIMARY KEY (`id`),
  KEY `idx_orders_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- M01 账单 ----------
DROP TABLE IF EXISTS `bills`;
CREATE TABLE `bills` (
  `id` VARCHAR(32) NOT NULL,
  `billNo` VARCHAR(40) NOT NULL,
  `type` VARCHAR(20) NOT NULL,
  `relatedOrderNo` VARCHAR(40) NOT NULL,
  `party` VARCHAR(120) NOT NULL,
  `amount` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `status` VARCHAR(20) NOT NULL,
  `issuedAt` VARCHAR(32) NOT NULL,
  `confirmDeadline` VARCHAR(32) NOT NULL,
  `items` JSON NULL,
  `disputeReason` VARCHAR(255) NULL,
  `adjustedBy` VARCHAR(60) NULL,
  PRIMARY KEY (`id`),
  KEY `idx_bills_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- M02 调运订单 ----------
DROP TABLE IF EXISTS `dispatch_orders`;
CREATE TABLE `dispatch_orders` (
  `id` VARCHAR(32) NOT NULL,
  `dispatchNo` VARCHAR(40) NOT NULL,
  `planTime` VARCHAR(32) NOT NULL,
  `pickupPlace` VARCHAR(120) NOT NULL,
  `returnScope` VARCHAR(255) NOT NULL,
  `reason` VARCHAR(255) NOT NULL,
  `unitPrice` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `overdueStandard` VARCHAR(120) NOT NULL,
  `useTerm` INT NOT NULL DEFAULT 0,
  `quantity` INT NOT NULL DEFAULT 0,
  `carrier` VARCHAR(120) NOT NULL,
  `totalPrice` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `status` VARCHAR(20) NOT NULL,
  `createdBy` VARCHAR(120) NOT NULL,
  `createdAt` VARCHAR(32) NOT NULL,
  `approvals` JSON NULL,
  `pickedCount` INT NOT NULL DEFAULT 0,
  `returnedCount` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_dispatch_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- M02 还箱申请 ----------
DROP TABLE IF EXISTS `return_applications`;
CREATE TABLE `return_applications` (
  `id` VARCHAR(32) NOT NULL,
  `applyNo` VARCHAR(40) NOT NULL,
  `carrier` VARCHAR(120) NOT NULL,
  `containerNos` JSON NULL,
  `relatedDispatchNos` JSON NULL,
  `returnCity` VARCHAR(60) NOT NULL,
  `returnYard` VARCHAR(120) NOT NULL,
  `appliedAt` VARCHAR(32) NOT NULL,
  `status` VARCHAR(20) NOT NULL,
  `reviewer` VARCHAR(60) NULL,
  `rejectReason` VARCHAR(255) NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- M03 库存台账 ----------
DROP TABLE IF EXISTS `inventory_rows`;
CREATE TABLE `inventory_rows` (
  `id` VARCHAR(32) NOT NULL,
  `region` VARCHAR(20) NOT NULL,
  `city` VARCHAR(60) NOT NULL,
  `yard` VARCHAR(120) NOT NULL,
  `agent` VARCHAR(120) NOT NULL,
  `onSite` INT NOT NULL DEFAULT 0,
  `available` INT NOT NULL DEFAULT 0,
  `reserved` INT NOT NULL DEFAULT 0,
  `incoming` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- M03 进出场记录 ----------
DROP TABLE IF EXISTS `gate_records`;
CREATE TABLE `gate_records` (
  `id` VARCHAR(32) NOT NULL,
  `containerNo` VARCHAR(20) NOT NULL,
  `type` VARCHAR(10) NOT NULL,
  `time` VARCHAR(32) NOT NULL,
  `yard` VARCHAR(120) NOT NULL,
  `city` VARCHAR(60) NOT NULL,
  `source` VARCHAR(40) NOT NULL,
  `relatedOrderNo` VARCHAR(40) NULL,
  `mappingStatus` VARCHAR(20) NOT NULL,
  `ownership` VARCHAR(20) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- M03 集装箱主档 ----------
DROP TABLE IF EXISTS `container_masters`;
CREATE TABLE `container_masters` (
  `containerNo` VARCHAR(20) NOT NULL,
  `type` VARCHAR(10) NOT NULL,
  `ownership` VARCHAR(20) NOT NULL,
  `currentYard` VARCHAR(120) NOT NULL,
  `currentCity` VARCHAR(60) NOT NULL,
  `status` VARCHAR(20) NOT NULL,
  `lastGateTime` VARCHAR(32) NOT NULL,
  `storageDays` INT NOT NULL DEFAULT 0,
  `relatedOrderNo` VARCHAR(40) NULL,
  PRIMARY KEY (`containerNo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- M03 库存差异 ----------
DROP TABLE IF EXISTS `discrepancy_rows`;
CREATE TABLE `discrepancy_rows` (
  `id` VARCHAR(32) NOT NULL,
  `yard` VARCHAR(120) NOT NULL,
  `city` VARCHAR(60) NOT NULL,
  `systemCount` INT NOT NULL DEFAULT 0,
  `agentCount` INT NOT NULL DEFAULT 0,
  `diff` INT NOT NULL DEFAULT 0,
  `checkedAt` VARCHAR(32) NOT NULL,
  `status` VARCHAR(20) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- M04 单据模板 ----------
DROP TABLE IF EXISTS `doc_templates`;
CREATE TABLE `doc_templates` (
  `id` VARCHAR(32) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `code` VARCHAR(60) NOT NULL,
  `scene` VARCHAR(120) NOT NULL,
  `fields` JSON NULL,
  `updatedAt` VARCHAR(32) NOT NULL,
  `enabled` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- M04 堆场预约 ----------
DROP TABLE IF EXISTS `bookings`;
CREATE TABLE `bookings` (
  `id` VARCHAR(32) NOT NULL,
  `bookingNo` VARCHAR(40) NOT NULL,
  `type` VARCHAR(20) NOT NULL,
  `containerNos` JSON NULL,
  `yard` VARCHAR(120) NOT NULL,
  `city` VARCHAR(60) NOT NULL,
  `planTime` VARCHAR(32) NOT NULL,
  `driver` VARCHAR(60) NOT NULL,
  `driverId` VARCHAR(40) NOT NULL,
  `driverPhone` VARCHAR(40) NOT NULL,
  `plateNo` VARCHAR(20) NOT NULL,
  `refNo` VARCHAR(40) NOT NULL,
  `notifyByEmail` TINYINT(1) NOT NULL DEFAULT 0,
  `status` VARCHAR(20) NOT NULL,
  `withinWorkHours` TINYINT(1) NOT NULL DEFAULT 1,
  `confirmedBy` VARCHAR(60) NULL,
  `confirmedAt` VARCHAR(32) NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- M04 堆场 ----------
DROP TABLE IF EXISTS `yards`;
CREATE TABLE `yards` (
  `id` VARCHAR(32) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `region` VARCHAR(20) NOT NULL,
  `city` VARCHAR(60) NOT NULL,
  `agent` VARCHAR(120) NOT NULL,
  `address` VARCHAR(200) NOT NULL,
  `phone` VARCHAR(40) NOT NULL,
  `email` VARCHAR(120) NOT NULL,
  `capacity` INT NOT NULL DEFAULT 0,
  `current` INT NOT NULL DEFAULT 0,
  `enabled` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- 城市字典 ----------
DROP TABLE IF EXISTS `city_dict`;
CREATE TABLE `city_dict` (
  `id` VARCHAR(32) NOT NULL,
  `code` VARCHAR(20) NOT NULL,
  `name` VARCHAR(60) NOT NULL,
  `region` VARCHAR(10) NOT NULL,
  `country` VARCHAR(60) NOT NULL,
  `province` VARCHAR(60) NOT NULL DEFAULT '',
  `usableAsPickup` TINYINT(1) NOT NULL DEFAULT 1,
  `usableAsReturn` TINYINT(1) NOT NULL DEFAULT 1,
  `enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `sort` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- 系统用户（含密码哈希） ----------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` VARCHAR(32) NOT NULL,
  `account` VARCHAR(60) NOT NULL,
  `name` VARCHAR(60) NOT NULL,
  `roleId` VARCHAR(8) NOT NULL,
  `org` VARCHAR(120) NOT NULL,
  `email` VARCHAR(120) NOT NULL,
  `phone` VARCHAR(40) NOT NULL,
  `status` VARCHAR(10) NOT NULL,
  `lastLogin` VARCHAR(32) NOT NULL,
  `createdAt` VARCHAR(32) NOT NULL,
  `passwordHash` VARCHAR(255) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_account` (`account`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- 供应商 ----------
DROP TABLE IF EXISTS `suppliers`;
CREATE TABLE `suppliers` (
  `id` VARCHAR(32) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `type` VARCHAR(20) NOT NULL,
  `contact` VARCHAR(60) NOT NULL,
  `phone` VARCHAR(40) NOT NULL,
  `email` VARCHAR(120) NOT NULL,
  `country` VARCHAR(60) NOT NULL,
  `rating` VARCHAR(2) NOT NULL,
  `cooperationSince` VARCHAR(20) NOT NULL,
  `enabled` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- 供应计划 ----------
DROP TABLE IF EXISTS `supply_plans`;
CREATE TABLE `supply_plans` (
  `id` VARCHAR(32) NOT NULL,
  `planNo` VARCHAR(40) NOT NULL,
  `type` VARCHAR(10) NOT NULL,
  `containerType` VARCHAR(10) NOT NULL,
  `quantity` INT NOT NULL DEFAULT 0,
  `estUnitPrice` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `estAmount` DECIMAL(16,2) NOT NULL DEFAULT 0,
  `demandCity` VARCHAR(60) NOT NULL,
  `expectArrival` VARCHAR(32) NOT NULL,
  `reason` VARCHAR(255) NOT NULL,
  `status` VARCHAR(20) NOT NULL,
  `createdBy` VARCHAR(120) NOT NULL,
  `createdAt` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- 供应合同 ----------
DROP TABLE IF EXISTS `supply_contracts`;
CREATE TABLE `supply_contracts` (
  `id` VARCHAR(32) NOT NULL,
  `contractNo` VARCHAR(40) NOT NULL,
  `type` VARCHAR(10) NOT NULL,
  `relatedPlanNo` VARCHAR(40) NOT NULL,
  `supplier` VARCHAR(120) NOT NULL,
  `containerType` VARCHAR(10) NOT NULL,
  `quantity` INT NOT NULL DEFAULT 0,
  `unitPrice` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `amount` DECIMAL(16,2) NOT NULL DEFAULT 0,
  `currency` VARCHAR(4) NOT NULL,
  `signedAt` VARCHAR(32) NOT NULL,
  `startDate` VARCHAR(32) NOT NULL,
  `endDate` VARCHAR(32) NOT NULL,
  `deliveredQty` INT NOT NULL DEFAULT 0,
  `status` VARCHAR(20) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- 修箱工单 ----------
DROP TABLE IF EXISTS `repair_orders`;
CREATE TABLE `repair_orders` (
  `id` VARCHAR(32) NOT NULL,
  `repairNo` VARCHAR(40) NOT NULL,
  `containerNo` VARCHAR(20) NOT NULL,
  `containerType` VARCHAR(10) NOT NULL,
  `ownership` VARCHAR(20) NOT NULL,
  `yard` VARCHAR(120) NOT NULL,
  `city` VARCHAR(60) NOT NULL,
  `damageDesc` VARCHAR(255) NOT NULL,
  `level` VARCHAR(20) NOT NULL,
  `vendor` VARCHAR(120) NOT NULL,
  `estCost` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `actualCost` DECIMAL(12,2) NULL,
  `reportedBy` VARCHAR(80) NOT NULL,
  `reportedAt` VARCHAR(32) NOT NULL,
  `finishedAt` VARCHAR(32) NULL,
  `status` VARCHAR(20) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- 通知 ----------
DROP TABLE IF EXISTS `notifications`;
CREATE TABLE `notifications` (
  `id` VARCHAR(32) NOT NULL,
  `type` VARCHAR(20) NOT NULL,
  `level` VARCHAR(10) NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `desc` VARCHAR(255) NOT NULL,
  `module` VARCHAR(60) NOT NULL,
  `href` VARCHAR(120) NOT NULL,
  `roles` JSON NULL,
  `actionable` TINYINT(1) NOT NULL DEFAULT 0,
  `read` TINYINT(1) NOT NULL DEFAULT 0,
  `createdAt` VARCHAR(32) NOT NULL,
  `dueAt` VARCHAR(32) NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- 操作日志 ----------
DROP TABLE IF EXISTS `audit_logs`;
CREATE TABLE `audit_logs` (
  `id` VARCHAR(32) NOT NULL,
  `time` VARCHAR(32) NOT NULL,
  `operator` VARCHAR(80) NOT NULL,
  `operatorRole` VARCHAR(8) NOT NULL,
  `action` VARCHAR(20) NOT NULL,
  `module` VARCHAR(60) NOT NULL,
  `target` VARCHAR(120) NOT NULL,
  `detail` VARCHAR(255) NOT NULL,
  `ip` VARCHAR(45) NOT NULL,
  `proxied` TINYINT(1) NOT NULL DEFAULT 0,
  `proxyBy` VARCHAR(80) NULL,
  PRIMARY KEY (`id`),
  KEY `idx_audit_time` (`time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- 集成状态 ----------
DROP TABLE IF EXISTS `integrations`;
CREATE TABLE `integrations` (
  `id` VARCHAR(32) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `category` VARCHAR(20) NOT NULL,
  `direction` VARCHAR(10) NOT NULL,
  `status` VARCHAR(10) NOT NULL,
  `lastSync` VARCHAR(32) NOT NULL,
  `successRate` DECIMAL(5,2) NOT NULL DEFAULT 0,
  `pending` INT NOT NULL DEFAULT 0,
  `desc` VARCHAR(255) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- 出站事件队列（订舱账单推送等，可无真实 HTTP） ----------
DROP TABLE IF EXISTS `outbound_events`;
CREATE TABLE `outbound_events` (
  `id` VARCHAR(32) NOT NULL,
  `type` VARCHAR(40) NOT NULL,
  `relatedNo` VARCHAR(80) NOT NULL,
  `payload` JSON NULL,
  `status` VARCHAR(20) NOT NULL,
  `createdAt` VARCHAR(32) NOT NULL,
  `deliveredAt` VARCHAR(32) NULL,
  PRIMARY KEY (`id`),
  KEY `idx_outbound_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- 附件元数据（无对象存储，仅登记） ----------
DROP TABLE IF EXISTS `attachments`;
CREATE TABLE `attachments` (
  `id` VARCHAR(32) NOT NULL,
  `refType` VARCHAR(40) NOT NULL,
  `refNo` VARCHAR(80) NOT NULL,
  `fileName` VARCHAR(200) NOT NULL,
  `mime` VARCHAR(80) NOT NULL,
  `size` INT NOT NULL DEFAULT 0,
  `uploadedBy` VARCHAR(80) NOT NULL,
  `uploadedAt` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_attach_ref` (`refType`, `refNo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- 系统设置（KV，value 为 JSON） ----------
DROP TABLE IF EXISTS `system_settings`;
CREATE TABLE `system_settings` (
  `key` VARCHAR(80) NOT NULL,
  `value` JSON NOT NULL,
  `updatedAt` VARCHAR(32) NOT NULL,
  `updatedBy` VARCHAR(80) NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;
