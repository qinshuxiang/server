// src/routes.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const logger = require('./utils/logger');

const router = express.Router();

const modulesPath = path.join(__dirname, 'modules');

// 如果 modules 目录不存在，给个提示但不报错
if (!fs.existsSync(modulesPath)) {
    logger.warn('[routes] "modules" directory not found, no business routes registered');
} else {
    // 读取 modules 目录下的所有子目录
    fs.readdirSync(modulesPath, { withFileTypes: true }).forEach((dirent) => {
        if (!dirent.isDirectory()) return;

        const moduleName = dirent.name;
        const routesFile = path.join(modulesPath, moduleName, 'routes.js');

        if (!fs.existsSync(routesFile)) {
            logger.debug?.(`[routes] Skip module "${moduleName}", routes.js not found`);
            return;
        }

        let subRouterFactory;
        try {
            subRouterFactory = require(routesFile);
        } catch (err) {
            logger.error('[routes] Failed to require routes.js for module "%s"', moduleName, { err });
            return;
        }

        // 约定：各模块 routes.js 导出一个函数，返回 Express Router 对象
        if (typeof subRouterFactory !== 'function') {
            logger.warn('[routes] Skip module "%s", routes.js is not exporting a function', moduleName);
            return;
        }

        // 模块名转短横线路径：dailyLogs -> /daily-logs, nineSmall -> /nine-small
        const mountPath =
            '/' + moduleName.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());

        try {
            const subRouter = subRouterFactory();
            router.use(mountPath, subRouter);
            logger.info(
                '[routes] Registered: %s -> modules/%s/routes.js',
                mountPath,
                moduleName
            );
        } catch (err) {
            logger.error(
                '[routes] Failed to init router for module "%s"',
                moduleName,
                { err }
            );
        }
    });
}

module.exports = router;
