const express = require('express');
const authMiddleware = require('../../middleware/auth');
const requirePermission = require('../../middleware/permission');
const controller = require('./controller');

/**
 * 挂载路径：/api/community-person-roles
 * （由顶层 src/routes.js 根据目录名自动生成） :contentReference[oaicite:3]{index=3}
 */
function createCommunityPersonRolesRouter() {
    const router = express.Router();

    // 需要登录
    router.use(authMiddleware);

    // 所有操作都走 community:manage
    router.get(
        '/',
        requirePermission('community:manage'),
        controller.listCommunityPersonRoles
    );

    router.post(
        '/',
        requirePermission('community:manage'),
        controller.createCommunityPersonRole
    );

    router.put(
        '/:id',
        requirePermission('community:manage'),
        controller.updateCommunityPersonRole
    );

    router.delete(
        '/:id',
        requirePermission('community:manage'),
        controller.deleteCommunityPersonRole
    );

    return router;
}

module.exports = createCommunityPersonRolesRouter;
