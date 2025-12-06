
const { Joi, validate } = require('../../utils/validator');
const {
    validationError,
    notFound,
} = require('../../utils/errors');
const service = require('./service');

// 通用 ID 校验
const idParamSchema = Joi.object({
    id: Joi.number().integer().positive().required(),
});

// 列表查询参数
const listQuerySchema = Joi.object({
    communityId: Joi.number().integer().positive(),
    roleTypeItemId: Joi.number().integer().positive(),
    positionItemId: Joi.number().integer().positive(),
    keyword: Joi.string().trim().max(100),
    page: Joi.number().integer().min(1).default(1),
    pageSize: Joi.number().integer().min(1).max(100).default(20),
});

// POST/PUT 请求体（跟设计文档一致） :contentReference[oaicite:2]{index=2}
const baseBodySchema = {
    communityId: Joi.number().integer().positive().required(),
    name: Joi.string().trim().max(50).required(),
    genderItemId: Joi.number().integer().positive().allow(null),
    roleTypeItemId: Joi.number().integer().positive().required(),
    positionItemId: Joi.number().integer().positive().required(),
    gridName: Joi.string().trim().max(100).allow('', null),
    contactPhone: Joi.string().trim().max(50).allow('', null),
    isFullTime: Joi.boolean().default(false),
    remark: Joi.string().trim().max(255).allow('', null),
};

const createSchema = Joi.object(baseBodySchema);
const updateSchema = Joi.object(baseBodySchema);

/**
 * GET /api/community-person-roles
 */
async function listCommunityPersonRoles(req, res, next) {
    try {
        const query = validate(listQuerySchema, req.query);
        const data = await service.listCommunityPersonRoles(query);
        res.json({
            success: true,
            data,
            message: 'ok',
        });
    } catch (err) {
        next(err);
    }
}

/**
 * POST /api/community-person-roles
 */
async function createCommunityPersonRole(req, res, next) {
    try {
        const payload = validate(createSchema, req.body);
        const created = await service.createCommunityPersonRole(payload);

        res.status(201).json({
            success: true,
            data: created,
            message: '创建成功',
        });
    } catch (err) {
        next(err);
    }
}

/**
 * PUT /api/community-person-roles/:id
 */
async function updateCommunityPersonRole(req, res, next) {
    try {
        const { id } = validate(idParamSchema, req.params);

        const existing = await service.getCommunityPersonRoleById(id);
        if (!existing) {
            throw notFound('社区人员角色不存在');
        }

        const payload = validate(updateSchema, req.body);
        const updated = await service.updateCommunityPersonRole(id, payload);

        res.json({
            success: true,
            data: updated,
            message: '更新成功',
        });
    } catch (err) {
        next(err);
    }
}

/**
 * DELETE /api/community-person-roles/:id
 */
async function deleteCommunityPersonRole(req, res, next) {
    try {
        const { id } = validate(idParamSchema, req.params);

        const existing = await service.getCommunityPersonRoleById(id);
        if (!existing) {
            throw notFound('社区人员角色不存在');
        }

        await service.deleteCommunityPersonRole(id);

        res.json({
            success: true,
            data: null,
            message: '删除成功',
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    listCommunityPersonRoles,
    createCommunityPersonRole,
    updateCommunityPersonRole,
    deleteCommunityPersonRole,
};
