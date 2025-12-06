// src/modules/officers/controller.js
const officerService = require('./service');

/**
 * GET /api/officers
 */
async function listOfficers(req, res, next) {
    try {
        const result = await officerService.listOfficers(req.query);
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
 * POST /api/officers
 */
async function createOfficer(req, res, next) {
    try {
        const operatorId = req.user && req.user.id;
        const officer = await officerService.createOfficer(
            req.body,
            operatorId
        );
        res.json({
            success: true,
            data: officer,
            message: '创建成功'
        });
    } catch (err) {
        next(err);
    }
}

/**
 * PUT /api/officers/:id
 */
async function updateOfficer(req, res, next) {
    try {
        const id = Number(req.params.id);
        const operatorId = req.user && req.user.id;
        const officer = await officerService.updateOfficer(
            id,
            req.body,
            operatorId
        );
        res.json({
            success: true,
            data: officer,
            message: '更新成功'
        });
    } catch (err) {
        next(err);
    }
}

/**
 * DELETE /api/officers/:id
 */
async function deleteOfficer(req, res, next) {
    try {
        const id = Number(req.params.id);
        const operatorId = req.user && req.user.id;
        await officerService.deleteOfficer(id, operatorId);
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
    listOfficers,
    createOfficer,
    updateOfficer,
    deleteOfficer
};
