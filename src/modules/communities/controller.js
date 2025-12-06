// src/modules/communities/controller.js
const communitiesService = require('./service');
const { Joi, validate } = require('../../utils/validator');

// POST / PUT 请求体校验
const communityBodySchema = Joi.object({
    communityName: Joi.string().trim().max(100).required()
});

// 路径参数 id 校验
const idParamSchema = Joi.object({
    id: Joi.number().integer().positive().required()
});

/**
 * GET /api/communities
 * 权限：community:manage
 */
async function listCommunities(req, res, next) {
    try {
        const items = await communitiesService.listCommunities();
        res.json({
            success: true,
            data: items,
            message: 'ok'
        });
    } catch (err) {
        next(err);
    }
}

/**
 * POST /api/communities
 * body: { communityName }
 */
async function createCommunity(req, res, next) {
    try {
        const body = validate(communityBodySchema, req.body);
        const community = await communitiesService.createCommunity(body);
        res.json({
            success: true,
            data: community,
            message: 'ok'
        });
    } catch (err) {
        next(err);
    }
}

/**
 * PUT /api/communities/:id
 * body: { communityName }
 */
async function updateCommunity(req, res, next) {
    try {
        const params = validate(idParamSchema, req.params);
        const body = validate(communityBodySchema, req.body);
        const community = await communitiesService.updateCommunity(params.id, body);
        res.json({
            success: true,
            data: community,
            message: 'ok'
        });
    } catch (err) {
        next(err);
    }
}

/**
 * DELETE /api/communities/:id
 */
async function deleteCommunity(req, res, next) {
    try {
        const params = validate(idParamSchema, req.params);
        await communitiesService.deleteCommunity(params.id);
        res.json({
            success: true,
            data: null,
            message: 'ok'
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    listCommunities,
    createCommunity,
    updateCommunity,
    deleteCommunity
};
