// src/config/weatherConfig.js
require('dotenv').config();

module.exports = {
    target: {
        url: process.env.WEATHER_URL,
        selector: process.env.WEATHER_SELECTOR,
        baseUrl: process.env.WEATHER_BASE_URL,
    },
    // 表格中数据项的顺序和对应的数据库字段名
    FIELD_MAP: [
        'data_time',        // 第 0 行是时间，特殊处理
        'weather_icon',     // 第 1 行是天气
        'temperature',      // 第 2 行是气温
        'precipitation',    // 第 3 行是降水
        'wind_speed',       // 第 4 行是风速
        'wind_direction',   // 第 5 行是风向
        'pressure',         // 第 6 行是气压
        'humidity',         // 第 7 行是湿度
        'cloud_cover'       // 第 8 行是云量
    ]
};
