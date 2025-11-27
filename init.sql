CREATE DATABASE IF NOT EXISTS resource_platform
  DEFAULT CHARSET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE resource_platform;

-- 用户表
CREATE TABLE `users`
(
    `id`         INT NOT NULL AUTO_INCREMENT,
    `username`   VARCHAR(50)  COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '用户显示名称',
    `email`      VARCHAR(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '登录邮箱，唯一标识',
    `password`   VARCHAR(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '加密后的密码',
    `role`       VARCHAR(20)  COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'user' COMMENT '角色权限：admin/user/editor',
    `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 用户扩展信息
CREATE TABLE `user_profiles`
(
    `id`         INT NOT NULL AUTO_INCREMENT,
    `user_id`    INT NOT NULL COMMENT '关联 users.id，一对一',
    `avatar_url` VARCHAR(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '/static/images/default-avatar.png' COMMENT '头像地址，默认头像',
    `id_number`  VARCHAR(32)  COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '身份证号码',
    `phone`      VARCHAR(20)  COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '手机号码',
    `company`    VARCHAR(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '单位/公司',
    `position`   VARCHAR(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '职务/职位',
    `car_plate`  VARCHAR(20)  COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '车牌号',
    `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_user_profiles_user_id` (`user_id`),
    UNIQUE KEY `uk_user_profiles_id_number` (`id_number`),
    UNIQUE KEY `uk_user_profiles_phone` (`phone`),
    UNIQUE KEY `uk_user_profiles_car_plate` (`car_plate`),
    CONSTRAINT `fk_user_profiles_user_id`
        FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 用户设置
CREATE TABLE `user_settings`
(
    `id`                      INT NOT NULL AUTO_INCREMENT,
    `user_id`                 INT NOT NULL COMMENT '关联 users.id，一对一',
    `theme`                   ENUM('light','dark','system') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'light' COMMENT '主题：亮色/暗色/跟随系统',
    `email_notifications`     TINYINT(1) NOT NULL DEFAULT '1' COMMENT '是否开启邮件通知 0=否 1=是',
    `page_size`               INT NOT NULL DEFAULT '20' COMMENT '列表分页大小',
    `left_sidebar_collapsed`  TINYINT(1) NOT NULL DEFAULT '0' COMMENT '左侧菜单栏是否折叠，默认0=否',
    `right_sidebar_collapsed` TINYINT(1) NOT NULL DEFAULT '0' COMMENT '右侧菜单栏是否折叠，默认0=否',
    `extra`                   JSON DEFAULT NULL COMMENT '额外设置(JSON)',
    `created_at`              TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`              TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_user_settings_user_id` (`user_id`),
    CONSTRAINT `fk_user_settings_user_id`
        FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
