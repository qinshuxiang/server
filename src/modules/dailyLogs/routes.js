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
     * 检查今天是否已填写日志
     * GET /api/daily-logs/today/check
     *
     * 返回:
     * {
     *   hasTodayLog: boolean,
     *   todayLog: object | null
     * }
     */
    router.get(
        '/today/check',
        permissionMiddleware(['log:manage']),
        controller.checkTodayLog
    );

    /**
     * 获取日志统计
     * GET /api/daily-logs/statistics?dateFrom=2025-11-01&dateTo=2025-11-30&officerId=1
     * 权限: log:manage (查看自己) 或 log:view_all (查看他人)
     *
     * 返回统计信息:
     * - totalLogs: 总日志条数
     * - dutyDays: 值班天数
     * - totalAlarms: 总接警数
     * - totalAdminCases: 总行政案件数
     * - totalCriminalCases: 总刑事案件数
     */
    router.get(
        '/statistics',
        permissionMiddleware(['log:manage', 'log:view_all'], 'any'),
        controller.getLogStatistics
    );

    /**
     * 获取缺失日志提醒
     * GET /api/daily-logs/missing?days=7
     * 权限: log:manage
     *
     * 返回最近N天(默认7天)未填写日志的日期列表
     */
    router.get(
        '/missing',
        permissionMiddleware(['log:manage']),
        controller.getMissingLogs
    );

    /**
     * 查询日志列表
     * GET /api/daily-logs?officerId=1&dateFrom=2025-11-01&dateTo=2025-11-30
     * 权限: log:manage (查看自己) 或 log:view_all (查看他人)
     *
     * 查询参数:
     * - officerId: 民警ID(不传则查询当前用户)
     * - dateFrom: 开始日期
     * - dateTo: 结束日期
     * - isOnDuty: 是否值班(0/1)
     */
    router.get(
        '/',
        permissionMiddleware(['log:manage', 'log:view_all'], 'any'),
        controller.listDailyLogs
    );

    /**
     * 获取日志详情
     * GET /api/daily-logs/:id
     * 权限: log:manage (查看自己) 或 log:view_all (查看他人)
     */
    router.get(
        '/:id',
        permissionMiddleware(['log:manage', 'log:view_all'], 'any'),
        controller.getDailyLog
    );

    /**
     * 创建日志
     * POST /api/daily-logs
     * 权限: log:manage
     *
     * 请求体:
     * {
     *   "logDate": "2025-12-03",
     *   "isOnDuty": true,
     *   "alarmCount": 5,
     *   "adminCaseCount": 2,
     *   "criminalCaseCount": 1,
     *   "content": "今日工作内容..."
     * }
     *
     * 注意:
     * - 每天每人只能有一条日志
     * - 不能填写未来日期的日志
     * - officerId自动使用当前登录用户
     */
    router.post(
        '/',
        permissionMiddleware(['log:manage']),
        controller.createDailyLog
    );

    /**
     * 更新日志
     * PUT /api/daily-logs/:id
     * 权限: log:manage
     *
     * 注意: 只能修改自己的日志
     */
    router.put(
        '/:id',
        permissionMiddleware(['log:manage']),
        controller.updateDailyLog
    );

    /**
     * 删除日志
     * DELETE /api/daily-logs/:id
     * 权限: log:manage
     *
     * 注意: 只能删除自己的日志
     */
    router.delete(
        '/:id',
        permissionMiddleware(['log:manage']),
        controller.deleteDailyLog
    );

    return router;
};
