// src/modules/households/routes.js
const express = require('express');
const authMiddleware = require('../../middleware/auth');
const requirePermission = require('../../middleware/permission');
const controller = require('./controller');

/**
 * 挂载路径：/api/households
 */
function createHouseholdsRouter() {
    const router = express.Router();

    // 房屋列表
    router.get(
        '/',
        authMiddleware,
        requirePermission('community:manage'),
        controller.listHouseholds
    );

    // 新增房屋
    router.post(
        '/',
        authMiddleware,
        requirePermission('community:manage'),
        controller.createHousehold
    );

    // 修改房屋
    router.put(
        '/:id',
        authMiddleware,
        requirePermission('community:manage'),
        controller.updateHousehold
    );

    return router;
}

module.exports = createHouseholdsRouter;
