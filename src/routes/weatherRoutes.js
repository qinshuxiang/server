// src/routes/weatherRoutes.js
const express = require('express');
const logger = require('../utils/logger');
const { startScraping } = require('../services/scraper');
const weatherService = require('../services/weatherService');

const router = express.Router();

/**
 * GET /api/weather/latest - 获取最新一次抓取的小时预报数据
 */
router.get('/latest', async (req, res, next) => {
    try {
        const data = await weatherService.getLatestForecasts();
        if (data.length === 0) {
            return res.status(404).json({ message: '暂无数据，请等待定时任务执行或手动触发抓取。' });
        }
        // 从查询结果的第一条记录中获取抓取时间（因为所有记录的抓取时间都相同）
        const crawlTime = data.length > 0 ? data[0].crawl_time : null;
        res.json({
            success: true,
            crawl_time: crawlTime,
            forecasts: data
        });
    } catch (error) {
        // 传递给 Express 错误处理中间件
        next(error);
    }
});

/**
 * POST /api/weather/run - 手动触发一次抓取任务 (用于测试和管理)
 */
router.post('/run', async (req, res, next) => {
    try {
        await startScraping();
        res.status(200).json({ success: true, message: '手动抓取任务已触发并完成。' });
    } catch (error) {
        next(error);
    }
});

// 导出路由器
module.exports = router;
