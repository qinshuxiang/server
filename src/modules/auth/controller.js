// src/modules/auth/controller.js
const authService = require('./service');

/**
 * POST /api/auth/login
 */
async function login(req, res, next) {
    try {
        const result = await authService.login(req.body);
        res.json({
            success: true,
            data: result,
            message: 'ok'
        });
    } catch (err) {
        next(err);
    }
}

/**
 * POST /api/auth/register
 */
async function register(req, res, next) {
    try {
        const result = await authService.register(req.body);
        res.status(201).json({
            success: true,
            data: result,
            message: '注册成功'
        });
    } catch (err) {
        next(err);
    }
}

/**
 * GET /api/auth/me
 * （注意：由于当前全局 routes.js 是按模块名挂载在 /api/{moduleName}，
 *  所以前端访问路径实际为 /api/auth/me。
 *  若要完全符合文档中的 /api/me，可以之后稍微调整 src/routes.js 的挂载方式。）
 */
async function getCurrentUser(req, res, next) {
    try {
        const userId = req.user && req.user.id;
        const user = await authService.getCurrentUser(userId);
        res.json({
            success: true,
            data: user,
            message: 'ok'
        });
    } catch (err) {
        next(err);
    }
}

/**
 * PUT /api/auth/password
 */
async function changePassword(req, res, next) {
    try {
        const userId = req.user && req.user.id;
        await authService.changePassword(userId, req.body);
        res.json({
            success: true,
            data: null,
            message: '密码修改成功'
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    login,
    register,
    getCurrentUser,
    changePassword
};
