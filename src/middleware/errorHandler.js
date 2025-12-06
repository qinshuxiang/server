// src/middleware/errorHandler.js
const {
    AppError,
    ERROR_CODES,
    isAppError,
    validationError,
    internalError
} = require('../utils/errors');
const logger = require('../utils/logger');

const isProduction = process.env.NODE_ENV === 'production';

module.exports = function errorHandler(err, req, res, next) {
    let appError = err;

    // 直接处理 Joi 错误（防止有地方没用封装好的 validator）
    if (!isAppError(appError) && err && err.isJoi) {
        appError = validationError('参数校验失败', {
            fieldErrors: err.details?.reduce((acc, d) => {
                const path = d.path && d.path.length ? d.path.join('.') : 'value';
                acc[path] = d.message.replace(/["]/g, '');
                return acc;
            }, {})
        });
    }

    // JWT 错误统一转换
    if (!isAppError(appError)) {
        if (
            err &&
            (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError')
        ) {
            const { unauthorized } = require('../utils/errors');
            appError = unauthorized('登录状态无效或已过期');
        }
    }

    if (!isAppError(appError)) {
        logger.error('Unhandled error', { err });
        appError = internalError('服务器内部错误');
    }

    const status = appError.status || 500;
    const payload = {
        success: false,
        errorCode: appError.errorCode || ERROR_CODES.INTERNAL_ERROR,
        message: appError.message || '服务器内部错误'
    };

    if (appError.details) {
        payload.details = appError.details;
    }

    if (!isProduction) {
        payload.stack = appError.stack;
    }

    res.status(status).json(payload);
};
