// src/middleware/permission.js
const { unauthorized, forbidden } = require('../utils/errors');

/**
 * 检查权限编码，默认只要满足“包含任意一个”即可通过
 * 使用方式：
 *   const permission = require('../../middleware/permission');
 *   router.get('/cases', auth, permission(['case:view_my']), controller.list);
 */
function permission(requiredPermissions = []) {
    if (!Array.isArray(requiredPermissions)) {
        requiredPermissions = [requiredPermissions];
    }

    return (req, res, next) => {
        if (!req.user) {
            return next(unauthorized('未登录或登录已过期'));
        }

        const userPermissions = Array.isArray(req.user.permissions)
            ? req.user.permissions
            : [];

        if (
            requiredPermissions.length > 0 &&
            !requiredPermissions.some((p) => userPermissions.includes(p))
        ) {
            return next(forbidden('权限不足'));
        }

        return next();
    };
}

/**
 * 可选：按角色编码检查
 *   router.post('/officers', auth, permission.requireRoles(['ADMIN']), controller.create);
 */
function requireRoles(requiredRoles = []) {
    if (!Array.isArray(requiredRoles)) {
        requiredRoles = [requiredRoles];
    }

    return (req, res, next) => {
        if (!req.user) {
            return next(unauthorized('未登录或登录已过期'));
        }

        const userRoles = Array.isArray(req.user.roles) ? req.user.roles : [];

        if (
            requiredRoles.length > 0 &&
            !requiredRoles.some((r) => userRoles.includes(r))
        ) {
            return next(forbidden('权限不足'));
        }

        return next();
    };
}

permission.requireRoles = requireRoles;

module.exports = permission;
module.exports.default = permission;
