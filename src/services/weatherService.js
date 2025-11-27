// src/services/weatherService.js
const { query } = require('../config/db');
const logger = require('../utils/logger');

/**
 * 清洗数据单位并转换为数字
 * @param {string} value
 * @returns {number|null}
 */
function cleanAndConvertToNumber(value) {
    if (typeof value !== 'string') return null;

    const cleaned = value
        .replace(/[℃m/s%hPa]/g, '')
        .trim();

    const numberValue = parseFloat(cleaned);
    return isNaN(numberValue) ? null : numberValue;
}

function formatDateToLocalString(date) {
    const pad = (n) => String(n).padStart(2, '0');
    const y = date.getFullYear();
    const m = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    const hh = pad(date.getHours());
    const mm = pad(date.getMinutes());
    const ss = pad(date.getSeconds());
    return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

/**
 * 将结构化的天气数据批量插入数据库
 * @param {Date} crawlTime 抓取时间
 * @param {Array<Object>} data 结构化后的天气数据数组
 */
async function insertForecasts(crawlTime, data) {
    if (!data || data.length === 0) {
        logger.info('[WeatherService] 无数据可插入。');
        return;
    }

    const crawlTimeString = formatDateToLocalString(crawlTime); // ✅ 改这里
    logger.info(`[WeatherService] 准备插入 ${data.length} 条数据，抓取时间: ${crawlTimeString}`);

    const sql = `
        INSERT INTO weather_forecasts (
            crawl_time, data_time, temperature, precipitation, wind_speed, 
            wind_direction, pressure, humidity, cloud_cover, weather_icon
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
            temperature=VALUES(temperature), 
            precipitation=VALUES(precipitation), 
            wind_speed=VALUES(wind_speed), 
            wind_direction=VALUES(wind_direction), 
            pressure=VALUES(pressure), 
            humidity=VALUES(humidity), 
            cloud_cover=VALUES(cloud_cover), 
            weather_icon=VALUES(weather_icon);
    `;

    try {
        for (const item of data) {
            const values = [
                crawlTimeString,
                item.data_time,
                cleanAndConvertToNumber(item.temperature),
                item.precipitation, // 保持原始文本，例如“无降水”
                cleanAndConvertToNumber(item.wind_speed),
                item.wind_direction,
                cleanAndConvertToNumber(item.pressure),
                cleanAndConvertToNumber(item.humidity),
                cleanAndConvertToNumber(item.cloud_cover),
                item.weather_icon
            ];

            await query(sql, values);
        }

        logger.info(`[WeatherService] 成功插入/更新 ${data.length} 条数据。`);
        return { success: true, count: data.length };

    } catch (error) {
        logger.error('[WeatherService] 数据库插入失败:', {
            message: error.message,
            stack: error.stack
        });
        throw new Error('Database insertion failed.');
    }
}

/**
 * 获取最新一次抓取的所有预报数据
 */
async function getLatestForecasts() {
    const sql = `
        SELECT
            id,
            crawl_time,
            data_time,
            temperature,
            precipitation,
            wind_speed,
            wind_direction,
            pressure,
            humidity,
            cloud_cover,
            CONCAT(?, weather_icon) AS weather_icon
        FROM weather_forecasts
        WHERE crawl_time = (SELECT MAX(crawl_time) FROM weather_forecasts)
        ORDER BY data_time ASC;
    `;

    const data = await query(sql, [process.env.WEATHER_BASE_URL]);
    return data;
}

module.exports = {
    insertForecasts,
    getLatestForecasts,
};
