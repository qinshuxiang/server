// src/modules/dicts/routes.js
const express = require('express');
const authMiddleware = require('../../middleware/auth');
const requirePermission = require('../../middleware/permission');
const {
    Joi,
    validateBody,
    validateQuery,
    validateParams
} = require('../../utils/validator');
const controller = require('./controller');

/**
 * 字典模块路由
 *
 * 最终挂载路径（结合 src/routes.js + app.js）：
 *   - GET    /api/dicts/:code
 *   - GET    /api/dicts?codes=CASE_TYPE,KEYPOP_TYPE
 *   - GET    /api/dicts/categories
 *   - POST   /api/dicts/categories
 *   - PUT    /api/dicts/categories/:id
 *   - DELETE /api/dicts/categories/:id
 *   - GET    /api/dicts/items?categoryId=1
 *   - POST   /api/dicts/items
 *   - PUT    /api/dicts/items/:id
 *   - DELETE /api/dicts/items/:id
 *
 * 权限：
 *   - 2.1 / 2.2：登录即可
 *   - 2.3：需要 dict:manage :contentReference[oaicite:8]{index=8}
 */
module.exports = function createDictsRouter() {
    const router = express.Router();

    // 通用：includeDisabled=0/1
    const includeDisabledQueryPart = {
        includeDisabled: Joi.number().integer().valid(0, 1).optional()
    };

    // GET /api/dicts/:code
    const getByCodeParamsSchema = Joi.object({
        code: Joi.string().trim().required()
    });
    const getByCodeQuerySchema = Joi.object({
        ...includeDisabledQueryPart
    });

    router.get(
        '/:code',
        authMiddleware,
        validateParams(getByCodeParamsSchema),
        validateQuery(getByCodeQuerySchema),
        controller.getDictByCode
    );

    // GET /api/dicts?codes=CASE_TYPE,KEYPOP_TYPE
    const getBatchQuerySchema = Joi.object({
        codes: Joi.string().trim().required().messages({
            'any.required': 'codes 不能为空',
            'string.empty': 'codes 不能为空'
        }),
        ...includeDisabledQueryPart
    });

    router.get(
        '/',
        authMiddleware,
        validateQuery(getBatchQuerySchema),
        controller.getDictsByCodes
    );

    // ========= 分类管理（dict:manage） =========

    const categoryListQuerySchema = Joi.object({
        keyword: Joi.string().trim().allow('', null)
    });

    const categoryIdParamSchema = Joi.object({
        id: Joi.number().integer().positive().required()
    });

    const categoryCreateBodySchema = Joi.object({
        code: Joi.string().trim().required().messages({
            'any.required': '分类编码不能为空',
            'string.empty': '分类编码不能为空'
        }),
        name: Joi.string().trim().required().messages({
            'any.required': '分类名称不能为空',
            'string.empty': '分类名称不能为空'
        }),
        remark: Joi.string().trim().allow('', null)
    });

    const categoryUpdateBodySchema = Joi.object({
        code: Joi.string().trim().optional(),
        name: Joi.string().trim().optional(),
        remark: Joi.string().trim().allow('', null).optional()
    }).or('code', 'name', 'remark'); // 至少修改一个字段

    // GET /api/dicts/categories
    router.get(
        '/categories',
        authMiddleware,
        requirePermission('dict:manage'),
        validateQuery(categoryListQuerySchema),
        controller.listCategories
    );

    // POST /api/dicts/categories
    router.post(
        '/categories',
        authMiddleware,
        requirePermission('dict:manage'),
        validateBody(categoryCreateBodySchema),
        controller.createCategory
    );

    // PUT /api/dicts/categories/:id
    router.put(
        '/categories/:id',
        authMiddleware,
        requirePermission('dict:manage'),
        validateParams(categoryIdParamSchema),
        validateBody(categoryUpdateBodySchema),
        controller.updateCategory
    );

    // DELETE /api/dicts/categories/:id
    router.delete(
        '/categories/:id',
        authMiddleware,
        requirePermission('dict:manage'),
        validateParams(categoryIdParamSchema),
        controller.deleteCategory
    );

    // ========= 字典项管理（dict:manage） =========

    const itemIdParamSchema = Joi.object({
        id: Joi.number().integer().positive().required()
    });

    const itemsListQuerySchema = Joi.object({
        categoryId: Joi.number().integer().positive().required(),
        ...includeDisabledQueryPart
    });

    const itemCreateBodySchema = Joi.object({
        categoryId: Joi.number().integer().positive().required()
            .messages({
                'any.required': 'categoryId 不能为空'
            }),
        itemCode: Joi.string().trim().required().messages({
            'any.required': 'itemCode 不能为空',
            'string.empty': 'itemCode 不能为空'
        }),
        itemName: Joi.string().trim().required().messages({
            'any.required': 'itemName 不能为空',
            'string.empty': 'itemName 不能为空'
        }),
        sort: Joi.number().integer().optional(),
        remark: Joi.string().trim().allow('', null),
        enabled: Joi.boolean().optional()
    });

    const itemUpdateBodySchema = Joi.object({
        categoryId: Joi.number().integer().positive().optional(),
        itemCode: Joi.string().trim().optional(),
        itemName: Joi.string().trim().optional(),
        sort: Joi.number().integer().optional(),
        remark: Joi.string().trim().allow('', null).optional(),
        enabled: Joi.boolean().optional()
    }).or(
        'categoryId',
        'itemCode',
        'itemName',
        'sort',
        'remark',
        'enabled'
    ); // 至少修改一项

    // GET /api/dicts/items?categoryId=1
    router.get(
        '/items',
        authMiddleware,
        requirePermission('dict:manage'),
        validateQuery(itemsListQuerySchema),
        controller.listItems
    );

    // POST /api/dicts/items
    router.post(
        '/items',
        authMiddleware,
        requirePermission('dict:manage'),
        validateBody(itemCreateBodySchema),
        controller.createItem
    );

    // PUT /api/dicts/items/:id
    router.put(
        '/items/:id',
        authMiddleware,
        requirePermission('dict:manage'),
        validateParams(itemIdParamSchema),
        validateBody(itemUpdateBodySchema),
        controller.updateItem
    );

    // DELETE /api/dicts/items/:id
    router.delete(
        '/items/:id',
        authMiddleware,
        requirePermission('dict:manage'),
        validateParams(itemIdParamSchema),
        controller.deleteItem
    );

    return router;
};
