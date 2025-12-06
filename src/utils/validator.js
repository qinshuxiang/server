// src/utils/validator.js
const Joi = require('joi');
const { validationError } = require('./errors');

function buildFieldErrors(joiError) {
    const fieldErrors = {};
    if (!joiError || !Array.isArray(joiError.details)) return fieldErrors;

    joiError.details.forEach((detail) => {
        const path = detail.path && detail.path.length
            ? detail.path.join('.')
            : detail.context && detail.context.key
                ? detail.context.key
                : 'value';
        if (!fieldErrors[path]) {
            fieldErrors[path] = detail.message.replace(/["]/g, '');
        }
    });

    return fieldErrors;
}

/**
 * 直接校验任意数据，返回清洗后的值，失败抛 AppError(VALIDATION_ERROR)
 */
function validate(schema, payload, options = {}) {
    const { error, value } = schema.validate(payload, {
        abortEarly: false,
        stripUnknown: true,
        ...options
    });

    if (error) {
        const details = {
            fieldErrors: buildFieldErrors(error)
        };
        throw validationError('参数校验失败', details);
    }

    return value;
}

/**
 * 生成校验 req.body 的中间件
 */
function validateBody(schema, options = {}) {
    return (req, res, next) => {
        try {
            req.body = validate(schema, req.body, options);
            next();
        } catch (err) {
            next(err);
        }
    };
}

/**
 * 生成校验 req.query 的中间件
 */
function validateQuery(schema, options = {}) {
    return (req, res, next) => {
        try {
            req.query = validate(schema, req.query, options);
            next();
        } catch (err) {
            next(err);
        }
    };
}

/**
 * 生成校验 req.params 的中间件
 */
function validateParams(schema, options = {}) {
    return (req, res, next) => {
        try {
            req.params = validate(schema, req.params, options);
            next();
        } catch (err) {
            next(err);
        }
    };
}

module.exports = {
    Joi,
    validate,
    validateBody,
    validateQuery,
    validateParams
};
