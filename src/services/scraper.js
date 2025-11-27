// src/services/scraper.js
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const logger = require('../utils/logger');
const weatherConfig = require('../config/weatherConfig');
const weatherService = require('./weatherService');

async function startScraping() {
    const crawlTime = new Date();
    logger.info(`[SCRAPER] 任务开始: ${crawlTime.toLocaleString()}`);

    const { url, selector } = weatherConfig.target;

    logger.info(`[SCRAPER] 使用的 URL: ${url}`);
    logger.info(`[SCRAPER] 使用的 Selector: "${selector}"`);

    if (!url) {
        logger.error('[SCRAPER] WEATHER_URL 未配置或为空');
        throw new Error('WEATHER_URL is not set');
    }

    if (!selector) {
        logger.error('[SCRAPER] WEATHER_SELECTOR 未配置或为空');
        throw new Error('WEATHER_SELECTOR is not set');
    }

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.setDefaultNavigationTimeout(60000);

        logger.info(`[SCRAPER] 访问页面: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2' });

        await page.waitForSelector(selector, { timeout: 10000 });

        const tableHtml = await page.$eval(selector, el => el.outerHTML);

        const structuredData = parseTable(tableHtml);

        logger.info(`[SCRAPER] 成功解析 ${structuredData.length} 个时间点的预报数据。`);

        await weatherService.insertForecasts(crawlTime, structuredData);
    } catch (error) {
        logger.error('[SCRAPER ERROR] 抓取、解析或存储过程中发生错误:', {
            message: error.message,
            stack: error.stack
        });
    } finally {
        if (browser) {
            await browser.close();
        }
        logger.info('[SCRAPER] 任务结束。');
    }
}

// 下面是 parseTable / module.exports 保持你原来的就行
/**
 * 使用 Cheerio 解析 HTML 表格
 * @param {string} tableHtml - 完整的小时预报 HTML
 * @returns {Array<Object>} 结构化数据
 */
function parseTable(tableHtml) {
    const $ = cheerio.load(tableHtml);
    const rows = $('tr'); // 不限定 tbody，兼容性更好
    const structuredData = [];
    const FIELD_MAP = weatherConfig.FIELD_MAP;

    if (rows.length === 0) {
        return structuredData;
    }

    // 第一行：时间行，第一列是“时间”文字，后面每一列是一个时间点
    const numColumns = $(rows[0]).find('td').length - 1;

    for (let col = 1; col <= numColumns; col++) {
        const timePointData = {};

        rows.each((rowIndex, element) => {
            const fieldName = FIELD_MAP[rowIndex];
            if (!fieldName) return;

            const cell = $(element).find('td').eq(col);
            if (!cell || cell.length === 0) return;

            let value;
            if (fieldName === 'weather_icon') {
                value = cell.find('img').attr('src') || null;
            } else {
                value = cell.text().trim();
            }

            if (value !== undefined && value !== null && value !== '') {
                timePointData[fieldName] = value;
            }
        });

        if (timePointData.data_time) {
            structuredData.push(timePointData);
        }
    }

    return structuredData;
}

module.exports = {
    startScraping
};
