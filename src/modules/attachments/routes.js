const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const controller = require('./controller');
const authMiddleware = require('../../middleware/auth');

// 确保上传目录存在
const UPLOAD_BASE_DIR = process.env.UPLOAD_BASE_DIR || './uploads';
if (!fs.existsSync(UPLOAD_BASE_DIR)) {
    fs.mkdirSync(UPLOAD_BASE_DIR, { recursive: true });
}

// 配置 multer 存储策略
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // 按业务类型和日期组织目录结构: uploads/bizType/YYYY/MM/
        const bizType = req.body.bizType || 'default';
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');

        const dir = path.join(UPLOAD_BASE_DIR, bizType, String(year), month);

        // 递归创建目录
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        cb(null, dir);
    },
    filename: (req, file, cb) => {
        // 生成唯一文件名: timestamp-randomString-originalname
        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substring(2, 8);
        const ext = path.extname(file.originalname);
        const basename = path.basename(file.originalname, ext);
        const filename = `${timestamp}-${randomStr}-${basename}${ext}`;

        cb(null, filename);
    }
});

// 文件过滤器(可选)
const fileFilter = (req, file, cb) => {
    // 这里可以添加文件类型限制，例如只允许图片、PDF等
    // 当前允许所有类型
    cb(null, true);
};

// multer 实例
const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE || 10485760, 10) // 默认10MB
    }
});

/**
 * 导出路由配置函数
 * routes.js 被总路由动态 require 时，会执行这个工厂函数
 */
module.exports = function () {
    const router = express.Router();

    // 所有附件接口都需要登录
    router.use(authMiddleware);

    /**
     * 查询附件列表
     * GET /api/attachments?bizType=CASE&bizId=123
     */
    router.get('/', controller.listAttachments);

    /**
     * 上传附件
     * POST /api/attachments
     * Content-Type: multipart/form-data
     *
     * 表单字段:
     * - file: 文件(必填)
     * - bizType: 业务类型(必填)
     * - bizId: 业务ID(必填)
     * - isPrimary: 是否主附件(可选, 0或1)
     * - remark: 备注(可选)
     */
    router.post('/', upload.single('file'), controller.uploadAttachment);

    /**
     * 更新附件信息
     * PUT /api/attachments/:id
     *
     * 可更新字段:
     * - isPrimary: 是否主附件
     * - remark: 备注
     */
    router.put('/:id', controller.updateAttachment);

    /**
     * 下载/预览附件
     * GET /api/attachments/:id/download
     */
    router.get('/:id/download', controller.downloadAttachment);

    /**
     * 删除附件
     * DELETE /api/attachments/:id
     * 注意: 需要对应业务的编辑权限
     */
    router.delete('/:id', controller.deleteAttachment);

    return router;
};
