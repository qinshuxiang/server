const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
    // 记录错误详情
    logger.error(`${req.method} ${req.originalUrl} - ${err.message}`, {
        stack: err.stack,
        body: req.body, // 记录请求体，方便复现 Bug (注意脱敏密码等敏感字段)
    });

    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
        code: statusCode,
        message: err.message || '服务器内部错误'
    });
};

module.exports = errorHandler;
