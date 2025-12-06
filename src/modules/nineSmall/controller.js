'use strict';

const nineSmallService = require('./service');
const { Joi, validate } = require('../../utils/validator');
const { validationError, notFound } = require('../../utils/errors');

function sendSuccess(res, data, message = 'ok') {
    res.json({
        success: true,
        data,
        message,
    });
}

// 通用 ID 校验
const idParamSchema = Joi.object({
    id: Joi.number().integer().positive().required(),
});

const inspectionIdParamSchema = Joi.object({
    inspectionId: Joi.number().integer().positive().required(),
});

// 场所列表查询参数
const listPlacesQuerySchema = Joi.object({
    communityId: Joi.number().integer().positive(),
    placeName: Joi.string().trim().max(100),
    typeItemId: Joi.number().integer().positive(),
    page: Joi.number().integer().min(1).default(1),
    pageSize: Joi.number().integer().min(1).max(100).default(20),
});

// 场所请求体基础字段
const placeBodyBase = {
    name: Joi.string().trim().max(100),
    address: Joi.string().trim().max(255),
    communityId: Joi.number().integer().positive().allow(null),
    type: Joi.string().trim().max(50).allow('', null),
    typeItemId: Joi.number().integer().positive().allow(null),
    gridName: Joi.string().trim().max(100).allow('', null),
    principalName: Joi.string().trim().max(100).allow('', null),
    contactPhone: Joi.string().trim().max(50).allow('', null),
    remark: Joi.string().trim().max(255).allow('', null),
};

const createPlaceSchema = Joi.object({
    ...placeBodyBase,
    name: placeBodyBase.name.required(),
    address: placeBodyBase.address.required(),
});

const updatePlaceSchema = Joi.object(placeBodyBase).min(1);

// 巡查列表查询参数
const listInspectionsQuerySchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    pageSize: Joi.number().integer().min(1).max(100).default(20),
});

// 巡查记录基础字段（不含 placeId）
const inspectionBodyBase = {
    inspectDate: Joi.string()
        .pattern(/^\d{4}-\d{2}-\d{2}$/)
        .message('inspectDate 必须为 YYYY-MM-DD 格式'),
    inspectorOfficerId: Joi.number().integer().positive().allow(null),
    inspectorName: Joi.string().trim().max(50).allow('', null),
    description: Joi.string().trim().max(1000).allow('', null),
    hasHiddenDanger: Joi.boolean(),
    rectificationAdvice: Joi.string().trim().max(255).allow('', null),
    rectificationStatusId: Joi.number().integer().positive().allow(null),
    rectifiedDate: Joi.string()
        .pattern(/^\d{4}-\d{2}-\d{2}$/)
        .message('rectifiedDate 必须为 YYYY-MM-DD 格式')
        .allow(null),
};

const createInspectionSchema = Joi.object({
    ...inspectionBodyBase,
    inspectDate: inspectionBodyBase.inspectDate.required(),
    hasHiddenDanger: inspectionBodyBase.hasHiddenDanger.default(false),
});

// 更新巡查记录，可以修改 placeId
const updateInspectionSchema = Joi.object({
    placeId: Joi.number().integer().positive(),
    ...inspectionBodyBase,
}).min(1);

/**
 * 九小场所列表
 */
async function listPlaces(req, res, next) {
    try {
        const query = validate(listPlacesQuerySchema, req.query);
        const data = await nineSmallService.listPlaces(query);
        sendSuccess(res, data);
    } catch (err) {
        next(err);
    }
}

/**
 * 九小场所详情
 */
async function getPlaceDetail(req, res, next) {
    try {
        const { id } = validate(idParamSchema, req.params);
        const place = await nineSmallService.getPlaceById(id);
        if (!place) {
            throw notFound('九小场所不存在');
        }
        sendSuccess(res, place);
    } catch (err) {
        next(err);
    }
}

/**
 * 创建九小场所
 */
async function createPlace(req, res, next) {
    try {
        const payload = validate(createPlaceSchema, req.body);
        const place = await nineSmallService.createPlace(payload);
        sendSuccess(res, place, '创建成功');
    } catch (err) {
        next(err);
    }
}

/**
 * 更新九小场所
 */
async function updatePlace(req, res, next) {
    try {
        const { id } = validate(idParamSchema, req.params);
        const payload = validate(updatePlaceSchema, req.body);
        const place = await nineSmallService.updatePlace(id, payload);
        sendSuccess(res, place, '更新成功');
    } catch (err) {
        next(err);
    }
}

/**
 * 某场所的巡查记录列表
 */
async function listInspections(req, res, next) {
    try {
        const { id: placeId } = validate(idParamSchema, req.params);
        const query = validate(listInspectionsQuerySchema, req.query);
        const data = await nineSmallService.listInspections(placeId, query);
        sendSuccess(res, data);
    } catch (err) {
        next(err);
    }
}

/**
 * 创建巡查记录
 */
async function createInspection(req, res, next) {
    try {
        const { id: placeId } = validate(idParamSchema, req.params);
        const payload = validate(createInspectionSchema, req.body);

        // 业务规则：至少一个巡查人信息
        if (
            !payload.inspectorOfficerId &&
            (!payload.inspectorName ||
                String(payload.inspectorName).trim() === '')
        ) {
            throw validationError('巡查民警或巡查人员姓名至少填写一项');
        }

        // 业务规则：整改时间 >= 巡查时间（如有填）
        if (payload.rectifiedDate) {
            if (payload.rectifiedDate < payload.inspectDate) {
                throw validationError('整改完成时间不能早于巡查时间');
            }
        }

        const inspection = await nineSmallService.createInspection(
            placeId,
            payload
        );
        sendSuccess(res, inspection, '创建成功');
    } catch (err) {
        next(err);
    }
}

/**
 * 更新巡查记录
 */
async function updateInspection(req, res, next) {
    try {
        const { inspectionId } = validate(inspectionIdParamSchema, req.params);
        const payload = validate(updateInspectionSchema, req.body);

        const inspection = await nineSmallService.updateInspection(
            inspectionId,
            payload
        );
        sendSuccess(res, inspection, '更新成功');
    } catch (err) {
        next(err);
    }
}

module.exports = {
    listPlaces,
    getPlaceDetail,
    createPlace,
    updatePlace,
    listInspections,
    createInspection,
    updateInspection,
};
