const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// 获取当前目录下的所有文件名
const files = fs.readdirSync(__dirname);

files.forEach((file) => {
    // 1. 排除 index.js 本身和非 js 文件
    if (file === 'index.js' || !file.endsWith('.js')) return;

    // 2. 处理路由路径前缀
    // 逻辑：去除文件名后缀 '.js'，如果文件名包含 'Routes' 也一并去除
    // 例如：'authRoutes.js' -> '/auth'， 'users.js' -> '/users'
    const routePath = '/' + file.replace(/Routes?\.js$|\.js$/, '').toLowerCase();

    // 3. 引入路由模块
    const routeModule = require(path.join(__dirname, file));

    // 4. 注册路由
    // 最终效果：app.use('/api/auth', authRoutes)
    router.use(routePath, routeModule);

    console.log(`[Route] Auto registered: ${routePath} -> ${file}`);
});

module.exports = router;
