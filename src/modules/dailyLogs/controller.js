const Joi = require('joi');
const service = require('./service');
const { AppError } = require('../../utils/errors');
const logger = require('../../utils/logger');

/**
 * 查询日志列表
 * GET /api/daily-logs
 */
async function listDailyLogs(req, res, next) {
    try {
        const schema = Joi.object({
            officerId: Joi.number().integer().positive(),
            dateFrom: Joi.date().iso(),
            dateTo: Joi.date().iso().min(Joi.ref('dateFrom')),
            isOnDuty: Joi.number().integer().valid(0, 1)
        });

        const { error, value } = schema.validate(req.query);
        if (error) {
            throw new AppError('VALIDATION_ERROR', error.details[0].message);
        }

        // 如果没有指定officerId,默认查询当前用户的日志
        if (!value.officerId) {
            value.officerId = req.user.id;
        }

        // 权限检查:非管理员只能查看自己的日志
        const canViewAll = req.user.permissions?.includes('log:view_all');
        if (!canViewAll && value.officerId !== req.user.id) {
            throw new AppError('FORBIDDEN', '只能查看自己的日志');
        }

        const logs = await service.listDailyLogs(value);

        res.json({
            success: true,
            data: logs,
            message: 'ok'
        });
    } catch (err) {
        next(err);
    }
}

/**
 * 获取日志详情
 * GET /api/daily-logs/:id
 */
async function getDailyLog(req, res, next) {
    try {
        const schema = Joi.object({
            id: Joi.number().integer().positive().required()
        });

        const { error, value } = schema.validate({ id: req.params.id });
        if (error) {
            throw new AppError('VALIDATION_ERROR', '无效的日志ID');
        }

        const log = await service.getDailyLogById(value.id);
        if (!log) {
            throw new AppError('NOT_FOUND', '日志不存在');
        }

        // 权限检查
        const canViewAll = req.user.permissions?.includes('log:view_all');
        if (!canViewAll && log.officerId !== req.user.id) {
            throw new AppError('FORBIDDEN', '只能查看自己的日志');
        }

        res.json({
            success: true,
            data: log,
            message: 'ok'
        });
    } catch (err) {
        next(err);
    }
}

/**
 * 检查今天是否已填写日志
 * GET /api/daily-logs/today/check
 */
async function checkTodayLog(req, res, next) {
    try {
        const hasTodayLog = await service.hasTodayLog(req.user.id);

        // 如果已填写,返回今日日志详情
        let todayLog = null;
        if (hasTodayLog) {
            const today = new Date().toISOString().split('T')[0];
            todayLog = await service.getDailyLogByOfficerAndDate(req.user.id, today);
        }

        res.json({
            success: true,
            data: {
                hasTodayLog,
                todayLog
            },
            message: 'ok'
        });
    } catch (err) {
        next(err);
    }
}

/**
 * 创建日志
 * POST /api/daily-logs
 */
