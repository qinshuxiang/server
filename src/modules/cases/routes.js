// src/modules/cases/routes.js
const express = require('express');
const authMiddleware = require('../../middleware/auth');
const requirePermission = require('../../middleware/permission');
const casesController = require('./controller');

/**
 * cases 模块路由：
 * 将在顶层 routes.js 中以 /cases 挂载，即最终路径为 /api/cases...
 */
function createCasesRouter() {
    const router = express.Router();

    // 列表：我的案件 / 全部案件
    router.get(
        '/',
        authMiddleware,
        // 具备 case:view_my 或 case:view_all 任一即可访问列表；
        // 实际 scope=all 的处理在 Service 中再校验是否有 case:view_all
        requirePermission(['case:view_my', 'case:view_all']),
        casesController.listCases
    );

    // 创建案件
    router.post(
        '/',
        authMiddleware,
        requirePermission('case:create'),
        casesController.createCase
    );

    // 案件详情（案件参与者或管理员）
    // 这里先要求具备查看案件权限（my 或 all），再在 Service 中根据参与关系/管理员身份做精细控制
    router.get(
        '/:id',
        authMiddleware,
        requirePermission(['case:view_my', 'case:view_all']),
        casesController.getCaseDetail
    );

    // 修改案件（默认与创建权限一致：case:create）
    router.put(
        '/:id',
        authMiddleware,
        requirePermission('case:create'),
        casesController.updateCase
    );

    // 删除案件（同样使用 case:create 权限；且在 Service 中附加状态/参与者校验）
    router.delete(
        '/:id',
        authMiddleware,
        requirePermission('case:create'),
        casesController.deleteCase
    );

    return router;
}

module.exports = createCasesRouter;
