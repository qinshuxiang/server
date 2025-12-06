// src/modules/cases/controller.js
const { Joi, validate } = require('../../utils/validator');
const casesService = require('./service');

function sendSuccess(res, data, message = 'ok') {
    res.json({
        success: true,
        data,
        message,
    });
}

const DATE = Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .message('日期格式应为 YYYY-MM-DD')
    .empty('')
    .allow(null);

const DATETIME = Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    .message('时间格式应为 YYYY-MM-DD HH:mm:ss')
    .empty('')
    .allow(null);

const officerSchema = Joi.object({
    officerId: Joi.number().integer().positive().required(),
    role: Joi.string().max(50).allow('', null),
    remark: Joi.string().max(255).allow('', null),
});

const personSchema = Joi.object({
    name: Joi.string().max(100).required(),
    idNo: Joi.string().max(30).allow('', null),
    contact: Joi.string().max(50).allow('', null),
    roleItemId: Joi.number().integer().positive().required(),
    remark: Joi.string().max(255).allow('', null),
});

// 创建案件请求体验证
const createCaseSchema = Joi.object({
    caseNo: Joi.string().max(50).required(),
    caseName: Joi.string().max(255).required(),
    caseTypeItemId: Joi.number().integer().positive().required(),
    mainOfficerId: Joi.number().integer().positive().required(),
    receivedDate: DATE.required(),
    deadlineDate: DATE,
    description: Joi.string().allow('', null),
    status: Joi.string().valid('在办', '已结', '移交', '存档').allow(null),
    resultItemId: Joi.number().integer().positive().allow(null),
    transferTarget: Joi.string().max(100).allow('', null),
    transferReceiver: Joi.string().max(50).allow('', null),
    transferDate: DATETIME,
    transferReturnDate: DATETIME,
    transferNote: Joi.string().max(255).allow('', null),
    archiveLocation: Joi.string().max(100).allow('', null),
    archiveDate: DATE,
    closedDate: DATE,
    officers: Joi.array().items(officerSchema).default([]),
    persons: Joi.array().items(personSchema).default([]),
});

// 更新案件请求体验证（全部字段可选）
const updateCaseSchema = Joi.object({
    caseNo: Joi.string().max(50),
    caseName: Joi.string().max(255),
    caseTypeItemId: Joi.number().integer().positive(),
    mainOfficerId: Joi.number().integer().positive(),
    receivedDate: DATE,
    deadlineDate: DATE,
    description: Joi.string().allow('', null),
    status: Joi.string().valid('在办', '已结', '移交', '存档'),
    resultItemId: Joi.number().integer().positive().allow(null),
    transferTarget: Joi.string().max(100).allow('', null),
    transferReceiver: Joi.string().max(50).allow('', null),
    transferDate: DATETIME,
    transferReturnDate: DATETIME,
    transferNote: Joi.string().max(255).allow('', null),
    archiveLocation: Joi.string().max(100).allow('', null),
    archiveDate: DATE,
    closedDate: DATE,
    officers: Joi.array().items(officerSchema),
    persons: Joi.array().items(personSchema),
}).min(1); // 至少更新一个字段

// 列表查询参数验证
const listCasesQuerySchema = Joi.object({
    keyword: Joi.string().trim().allow('', null),
    caseTypeItemId: Joi.number().integer().positive(),
    status: Joi.string().valid('在办', '已结', '移交', '存档'),
    receivedFrom: DATE,
    receivedTo: DATE,
    mainOfficerId: Joi.number().integer().positive(),
    scope: Joi.string().valid('my', 'all').default('my'),
    page: Joi.number().integer().min(1).default(1),
    pageSize: Joi.number().integer().min(1).max(100).default(20),
});

// 路径参数 id 验证
const idParamSchema = Joi.object({
    id: Joi.number().integer().positive().required(),
});

/**
 * GET /api/cases
 * 列表：我的案件 / 全部案件
 */
async function listCases(req, res, next) {
    try {
        const query = validate(listCasesQuerySchema, req.query);
        const result = await casesService.listCases(query, req.user);
        sendSuccess(res, result);
    } catch (err) {
        next(err);
    }
}

/**
 * GET /api/cases/:id
 * 案件详情
 */
async function getCaseDetail(req, res, next) {
    try {
        const { id } = validate(idParamSchema, req.params);
        const data = await casesService.getCaseDetail(id, req.user);
        sendSuccess(res, data);
    } catch (err) {
        next(err);
    }
}

/**
 * POST /api/cases
 * 创建案件
 */
async function createCase(req, res, next) {
    try {
        const payload = validate(createCaseSchema, req.body);
        const data = await casesService.createCase(payload, req.user);
        sendSuccess(res, data, '创建成功');
    } catch (err) {
        next(err);
    }
}

/**
 * PUT /api/cases/:id
 * 修改案件（部分字段更新）
 */
async function updateCase(req, res, next) {
    try {
        const { id } = validate(idParamSchema, req.params);
        const payload = validate(updateCaseSchema, req.body);
        const data = await casesService.updateCase(id, payload, req.user);
        sendSuccess(res, data, '更新成功');
    } catch (err) {
        next(err);
    }
}

/**
 * DELETE /api/cases/:id
 * 删除案件
 */
async function deleteCase(req, res, next) {
    try {
        const { id } = validate(idParamSchema, req.params);
        const data = await casesService.deleteCase(id, req.user);
        sendSuccess(res, data, '删除成功');
    } catch (err) {
        next(err);
    }
}

module.exports = {
    listCases,
    getCaseDetail,
    createCase,
    updateCase,
    deleteCase,
};
