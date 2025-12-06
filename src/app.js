// src/app.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');
const { notFound } = require('./utils/errors');
const logger = require('./utils/logger');

const app = express();

// CORS
app.use(cors());

// 解析 JSON / 表单
app.use(
    express.json({
        limit: process.env.JSON_LIMIT || '1mb'
    })
);
app.use(
    express.urlencoded({
        extended: true
    })
);

// 静态文件（附件访问），可选：配置 UPLOAD_BASE_DIR 后才生效
const uploadBaseDir = process.env.UPLOAD_BASE_DIR;
if (uploadBaseDir) {
    const absUploadDir = path.resolve(uploadBaseDir);
    app.use('/uploads', express.static(absUploadDir));
    logger.info('[app] Static uploads mounted at /uploads -> %s', absUploadDir);
}

// 业务路由统一挂在 /api 前缀下
app.use('/api', routes);

// 未匹配到的 /api 路由，统一返回 JSON 形式的 404
app.use('/api', (req, res, next) => {
    next(notFound('接口不存在'));
});

// 全局错误处理（统一错误响应格式）
app.use(errorHandler);

// 启动服务器（仅当直接运行 app.js 时）
const port = Number(process.env.PORT || 3000);

if (require.main === module) {
    app.listen(port, () => {
        logger.info('Server listening on port %d', port);
    });
}

// 便于测试或在其他文件中复用
module.exports = app;
