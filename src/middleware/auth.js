// src/middleware/auth.js
const { verifyToken } = require('../config/jwt');
const { unauthorized } = require('../utils/errors');

function extractToken(req) {
    const header =
        req.headers.authorization || req.headers.Authorization || '';

    if (!header) return null;

    const parts = header.split(' ');
    if (parts.length !== 2) return null;

    const [scheme, token] = parts;
    if (!/^Bearer$/i.test(scheme)) return null;

    return token;
}

/**
 * 默认强制要求登录，可传 false 生成“可选登录”中间件
 */
function auth(required = true) {
    return (req, res, next) => {
        const token = extractToken(req);

        if (!token) {
            if (!required) {
                req.user = null;
                return next();
            }
            return next(unauthorized('未登录或登录已过期'));
        }

        try {
            const payload = verifyToken(token);
            // payload 建议包含：id, badgeNo, name, roles, permissions
            req.user = payload;
            return next();
        } catch (err) {
            return next(unauthorized('登录状态无效或已过期'));
        }
    };
}

// 语义化导出：强制登录和可选登录两种
const requiredAuth = auth(true);
const optionalAuth = auth(false);

module.exports = requiredAuth;
module.exports.optional = optionalAuth;
module.exports.default = requiredAuth;
