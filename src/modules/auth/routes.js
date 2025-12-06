// src/modules/auth/routes.js
const express = require('express');
const authMiddleware = require('../../middleware/auth');
const { Joi, validateBody } = require('../../utils/validator');
const controller = require('./controller');

/**
 * 生成 auth 模块路由
 *
 * 挂载效果（结合 src/routes.js + src/app.js）：
 *   - POST   /api/auth/login
 *   - POST   /api/auth/register
 *   - GET    /api/auth/me
 *   - PUT    /api/auth/password
 */
module.exports = function createAuthRouter() {
    const router = express.Router();

    // 登录校验
    const loginSchema = Joi.object({
        badgeNo: Joi.string().trim().required().messages({
            'string.base': '警号必须为字符串',
            'any.required': '警号不能为空',
            'string.empty': '警号不能为空'
        }),
        password: Joi.string().min(1).required().messages({
            'string.base': '密码必须为字符串',
            'any.required': '密码不能为空',
            'string.empty': '密码不能为空'
        })
    });

    // 注册校验
    const registerSchema = Joi.object({
        badgeNo: Joi.string().trim().required().messages({
            'string.base': '警号必须为字符串',
            'any.required': '警号不能为空',
            'string.empty': '警号不能为空'
        }),
        name: Joi.string().trim().required().messages({
            'string.base': '姓名必须为字符串',
            'any.required': '姓名不能为空',
            'string.empty': '姓名不能为空'
        }),
        password: Joi.string().min(6).required().messages({
            'string.base': '密码必须为字符串',
            'any.required': '密码不能为空',
            'string.empty': '密码不能为空',
            'string.min': '密码长度至少 6 位'
        }),
        phone: Joi.string().trim().allow('', null)
    });

    // 修改密码校验
    const changePasswordSchema = Joi.object({
        oldPassword: Joi.string().min(1).required().messages({
            'any.required': '旧密码不能为空',
            'string.empty': '旧密码不能为空'
        }),
        newPassword: Joi.string().min(6).required().messages({
            'any.required': '新密码不能为空',
            'string.min': '新密码长度至少 6 位',
            'string.empty': '新密码不能为空'
        })
    });

    // 登录（公开）
    router.post('/login', validateBody(loginSchema), controller.login);

    // 注册（公开）
    router.post('/register', validateBody(registerSchema), controller.register);

    // 当前用户信息（需要登录）
    router.get('/me', authMiddleware, controller.getCurrentUser);

    // 修改密码（需要登录）
    router.put(
        '/password',
        authMiddleware,
        validateBody(changePasswordSchema),
        controller.changePassword
    );

    return router;
};
