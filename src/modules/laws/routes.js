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
     * 辅助接口(查询选项)
     */

    /**
     * 获取法规名称列表(去重)
     * GET /api/laws/law-names
     *
     * 用于前端下拉选择框
     */
    router.get('/law-names', controller.getLawNames);

    /**
     * 获取法规类别列表(去重)
     * GET /api/laws/categories
     *
     * 用于前端类别筛选
     */
    router.get('/categories', controller.getLawCategories);

    /**
     * 全文搜索
     * GET /api/laws/search?keyword=xxx&limit=20
     *
     * 使用MySQL FULLTEXT索引进行全文搜索
     * 返回按相关度排序的结果
     */
    router.get('/search', controller.fullTextSearch);

    /**
     * 批量导入法律条文
     * POST /api/laws/batch-import
     * 权限: law:manage
     *
     * 请求体:
     * {
     *   "articles": [
     *     {
     *       "lawName": "中华人民共和国刑法",
     *       "lawCategory": "刑事法律",
     *       "articleNo": "第234条",
     *       "content": "...",
     *       ...
     *     }
     *   ]
     * }
     *
     * 返回导入统计结果
     */
    router.post(
        '/batch-import',
        permissionMiddleware(['law:manage']),
        controller.batchImport
    );

    /**
     * CRUD接口
     */

    /**
     * 查询法律条文列表
     * GET /api/laws?keyword=xxx&lawCategory=xxx&page=1&pageSize=20
     *
     * 查询参数:
     * - keyword: 关键字(搜索法规名称和内容)
     * - lawName: 法规名称(精确匹配)
     * - lawCategory: 法规类别
     * - isValid: 是否有效(0/1)
     * - publishAgency: 发布机关
     * - page: 页码
     * - pageSize: 每页条数
     */
    router.get('/', controller.listLawArticles);

    /**
     * 获取法律条文详情
     * GET /api/laws/:id
     */
    router.get('/:id', controller.getLawArticle);

    /**
     * 创建法律条文
     * POST /api/laws
     * 权限: law:manage
     *
     * 请求体:
     * {
     *   "lawName": "中华人民共和国刑法",
     *   "lawCategory": "刑事法律",
     *   "publishAgency": "全国人民代表大会",
     *   "effectiveDate": "1997-10-01",
     *   "expiredDate": null,
     *   "isValid": true,
     *   "articleNo": "第234条",
     *   "content": "故意伤害他人身体的，处三年以下有期徒刑..."
     * }
     */
    router.post(
        '/',
        permissionMiddleware(['law:manage']),
        controller.createLawArticle
    );

    /**
     * 更新法律条文
     * PUT /api/laws/:id
     * 权限: law:manage
     */
    router.put(
        '/:id',
        permissionMiddleware(['law:manage']),
        controller.updateLawArticle
    );

    /**
     * 标记法规为失效
     * PUT /api/laws/:id/invalidate
     * 权限: law:manage
     *
     * 请求体:
     * {
     *   "expiredDate": "2025-12-31"
     * }
     *
     * 将is_valid设为0,并设置失效日期
     */
    router.put(
        '/:id/invalidate',
        permissionMiddleware(['law:manage']),
        controller.markAsInvalid
    );

    /**
     * 删除法律条文
     * DELETE /api/laws/:id
     * 权限: law:manage
     *
     * 注意: 物理删除,请谨慎操作
     */
    router.delete(
        '/:id',
        permissionMiddleware(['law:manage']),
        controller.deleteLawArticle
    );

    return router;
};
