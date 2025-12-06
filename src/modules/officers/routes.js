// src/modules/officers/routes.js
const express = require('express');
const authMiddleware = require('../../middleware/auth');
const requirePermission = require('../../middleware/permission');
const { Joi, validateBody, validateQuery, validateParams } =
    require('../../utils/validator');
const controller = require('./controller');

/**
 * 民警管理路由
 *
 * 挂载效果（结合 src/routes.js + app.js）：
 *   - GET    /api/officers
 *   - POST   /api/officers
 *   - PUT    /api/officers/:id
 *   - DELETE /api/officers/:id
 */
module.exports = function createOfficersRouter() {
    const router = express.Router();

    // 列表查询参数校验:contentReference[oaicite:5]{index=5}
    const listQuerySchema = Joi.object({
        keyword: Joi.string().trim().allow('', null),
        status: Joi.string()
            .valid('ACTIVE', 'INACTIVE', 'LOCKED')
            .optional(),
        page: Joi.number().integer().min(1).optional(),
        pageSize: Joi.number().integer().min(1).max(100).optional()
    });

    // 新增/修改请求体校验:contentReference[oaicite:6]{index=6}
    const saveBodySchema = Joi.object({
        name: Joi.string().trim().required().messages({
            'any.required': '姓名不能为空',
            'string.empty': '姓名不能为空'
        }),
        badgeNo: Joi.string().trim().allow('', null),
        phone: Joi.string().trim().allow('', null),
        status: Joi.string()
            .valid('ACTIVE', 'INACTIVE', 'LOCKED')
            .optional(),
        isActive: Joi.boolean().optional(),
        remark: Joi.string().trim().allow('', null),
        roleIds: Joi.array()
            .items(Joi.number().integer().positive())
            .optional()
    });

    const idParamSchema = Joi.object({
        id: Joi.number().integer().positive().required()
    });

    // GET /api/officers
    router.get(
        '/',
        authMiddleware,
        requirePermission('user:manage'),
        validateQuery(listQuerySchema),
        controller.listOfficers
    );

    // POST /api/officers
    router.post(
        '/',
        authMiddleware,
        requirePermission('user:manage'),
        validateBody(saveBodySchema),
        controller.createOfficer
    );

    // PUT /api/officers/:id
    router.put(
        '/:id',
        authMiddleware,
        requirePermission('user:manage'),
        validateParams(idParamSchema),
        validateBody(saveBodySchema),
        controller.updateOfficer
    );

    // DELETE /api/officers/:id
    router.delete(
        '/:id',
        authMiddleware,
        requirePermission('user:manage'),
        validateParams(idParamSchema),
        controller.deleteOfficer
    );

    return router;
};
