// src/modules/communities/routes.js
const express = require('express');
const authMiddleware = require('../../middleware/auth');
const permissionMiddleware = require('../../middleware/permission');
const controller = require('./controller');

// modules/communities 挂载在全局 /api/communities
function buildRouter() {
    const router = express.Router();

    // 所有社区相关接口都需要登录
    router.use(authMiddleware);

    // 列表
    router.get(
        '/',
        permissionMiddleware(['community:manage']),
        controller.listCommunities
    );

    // 新增
    router.post(
        '/',
        permissionMiddleware(['community:manage']),
        controller.createCommunity
    );

    // 修改
    router.put(
        '/:id',
        permissionMiddleware(['community:manage']),
        controller.updateCommunity
    );

    // 删除（如需更细粒度权限，可以改为 ['community:delete'] 等）
    router.delete(
        '/:id',
        permissionMiddleware(['community:manage']),
        controller.deleteCommunity
    );

    return router;
}

module.exports = buildRouter;
