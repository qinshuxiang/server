// src/modules/households/controller.js
const { Joi, validate } = require('../../utils/validator');
const householdsService = require('./service');

function sendSuccess(res, data, message = 'ok') {
    res.json({
        success: true,
        data,
        message,
    });
}

const listQuerySchema = Joi.object({
    communityId: Joi.number().integer().positive(),
    policeOfficerId: Joi.number().integer().positive(),
    isRental: Joi.alternatives().try(
        Joi.boolean(),
        Joi.number().valid(0, 1)
    ),
    houseTypeItemId: Joi.number().integer().positive(),
    keyword: Joi.string().trim().allow('', null),
    page: Joi.number().integer().min(1).default(1),
    pageSize: Joi.number().integer().min(1).max(100).default(20),
});

const idParamSchema = Joi.object({
    id: Joi.number().integer().positive().required(),
});

const householdBodyBase = {
    communityId: Joi.number().integer().positive(),
    policeOfficerId: Joi.number().integer().positive().allow(null).empty(''),
    address: Joi.string().max(255),
    buildingNo: Joi.string().max(50).allow('', null),
    unitNo: Joi.string().max(50).allow('', null),
    roomNo: Joi.string().max(50).allow('', null),
    houseTypeItemId: Joi.number().integer().positive().allow(null).empty(''),
    isRental: Joi.boolean(),
    householderName: Joi.string().max(100).allow('', null),
    householderPhone: Joi.string().max(50).allow('', null),
    remark: Joi.string().max(255).allow('', null),
};

const createHouseholdSchema = Joi.object({
    ...householdBodyBase,
    communityId: householdBodyBase.communityId.required(),
    address: householdBodyBase.address.required(),
    isRental: householdBodyBase.isRental.default(false),
});

const updateHouseholdSchema = Joi.object({
    ...householdBodyBase,
}).min(1);

/**
 * GET /api/households
 */
async function listHouseholds(req, res, next) {
    try {
        const query = validate(listQuerySchema, req.query);
        const result = await householdsService.listHouseholds(query);
        sendSuccess(res, result);
    } catch (err) {
        next(err);
    }
}

/**
 * POST /api/households
 */
async function createHousehold(req, res, next) {
    try {
        const payload = validate(createHouseholdSchema, req.body);
        const data = await householdsService.createHousehold(payload);
        sendSuccess(res, data, '创建成功');
    } catch (err) {
        next(err);
    }
}

/**
 * PUT /api/households/:id
 * 支持部分字段更新
 */
async function updateHousehold(req, res, next) {
    try {
        const { id } = validate(idParamSchema, req.params);
        const payload = validate(updateHouseholdSchema, req.body);
        const data = await householdsService.updateHousehold(id, payload);
        sendSuccess(res, data, '更新成功');
    } catch (err) {
        next(err);
    }
}

module.exports = {
    listHouseholds,
    createHousehold,
    updateHousehold,
};
