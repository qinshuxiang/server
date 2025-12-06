const express = require('express');
const controller = require('./controller');
const authMiddleware = require('../../middleware/auth');
const permissionMiddleware = require('../../middleware/permission');

/**
 * 导出路由配置函数
 */
module.exports = function () {
    const router = express.Router();

    // 所有接口都需要登录
    router.use(authMiddleware);

    /**
     * 重点人口管理接口
     */

    /**
     * 查询重点人口列表
     * GET /api/keypop
     * 权限: keypop:view_my (默认只看自己管控的) 或 keypop:view_all (查看全部)
     */
    router.get(
        '/',
        permissionMiddleware(['keypop:view_my', 'keypop:view_all'], 'any'),
        controller.listKeyPopulations
    );

    /**
     * 获取重点人口详情
     * GET /api/keypop/:id
     * 权限: keypop:view_my 或 keypop:view_all
     */
    router.get(
        '/:id',
        permissionMiddleware(['keypop:view_my', 'keypop:view_all'], 'any'),
        controller.getKeyPopulation
    );

    /**
     * 创建重点人口记录
     * POST /api/keypop
     * 权限: keypop:manage
     */
    router.post(
        '/',
        permissionMiddleware(['keypop:manage']),
        controller.createKeyPopulation
    );

    /**
     * 更新重点人口信息
     * PUT /api/keypop/:id
     * 权限: keypop:manage
     */
    router.put(
        '/:id',
        permissionMiddleware(['keypop:manage']),
        controller.updateKeyPopulation
    );

    /**
     * 删除重点人口
     * DELETE /api/keypop/:id
     * 权限: keypop:manage
     * 注意: 会级联删除所有回访记录
     */
    router.delete(
        '/:id',
        permissionMiddleware(['keypop:manage']),
        controller.deleteKeyPopulation
    );

    /**
     * 回访记录管理接口
     */

    /**
     * 获取某重点人口的回访记录列表
     * GET /api/keypop/:id/visits
     * 权限: keypop:view_my 或 keypop:view_all
     */
    router.get(
        '/:id/visits',
        permissionMiddleware(['keypop:view_my', 'keypop:view_all'], 'any'),
        controller.listVisits
    );

    /**
     * 创建回访记录
     * POST /api/keypop/:id/visits
     * 权限: keypop:visit
     *
     * 说明:
     * - 创建成功后会自动更新重点人口的 latest_visit_date 和 next_visit_date
     * - 如果未指定访客,默认使用当前登录用户作为访客
     */
    router.post(
        '/:id/visits',
        permissionMiddleware(['keypop:visit']),
        controller.createVisit
    );

    /**
     * 更新回访记录
     * PUT /api/keypop/visits/:visitId
     * 权限: keypop:visit
     */
    router.put(
        '/visits/:visitId',
        permissionMiddleware(['keypop:visit']),
        controller.updateVisit
    );

    /**
     * 删除回访记录
     * DELETE /api/keypop/visits/:visitId
     * 权限: keypop:visit
     */
    router.delete(
        '/visits/:visitId',
        permissionMiddleware(['keypop:visit']),
        controller.deleteVisit
    );

    return router;
};
