const Joi = require('joi');
const service = require('./service');
const { AppError } = require('../../utils/errors');
const logger = require('../../utils/logger');

/**
 * 查询法律条文列表
 * GET /api/laws
 */
async function listLawArticles(req, res, next) {
    try {
        const schema = Joi.object({
            keyword: Joi.string().max(100),
            lawName: Joi.string().max(255),
            lawCategory: Joi.string().max(50),
            isValid: Joi.number().integer().valid(0, 1),
            publishAgency: Joi.string().max(100),
            page: Joi.number().integer().min(1).default(1),
            pageSize: Joi.number().integer().min(1).max(100).default(20)
        });

        const { error, value } = schema.validate(req.query);
        if (error) {
            throw new AppError('VALIDATION_ERROR', error.details[0].message);
        }

        const result = await service.listLawArticles(value);

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
 * 获取法律条文详情
 * GET /api/laws/:id
 */
async function getLawArticle(req, res, next) {
    try {
        const schema = Joi.object({
            id: Joi.number().integer().positive().required()
        });

        const { error, value } = schema.validate({ id: req.params.id });
        if (error) {
            throw new AppError('VALIDATION_ERROR', '无效的条文ID');
        }

        const article = await service.getLawArticleById(value.id);
        if (!article) {
            throw new AppError('NOT_FOUND', '法律条文不存在');
        }

        res.json({
            success: true,
            data: article,
            message: 'ok'
        });
    } catch (err) {
        next(err);
    }
}

/**
 * 创建法律条文
 * POST /api/laws
 */
async function createLawArticle(req, res, next) {
    try {
        const schema = Joi.object({
            lawName: Joi.string().max(255).required().messages({
                'any.required': '法规名称不能为空',
                'string.empty': '法规名称不能为空'
            }),
            lawCategory: Joi.string().max(50),
            publishAgency: Joi.string().max(100),
            effectiveDate: Joi.date().iso(),
            expiredDate: Joi.date().iso(),
            isValid: Joi.boolean().default(true),
            articleNo: Joi.string().max(50),
            content: Joi.string().max(65535) // TEXT类型最大长度
        });

        const { error, value } = schema.validate(req.body);
        if (error) {
            throw new AppError('VALIDATION_ERROR', error.details[0].message);
        }

        const id = await service.createLawArticle(value);
        const article = await service.getLawArticleById(id);

        logger.info(`用户${req.user.name}创建法律条文: ${article.lawName} (ID:${id})`);

        res.json({
            success: true,
            data: article,
            message: '创建成功'
        });
    } catch (err) {
        next(err);
    }
}

/**
 * 更新法律条文
 * PUT /api/laws/:id
 */
async function updateLawArticle(req, res, next) {
    try {
        const paramsSchema = Joi.object({
            id: Joi.number().integer().positive().required()
        });

        const { error: paramsError } = paramsSchema.validate({ id: req.params.id });
        if (paramsError) {
            throw new AppError('VALIDATION_ERROR', '无效的条文ID');
        }

        // 检查条文是否存在
        const existing = await service.getLawArticleById(req.params.id);
        if (!existing) {
            throw new AppError('NOT_FOUND', '法律条文不存在');
        }

        const bodySchema = Joi.object({
            lawName: Joi.string().max(255).required(),
            lawCategory: Joi.string().max(50).allow('', null),
            publishAgency: Joi.string().max(100).allow('', null),
            effectiveDate: Joi.date().iso().allow(null),
            expiredDate: Joi.date().iso().allow(null),
            isValid: Joi.boolean(),
            articleNo: Joi.string().max(50).allow('', null),
            content: Joi.string().max(65535).allow('', null)
        });

        const { error: bodyError, value } = bodySchema.validate(req.body);
        if (bodyError) {
            throw new AppError('VALIDATION_ERROR', bodyError.details[0].message);
        }

        await service.updateLawArticle(req.params.id, value);
        const updated = await service.getLawArticleById(req.params.id);

        logger.info(`用户${req.user.name}更新法律条文: ${updated.lawName} (ID:${req.params.id})`);

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
 * 删除法律条文
 * DELETE /api/laws/:id
 */
async function deleteLawArticle(req, res, next) {
    try {
        const schema = Joi.object({
            id: Joi.number().integer().positive().required()
        });

        const { error, value } = schema.validate({ id: req.params.id });
        if (error) {
            throw new AppError('VALIDATION_ERROR', '无效的条文ID');
        }

        const article = await service.getLawArticleById(value.id);
        if (!article) {
            throw new AppError('NOT_FOUND', '法律条文不存在');
        }

        await service.deleteLawArticle(value.id);

        logger.info(`用户${req.user.name}删除法律条文: ${article.lawName} (ID:${value.id})`);

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
 * 批量导入法律条文
 * POST /api/laws/batch-import
 */
async function batchImport(req, res, next) {
    try {
        const schema = Joi.object({
            articles: Joi.array().items(
                Joi.object({
                    lawName: Joi.string().max(255).required(),
                    lawCategory: Joi.string().max(50).allow('', null),
                    publishAgency: Joi.string().max(100).allow('', null),
                    effectiveDate: Joi.date().iso().allow(null),
                    expiredDate: Joi.date().iso().allow(null),
                    isValid: Joi.boolean().default(true),
                    articleNo: Joi.string().max(50).allow('', null),
                    content: Joi.string().max(65535).allow('', null)
                })
            ).min(1).required().messages({
                'array.min': '至少需要导入一条记录',
                'any.required': '导入数据不能为空'
            })
        });

        const { error, value } = schema.validate(req.body);
        if (error) {
            throw new AppError('VALIDATION_ERROR', error.details[0].message);
        }

        const result = await service.batchImportLawArticles(value.articles);

        logger.info(`用户${req.user.name}批量导入法律条文: 成功${result.successCount}条, 失败${result.failCount}条`);

        res.json({
            success: true,
            data: result,
            message: `导入完成: 成功${result.successCount}条, 失败${result.failCount}条`
        });
    } catch (err) {
        next(err);
    }
}

/**
 * 获取法规名称列表
 * GET /api/laws/law-names
 */
async function getLawNames(req, res, next) {
    try {
        const names = await service.getLawNames();

        res.json({
            success: true,
            data: names,
            message: 'ok'
        });
    } catch (err) {
        next(err);
    }
}

/**
 * 获取法规类别列表
 * GET /api/laws/categories
 */
async function getLawCategories(req, res, next) {
    try {
        const categories = await service.getLawCategories();

        res.json({
            success: true,
            data: categories,
            message: 'ok'
        });
    } catch (err) {
        next(err);
    }
}

/**
 * 全文搜索
 * GET /api/laws/search?keyword=xxx
 */
async function fullTextSearch(req, res, next) {
    try {
        const schema = Joi.object({
            keyword: Joi.string().min(2).max(100).required().messages({
                'any.required': '搜索关键字不能为空',
                'string.min': '搜索关键字至少2个字符',
                'string.empty': '搜索关键字不能为空'
            }),
            limit: Joi.number().integer().min(1).max(100).default(20)
        });

        const { error, value } = schema.validate(req.query);
        if (error) {
            throw new AppError('VALIDATION_ERROR', error.details[0].message);
        }

        const results = await service.fullTextSearch(value.keyword, value.limit);

        res.json({
            success: true,
            data: results,
            message: 'ok'
        });
    } catch (err) {
        next(err);
    }
}

/**
 * 标记法规为失效
 * PUT /api/laws/:id/invalidate
 */
async function markAsInvalid(req, res, next) {
    try {
        const paramsSchema = Joi.object({
            id: Joi.number().integer().positive().required()
        });

        const { error: paramsError } = paramsSchema.validate({ id: req.params.id });
        if (paramsError) {
            throw new AppError('VALIDATION_ERROR', '无效的条文ID');
        }

        const article = await service.getLawArticleById(req.params.id);
        if (!article) {
            throw new AppError('NOT_FOUND', '法律条文不存在');
        }

        const bodySchema = Joi.object({
            expiredDate: Joi.date().iso().required().messages({
                'any.required': '失效日期不能为空'
            })
        });

        const { error: bodyError, value } = bodySchema.validate(req.body);
        if (bodyError) {
            throw new AppError('VALIDATION_ERROR', bodyError.details[0].message);
        }

        await service.markAsInvalid(req.params.id, value.expiredDate);

        logger.info(`用户${req.user.name}标记法律条文为失效: ${article.lawName} (ID:${req.params.id})`);

        res.json({
            success: true,
            data: null,
            message: '已标记为失效'
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    listLawArticles,
    getLawArticle,
    createLawArticle,
    updateLawArticle,
    deleteLawArticle,
    batchImport,
    getLawNames,
    getLawCategories,
    fullTextSearch,
    markAsInvalid
};
