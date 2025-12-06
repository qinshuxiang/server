const Joi = require('joi');
const service = require('./service');
const { AppError } = require('../../utils/errors');
const logger = require('../../utils/logger');

/**
 * 查询附件列表
 * GET /api/attachments?bizType=CASE&bizId=123
 */
async function listAttachments(req, res, next) {
    try {
        const schema = Joi.object({
            bizType: Joi.string().required().messages({
                'any.required': '业务类型不能为空',
                'string.empty': '业务类型不能为空'
            }),
            bizId: Joi.number().integer().positive().required().messages({
                'any.required': '业务ID不能为空',
                'number.base': '业务ID必须为数字',
                'number.positive': '业务ID必须大于0'
            })
        });

        const { error, value } = schema.validate(req.query);
        if (error) {
            throw new AppError('VALIDATION_ERROR', error.details[0].message);
        }

        const { bizType, bizId } = value;
        const items = await service.listAttachments(bizType, bizId);

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
 * 上传附件
 * POST /api/attachments
 * Content-Type: multipart/form-data
 */
async function uploadAttachment(req, res, next) {
    try {
        // multer中间件已处理文件上传, 文件信息在 req.file 中
        if (!req.file) {
            throw new AppError('VALIDATION_ERROR', '未上传文件');
        }

        const schema = Joi.object({
            bizType: Joi.string().required().messages({
                'any.required': '业务类型不能为空'
            }),
            bizId: Joi.number().integer().positive().required().messages({
                'any.required': '业务ID不能为空',
                'number.base': '业务ID必须为数字'
            }),
            isPrimary: Joi.number().integer().valid(0, 1).default(0),
            remark: Joi.string().max(255).allow('', null)
        });

        const { error, value } = schema.validate(req.body);
        if (error) {
            throw new AppError('VALIDATION_ERROR', error.details[0].message);
        }

        // 文件大小检查
        const maxSize = parseInt(process.env.MAX_FILE_SIZE || 10485760, 10); // 默认10MB
        if (req.file.size > maxSize) {
            throw new AppError(
                'VALIDATION_ERROR',
                `文件大小不能超过${maxSize / 1024 / 1024}MB`
            );
        }

        const attachmentId = await service.createAttachment(
            value,
            req.file,
            req.user.id
        );

        const attachment = await service.getAttachmentById(attachmentId);

        logger.info(
            `用户${req.user.name}上传附件: ${attachment.fileName} (${value.bizType}:${value.bizId})`
        );

        res.json({
            success: true,
            data: attachment,
            message: '上传成功'
        });
    } catch (err) {
        next(err);
    }
}

/**
 * 删除附件
 * DELETE /api/attachments/:id
 */
async function deleteAttachment(req, res, next) {
    try {
        const schema = Joi.object({
            id: Joi.number().integer().positive().required()
        });

        const { error, value } = schema.validate({ id: req.params.id });
        if (error) {
            throw new AppError('VALIDATION_ERROR', '无效的附件ID');
        }

        const attachment = await service.getAttachmentById(value.id);
        if (!attachment) {
            throw new AppError('NOT_FOUND', '附件不存在');
        }

        // 权限检查: 这里简化处理, 实际应根据 bizType 判断对应业务权限
        // 例如: 删除案件附件需要 case:edit 权限
        // 可以在此处调用对应业务模块的权限检查函数

        await service.deleteAttachment(value.id);

        logger.info(
            `用户${req.user.name}删除附件: ${attachment.fileName} (ID:${value.id})`
        );

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
 * 更新附件信息(如备注、主附件标识)
 * PUT /api/attachments/:id
 */
async function updateAttachment(req, res, next) {
    try {
        const paramsSchema = Joi.object({
            id: Joi.number().integer().positive().required()
        });

        const { error: paramsError } = paramsSchema.validate({
            id: req.params.id
        });
        if (paramsError) {
            throw new AppError('VALIDATION_ERROR', '无效的附件ID');
        }

        const bodySchema = Joi.object({
            isPrimary: Joi.number().integer().valid(0, 1),
            remark: Joi.string().max(255).allow('', null)
        }).min(1); // 至少要有一个字段

        const { error: bodyError, value } = bodySchema.validate(req.body);
        if (bodyError) {
            throw new AppError(
                'VALIDATION_ERROR',
                bodyError.details[0].message
            );
        }

        const attachment = await service.getAttachmentById(req.params.id);
        if (!attachment) {
            throw new AppError('NOT_FOUND', '附件不存在');
        }

        await service.updateAttachment(req.params.id, value);

        const updated = await service.getAttachmentById(req.params.id);

        logger.info(
            `用户${req.user.name}更新附件: ${attachment.fileName} (ID:${req.params.id})`
        );

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
 * 下载/预览附件
 * GET /api/attachments/:id/download
 */
async function downloadAttachment(req, res, next) {
    try {
        const schema = Joi.object({
            id: Joi.number().integer().positive().required()
        });

        const { error, value } = schema.validate({ id: req.params.id });
        if (error) {
            throw new AppError('VALIDATION_ERROR', '无效的附件ID');
        }

        const attachment = await service.getAttachmentById(value.id);
        if (!attachment) {
            throw new AppError('NOT_FOUND', '附件不存在');
        }

        const path = require('path');
        const UPLOAD_BASE_DIR = process.env.UPLOAD_BASE_DIR || './uploads';
        const fullPath = path.join(UPLOAD_BASE_DIR, attachment.filePath);

        // 检查文件是否存在
        const fs = require('fs').promises;
        try {
            await fs.access(fullPath);
        } catch (err) {
            throw new AppError('NOT_FOUND', '文件不存在');
        }

        // 设置响应头
        res.setHeader(
            'Content-Type',
            attachment.mimeType || 'application/octet-stream'
        );
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${encodeURIComponent(attachment.fileName)}"`
        );

        // 发送文件
        res.sendFile(path.resolve(fullPath));

        logger.info(
            `用户${req.user.name}下载附件: ${attachment.fileName} (ID:${value.id})`
        );
    } catch (err) {
        next(err);
    }
}

module.exports = {
    listAttachments,
    uploadAttachment,
    deleteAttachment,
    updateAttachment,
    downloadAttachment
};
