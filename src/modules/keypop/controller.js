const Joi = require('joi');
const service = require('./service');
const { AppError } = require('../../utils/errors');
const logger = require('../../utils/logger');

/**
 * 查询重点人口列表
 * GET /api/keypop
 */
async function listKeyPopulations(req, res, next) {
    try {
        const schema = Joi.object({
            communityId: Joi.number().integer().positive(),
            typeItemId: Joi.number().integer().positive(),
            name: Joi.string().max(50),
            idCardNo: Joi.string().max(30),
            isKey: Joi.number().integer().valid(0, 1),
            controlOfficerId: Joi.number().integer().positive(),
            page: Joi.number().integer().min(1).default(1),
            pageSize: Joi.number().integer().min(1).max(100).default(20)
        });

        const { error, value } = schema.validate(req.query);
        if (error) {
            throw new AppError('VALIDATION_ERROR', error.details[0].message);
        }

        // 检查权限:是否有查看全部权限
        const hasViewAll = req.user.permissions?.includes('keypop:view_all');

        const result = await service.listKeyPopulations(value, req.user.id, hasViewAll);

        res.json({
            success: true,
            data: result,
            message: 'ok'
        });
    } catch (err) {
        next(err);
    }
}

/**
 * 获取重点人口详情
 * GET /api/keypop/:id
 */
async function getKeyPopulation(req, res, next) {
    try {
        const schema = Joi.object({
            id: Joi.number().integer().positive().required()
        });

        const { error, value } = schema.validate({ id: req.params.id });
        if (error) {
            throw new AppError('VALIDATION_ERROR', '无效的ID');
        }

        const person = await service.getKeyPopulationById(value.id);
        if (!person) {
            throw new AppError('NOT_FOUND', '记录不存在');
        }

        // 权限检查:非管理员只能看自己管控的
        const hasViewAll = req.user.permissions?.includes('keypop:view_all');
        if (!hasViewAll && person.controlOfficerId !== req.user.id) {
            throw new AppError('FORBIDDEN', '无权查看该记录');
        }

        res.json({
            success: true,
            data: person,
            message: 'ok'
        });
    } catch (err) {
        next(err);
    }
}

/**
 * 创建重点人口记录
 * POST /api/keypop
 */
async function createKeyPopulation(req, res, next) {
    try {
        const schema = Joi.object({
            name: Joi.string().max(50).required().messages({
                'any.required': '姓名不能为空',
                'string.empty': '姓名不能为空'
            }),
            genderItemId: Joi.number().integer().positive(),
            idCardNo: Joi.string().max(30).allow('', null),
            communityId: Joi.number().integer().positive(),
            householdId: Joi.number().integer().positive(),
            contactPhone: Joi.string().max(50),
            residenceAddress: Joi.string().max(255),
            householdAddress: Joi.string().max(255),
            isKeyPopulation: Joi.boolean().default(false),
            typeItemId: Joi.number().integer().positive().allow(null),
            controlLevelItemId: Joi.number().integer().positive().allow(null),
            riskLevelItemId: Joi.number().integer().positive().allow(null),
            controlOfficerId: Joi.number().integer().positive().allow(null),
            controlMeasure: Joi.string().max(1000),
            revisitIntervalDays: Joi.number().integer().min(1).max(365).default(30),
            remark: Joi.string().max(500)
        });

        const { error, value } = schema.validate(req.body);
        if (error) {
            throw new AppError('VALIDATION_ERROR', error.details[0].message);
        }

        const id = await service.createKeyPopulation(value);
        const person = await service.getKeyPopulationById(id);

        logger.info(`用户${req.user.name}创建重点人口: ${person.name} (ID:${id})`);

        res.json({
            success: true,
            data: person,
            message: '创建成功'
        });
    } catch (err) {
        next(err);
    }
}

/**
 * 更新重点人口信息
 * PUT /api/keypop/:id
 */
