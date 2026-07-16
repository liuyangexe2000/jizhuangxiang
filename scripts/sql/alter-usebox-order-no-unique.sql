-- 用箱订单号唯一约束（已存在可忽略报错）
-- mysql ... < scripts/sql/alter-usebox-order-no-unique.sql

USE `container_biz`;

ALTER TABLE `use_box_orders` ADD UNIQUE KEY `uk_orders_orderNo` (`orderNo`);
