'use strict';

const express = require('express');
const authMiddleware = require('../../middleware/auth');
const requirePermission = require('../../middleware/permission');
const controller = require('./controller');

function createNineSmallRouter() {
    const router = express.Router();

    // 所有九小相关接口都需要登录
    router.use(authMiddleware);

    // 场所列表 / 详情 / 维护（nine:manage）
    router.get(
        '/places',
        requirePermission('nine:manage'),
        controller.listPlaces
    );

    router.get(
        '/places/:id',
        requirePermission('nine:manage'),
        controller.getPlaceDetail
    );

    router.post(
        '/places',
        requirePermission('nine:manage'),
        controller.createPlace
    );

    router.put(
        '/places/:id',
        requirePermission('nine:manage'),
        controller.updatePlace
    );

    // 指定场所的巡查记录列表 / 新增（nine:inspect）
    router.get(
        '/places/:id/inspections',
        requirePermission('nine:inspect'),
        controller.listInspections
    );

    router.post(
        '/places/:id/inspections',
        requirePermission('nine:inspect'),
        controller.createInspection
    );

    // 单条巡查记录修改（nine:inspect）
    router.put(
        '/inspections/:inspectionId',
        requirePermission('nine:inspect'),
        controller.updateInspection
    );

    return router;
}

module.exports = createNineSmallRouter;