async function updateKeyPopulation(req, res, next) {
    try {
        const paramsSchema = Joi.object({
            id: Joi.number().integer().positive().required()
        });

        const { error: paramsError } = paramsSchema.validate({ id: req.params.id });
        if (paramsError) {
            throw new AppError('VALIDATION_ERROR', '无效的ID');
        }

        // 检查记录是否存在
        const existing = await service.getKeyPopulationById(req.params.id);
        if (!existing) {
            throw new AppError('NOT_FOUND', '记录不存在');
        }

        const bodySchema = Joi.object({
            name: Joi.string().max(50).required(),
            genderItemId: Joi.number().integer().positive().allow(null),
            idCardNo: Joi.string().max(30).allow('', null),
            communityId: Joi.number().integer().positive().allow(null),
            householdId: Joi.number().integer().positive().allow(null),
            contactPhone: Joi.string().max(50).allow('', null),
            residenceAddress: Joi.string().max(255).allow('', null),
            householdAddress: Joi.string().max(255).allow('', null),
            isKeyPopulation: Joi.boolean().required(),
            typeItemId: Joi.number().integer().positive().allow(null),
            controlLevelItemId: Joi.number().integer().positive().allow(null),
            riskLevelItemId: Joi.number().integer().positive().allow(null),
            controlOfficerId: Joi.number().integer().positive().allow(null),
            controlMeasure: Joi.string().max(1000).allow('', null),
            revisitIntervalDays: Joi.number().integer().min(1).max(365).default(30),
            remark: Joi.string().max(500).allow('', null)
        });

        const { error: bodyError, value } = bodySchema.validate(req.body);
        if (bodyError) {
            throw new AppError('VALIDATION_ERROR', bodyError.details[0].message);
        }

        await service.updateKeyPopulation(req.params.id, value);
        const updated = await service.getKeyPopulationById(req.params.id);

        logger.info(`用户${req.user.name}更新重点人口: ${updated.name} (ID:${req.params.id})`);

        res.json({
            success: true,
            data: updated,
            message: '更新成功'
        });
    } catch (err) {
        next(err);
    }
}

/**
 * 删除重点人口
 * DELETE /api/keypop/:id
 */
async function deleteKeyPopulation(req, res, next) {
    try {
        const schema = Joi.object({
            id: Joi.number().integer().positive().required()
        });

        const { error, value } = schema.validate({ id: req.params.id });
        if (error) {
            throw new AppError('VALIDATION_ERROR', '无效的ID');
        }

        const person = await service.getKeyPopulationById(value.id);
        if (!person) {
            throw new AppError('NOT_FOUND', '记录不存在');
        }

        await service.deleteKeyPopulation(value.id);

        logger.info(`用户${req.user.name}删除重点人口: ${person.name} (ID:${value.id})`);

        res.json({
            success: true,
            data: null,
            message: '删除成功(包括所有回访记录)'
        });
    } catch (err) {
        next(err);
    }
}

/**
 * 获取回访记录列表
 * GET /api/keypop/:id/visits
 */
async function listVisits(req, res, next) {
    try {
        const schema = Joi.object({
            id: Joi.number().integer().positive().required()
        });

        const { error, value } = schema.validate({ id: req.params.id });
        if (error) {
            throw new AppError('VALIDATION_ERROR', '无效的ID');
        }

        // 检查人口记录是否存在
        const person = await service.getKeyPopulationById(value.id);
        if (!person) {
            throw new AppError('NOT_FOUND', '重点人口不存在');
        }

        const visits = await service.listVisits(value.id);

        res.json({
            success: true,
            data: visits,
            message: 'ok'
        });
    } catch (err) {
        next(err);
    }
}

/**
 * 创建回访记录
 * POST /api/keypop/:id/visits
 */
