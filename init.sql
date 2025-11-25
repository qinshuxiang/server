CREATE DATABASE IF NOT EXISTS resource_platform DEFAULT CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE resource_platform;

CREATE TABLE `users` (
                         `id` int NOT NULL AUTO_INCREMENT,
                         `username` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '用户显示名称',
                         `email` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '登录邮箱，唯一标识',
                         `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '加密后的密码',
                         `role` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'user' COMMENT '角色权限：admin/user/editor',
                         `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
                         PRIMARY KEY (`id`),
                         UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
