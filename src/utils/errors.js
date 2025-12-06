// src/utils/errors.js

const ERROR_CODES = {
    UNAUTHORIZED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    NOT_FOUND: 'NOT_FOUND',
    CONFLICT: 'CONFLICT',
    DB_ERROR: 'DB_ERROR',
    INTERNAL_ERROR: 'INTERNAL_ERROR'
};

const DEFAULT_STATUS_BY_CODE = {
    [ERROR_CODES.UNAUTHORIZED]: 401,
    [ERROR_CODES.FORBIDDEN]: 403,
    [ERROR_CODES.VALIDATION_ERROR]: 400,
    [ERROR_CODES.NOT_FOUND]: 404,
    [ERROR_CODES.CONFLICT]: 409,
    [ERROR_CODES.DB_ERROR]: 500,
    [ERROR_CODES.INTERNAL_ERROR]: 500
};

class AppError extends Error {
    constructor(errorCode, message, options = {}) {
        super(message);
        this.name = 'AppError';
        this.errorCode = errorCode || ERROR_CODES.INTERNAL_ERROR;
        this.status =
            options.status || DEFAULT_STATUS_BY_CODE[this.errorCode] || 500;
        this.details = options.details || null;
        this.isOperational =
            options.isOperational !== undefined ? options.isOperational : true;
    }
}

function unauthorized(message = '未登录或登录已过期', details) {
    return new AppError(ERROR_CODES.UNAUTHORIZED, message, {
        status: DEFAULT_STATUS_BY_CODE[ERROR_CODES.UNAUTHORIZED],
        details
    });
}

function forbidden(message = '权限不足', details) {
    return new AppError(ERROR_CODES.FORBIDDEN, message, {
        status: DEFAULT_STATUS_BY_CODE[ERROR_CODES.FORBIDDEN],
        details
    });
}

function validationError(message = '参数校验失败', details) {
    return new AppError(ERROR_CODES.VALIDATION_ERROR, message, {
        status: DEFAULT_STATUS_BY_CODE[ERROR_CODES.VALIDATION_ERROR],
        details
    });
}

function notFound(message = '资源不存在', details) {
    return new AppError(ERROR_CODES.NOT_FOUND, message, {
        status: DEFAULT_STATUS_BY_CODE[ERROR_CODES.NOT_FOUND],
        details
    });
}

function conflict(message = '资源冲突', details) {
    return new AppError(ERROR_CODES.CONFLICT, message, {
        status: DEFAULT_STATUS_BY_CODE[ERROR_CODES.CONFLICT],
        details
    });
}

function dbError(message = '数据库操作异常', details) {
    return new AppError(ERROR_CODES.DB_ERROR, message, {
        status: DEFAULT_STATUS_BY_CODE[ERROR_CODES.DB_ERROR],
        details
    });
}

function internalError(message = '服务器内部错误', details) {
    return new AppError(ERROR_CODES.INTERNAL_ERROR, message, {
        status: DEFAULT_STATUS_BY_CODE[ERROR_CODES.INTERNAL_ERROR],
        details,
        isOperational: false
    });
}

/**
 * 尝试从 MySQL 错误生成 AppError（可在 service 中按需调用）
 */
function fromMysqlError(err, defaultMessage) {
    if (!err || !err.code) {
        return internalError(defaultMessage || '未知数据库错误', { original: err });
    }

    if (err.code === 'ER_DUP_ENTRY') {
        return conflict(defaultMessage || '唯一约束冲突', { original: err.message });
    }

    return dbError(defaultMessage || '数据库操作异常', { original: err.message });
}

function isAppError(err) {
    return err instanceof AppError;
}

module.exports = {
    AppError,
    ERROR_CODES,
    isAppError,
    unauthorized,
    forbidden,
    validationError,
    notFound,
    conflict,
    dbError,
    internalError,
    fromMysqlError
};