async function createVisit(req, res, next) {
    try {
        const paramsSchema = Joi.object({
            id: Joi.number().integer().positive().required()
        });

        const { error: paramsError, value: params } = paramsSchema.validate({ id: req.params.id });
        if (paramsError) {
            throw new AppError('VALIDATION_ERROR', '无效的ID');
        }

        // 检查人口记录是否存在
        const person = await service.getKeyPopulationById(params.id);
        if (!person) {
            throw new AppError('NOT_FOUND', '重点人口不存在');
        }

        const bodySchema = Joi.object({
            visitDate: Joi.date().iso().required().messages({
                'any.required': '回访日期不能为空',
                'date.format': '回访日期格式不正确'
            }),
            visitorOfficerId: Joi.number().integer().positive().allow(null),
            visitorName: Joi.string().max(50).allow('', null),
            location: Joi.string().max(100),
            visitContent: Joi.string().max(1000),
            isAbnormal: Joi.boolean().default(false)
        });

        const { error: bodyError, value } = bodySchema.validate(req.body);
        if (bodyError) {
            throw new AppError('VALIDATION_ERROR', bodyError.details[0].message);
        }

        // 如果没有指定访客,默认使用当前登录用户
        if (!value.visitorOfficerId && !value.visitorName) {
            value.visitorOfficerId = req.user.id;
        }

        const visitId = await service.createVisit(params.id, value, req.user.id);
        const visit = await service.getVisitById(visitId);

        logger.info(`用户${req.user.name}为${person.name}创建回访记录 (ID:${visitId})`);

        res.json({
            success: true,
            data: visit,
            message: '回访记录已创建,已自动更新下次回访日期'
        });
    } catch (err) {
        next(err);
    }
}

/**
 * 更新回访记录
 * PUT /api/keypop/visits/:visitId
 */
async function updateVisit(req, res, next) {
    try {
        const paramsSchema = Joi.object({
            visitId: Joi.number().integer().positive().required()
        });

        const { error: paramsError } = paramsSchema.validate({ visitId: req.params.visitId });
        if (paramsError) {
            throw new AppError('VALIDATION_ERROR', '无效的回访记录ID');
        }

        const existing = await service.getVisitById(req.params.visitId);
        if (!existing) {
            throw new AppError('NOT_FOUND', '回访记录不存在');
        }

        const bodySchema = Joi.object({
            visitDate: Joi.date().iso().required(),
            visitorOfficerId: Joi.number().integer().positive().allow(null),
            visitorName: Joi.string().max(50).allow('', null),
            location: Joi.string().max(100).allow('', null),
            visitContent: Joi.string().max(1000).allow('', null),
            isAbnormal: Joi.boolean().default(false)
        });

        const { error: bodyError, value } = bodySchema.validate(req.body);
        if (bodyError) {
            throw new AppError('VALIDATION_ERROR', bodyError.details[0].message);
        }

        await service.updateVisit(req.params.visitId, value);
        const updated = await service.getVisitById(req.params.visitId);

        logger.info(`用户${req.user.name}更新回访记录 (ID:${req.params.visitId})`);

        res.json({
            success: true,
            data: updated,
            message: '更新成功'
        });
    } catch (err) {
        next(err);
    }
}

/**
 * 删除回访记录
 * DELETE /api/keypop/visits/:visitId
 */
async function deleteVisit(req, res, next) {
    try {
        const schema = Joi.object({
            visitId: Joi.number().integer().positive().required()
        });

        const { error, value } = schema.validate({ visitId: req.params.visitId });
        if (error) {
            throw new AppError('VALIDATION_ERROR', '无效的回访记录ID');
        }

        const visit = await service.getVisitById(value.visitId);
        if (!visit) {
            throw new AppError('NOT_FOUND', '回访记录不存在');
        }

        await service.deleteVisit(value.visitId);

        logger.info(`用户${req.user.name}删除回访记录 (ID:${value.visitId})`);

        res.json({
            success: true,
            data: null,
            message: '删除成功'
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    listKeyPopulations,
    getKeyPopulation,
    createKeyPopulation,
    updateKeyPopulation,
    deleteKeyPopulation,
    listVisits,
    createVisit,
    updateVisit,
    deleteVisit
};
