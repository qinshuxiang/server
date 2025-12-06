'use strict';

const dashboardService = require('./service');

async function getTodayOverview(req, res, next) {
    try {
        const data = await dashboardService.getTodayOverview(req.user);

        res.json({
            success: true,
            data,
            message: 'ok',
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    getTodayOverview,
};