async function createDailyLog(req, res, next) {
    try {
        const schema = Joi.object({
            logDate: Joi.date().iso().required().messages({
                'any.required': '日志日期不能为空',
                'date.format': '日期格式不正确'
            }),
            isOnDuty: Joi.boolean().default(false),
            alarmCount: Joi.number().integer().min(0).default(0),
            adminCaseCount: Joi.number().integer().min(0).default(0),
            criminalCaseCount: Joi.number().integer().min(0).default(0),
            content: Joi.string().max(2000).allow('', null)
        });

        const { error, value } = schema.validate(req.body);
        if (error) {
            throw new AppError('VALIDATION_ERROR', error.details[0].message);
        }

        // 日志日期不能是未来日期
        const logDate = new Date(value.logDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (logDate > today) {
            throw new AppError('VALIDATION_ERROR', '不能填写未来日期的日志');
        }

        const id = await service.createDailyLog(value, req.user.id);
        const log = await service.getDailyLogById(id);

        logger.info(`用户${req.user.name}创建日志: ${value.logDate} (ID:${id})`);

        res.json({
            success: true,
            data: log,
            message: '创建成功'
        });
    } catch (err) {
        next(err);
    }
}

/**
 * 更新日志
 * PUT /api/daily-logs/:id
 */
async function updateDailyLog(req, res, next) {
    try {
        const paramsSchema = Joi.object({
            id: Joi.number().integer().positive().required()
        });

        const { error: paramsError } = paramsSchema.validate({ id: req.params.id });
        if (paramsError) {
            throw new AppError('VALIDATION_ERROR', '无效的日志ID');
        }

        const bodySchema = Joi.object({
            logDate: Joi.date().iso(),
            isOnDuty: Joi.boolean(),
            alarmCount: Joi.number().integer().min(0),
            adminCaseCount: Joi.number().integer().min(0),
            criminalCaseCount: Joi.number().integer().min(0),
            content: Joi.string().max(2000).allow('', null)
        }).min(1); // 至少要有一个字段

        const { error: bodyError, value } = bodySchema.validate(req.body);
        if (bodyError) {
            throw new AppError('VALIDATION_ERROR', bodyError.details[0].message);
        }

        // 如果修改日期,检查是否为未来日期
        if (value.logDate) {
            const logDate = new Date(value.logDate);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (logDate > today) {
                throw new AppError('VALIDATION_ERROR', '不能填写未来日期的日志');
            }
        }

        await service.updateDailyLog(req.params.id, value, req.user.id);
        const updated = await service.getDailyLogById(req.params.id);

        logger.info(`用户${req.user.name}更新日志: ${updated.logDate} (ID:${req.params.id})`);

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
 * 删除日志
 * DELETE /api/daily-logs/:id
 */
async function deleteDailyLog(req, res, next) {
    try {
        const schema = Joi.object({
            id: Joi.number().integer().positive().required()
        });

        const { error, value } = schema.validate({ id: req.params.id });
        if (error) {
            throw new AppError('VALIDATION_ERROR', '无效的日志ID');
        }

        const log = await service.getDailyLogById(value.id);
        if (!log) {
            throw new AppError('NOT_FOUND', '日志不存在');
        }

        await service.deleteDailyLog(value.id, req.user.id);

        logger.info(`用户${req.user.name}删除日志: ${log.logDate} (ID:${value.id})`);

        res.json({
            success: true,
            data: null,
            message: '删除成功'
        });
    } catch (err) {
        next(err);
    }
}

/**
 * 获取日志统计
 * GET /api/daily-logs/statistics
 */
async function getLogStatistics(req, res, next) {
    try {
        const schema = Joi.object({
            officerId: Joi.number().integer().positive(),
            dateFrom: Joi.date().iso().required(),
            dateTo: Joi.date().iso().required().min(Joi.ref('dateFrom'))
        });

        const { error, value } = schema.validate(req.query);
        if (error) {
            throw new AppError('VALIDATION_ERROR', error.details[0].message);
        }

        // 如果没有指定officerId,默认查询当前用户
        const targetOfficerId = value.officerId || req.user.id;

        // 权限检查
        const canViewAll = req.user.permissions?.includes('log:view_all');
        if (!canViewAll && targetOfficerId !== req.user.id) {
            throw new AppError('FORBIDDEN', '只能查看自己的统计信息');
        }

        const stats = await service.getLogStatistics(
            targetOfficerId,
            value.dateFrom,
            value.dateTo
        );

        res.json({
            success: true,
            data: stats,
            message: 'ok'
        });
    } catch (err) {
        next(err);
    }
}

/**
 * 获取缺失日志提醒
 * GET /api/daily-logs/missing
 */
async function getMissingLogs(req, res, next) {
    try {
        const schema = Joi.object({
            days: Joi.number().integer().min(1).max(30).default(7)
        });

        const { error, value } = schema.validate(req.query);
        if (error) {
            throw new AppError('VALIDATION_ERROR', error.details[0].message);
        }

        const missingDates = await service.getMissingLogDates(req.user.id, value.days);

        res.json({
            success: true,
            data: {
                days: value.days,
                missingCount: missingDates.length,
                missingDates
            },
            message: 'ok'
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    listDailyLogs,
    getDailyLog,
    checkTodayLog,
    createDailyLog,
    updateDailyLog,
    deleteDailyLog,
    getLogStatistics,
    getMissingLogs
};
