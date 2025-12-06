// src/modules/dicts/controller.js
const dictService = require('./service');

/**
 * GET /api/dicts/:code
 */
async function getDictByCode(req, res, next) {
    try {
        const { code } = req.params;
        const includeDisabled =
            req.query.includeDisabled === 1 ||
            req.query.includeDisabled === '1';

        const items = await dictService.getItemsByCategoryCode(
            code,
            includeDisabled
        );

        res.json({
            success: true,
            data: items,
            message: 'ok'
        });
    } catch (err) {
        next(err);
    }
}

/**
 * GET /api/dicts?codes=CASE_TYPE,KEYPOP_TYPE
 */
async function getDictsByCodes(req, res, next) {
    try {
        const { codes } = req.query;
        const includeDisabled =
            req.query.includeDisabled === 1 ||
            req.query.includeDisabled === '1';

        const codeList = typeof codes === 'string' ? codes.split(',') : [];

        const result = await dictService.getItemsByCategoryCodes(
            codeList,
            includeDisabled
        );

        res.json({
            success: true,
            data: result,
            message: 'ok'
        });
    } catch (err) {
        next(err);
    }
}

/**
 * GET /api/dicts/categories
 */
async function listCategories(req, res, next) {
    try {
        const list = await dictService.listCategories(req.query);
        res.json({
            success: true,
            data: list,
            message: 'ok'
        });
    } catch (err) {
        next(err);
    }
}

/**
 * POST /api/dicts/categories
 */
async function createCategory(req, res, next) {
    try {
        const category = await dictService.createCategory(req.body);
        res.json({
            success: true,
            data: category,
            message: '创建成功'
        });
    } catch (err) {
        next(err);
    }
}

/**
 * PUT /api/dicts/categories/:id
 */
async function updateCategory(req, res, next) {
    try {
        const id = Number(req.params.id);
        const category = await dictService.updateCategory(id, req.body);
        res.json({
            success: true,
            data: category,
            message: '更新成功'
        });
    } catch (err) {
        next(err);
    }
}

/**
 * DELETE /api/dicts/categories/:id
 */
async function deleteCategory(req, res, next) {
    try {
        const id = Number(req.params.id);
        await dictService.deleteCategory(id);
        res.json({
            success: true,
            data: null,
            message: '删除成功'
        });
    } catch (err) {
        next(err);
    }
}

/**
 * GET /api/dicts/items?categoryId=1
 */
async function listItems(req, res, next) {
    try {
        const categoryId = Number(req.query.categoryId);
        const includeDisabled =
            req.query.includeDisabled === 1 ||
            req.query.includeDisabled === '1';

        const items = await dictService.listItemsByCategoryId(
            categoryId,
            includeDisabled
        );

        res.json({
            success: true,
            data: items,
            message: 'ok'
        });
    } catch (err) {
        next(err);
    }
}

/**
 * POST /api/dicts/items
 */
async function createItem(req, res, next) {
    try {
        const item = await dictService.createItem(req.body);
        res.json({
            success: true,
            data: item,
            message: '创建成功'
        });
    } catch (err) {
        next(err);
    }
}

/**
 * PUT /api/dicts/items/:id
 */
async function updateItem(req, res, next) {
    try {
        const id = Number(req.params.id);
        const item = await dictService.updateItem(id, req.body);
        res.json({
            success: true,
            data: item,
            message: '更新成功'
        });
    } catch (err) {
        next(err);
    }
}

/**
 * DELETE /api/dicts/items/:id
 */
async function deleteItem(req, res, next) {
    try {
        const id = Number(req.params.id);
        await dictService.deleteItem(id);
        res.json({
            success: true,
            data: null,
            message: '删除成功'
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    getDictByCode,
    getDictsByCodes,
    listCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    listItems,
    createItem,
    updateItem,
    deleteItem
};
