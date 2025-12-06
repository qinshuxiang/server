'use strict';

const express = require('express');
const auth = require('../../middleware/auth');
const controller = require('./controller');

/**
 * 挂载在顶层 /api/dashboard 下：
 *   GET /api/dashboard/today
 * 权限：登录即可 :contentReference[oaicite:5]{index=5}
 */
function createDashboardRouter() {
    const router = express.Router();

    // 登录即可，无额外权限
    router.use(auth);

    router.get('/today', controller.getTodayOverview);

    return router;
}

module.exports = createDashboardRouter;
