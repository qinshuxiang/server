// src/config/db.js (或者你的 db.js 所在路径)

const mysql = require('mysql2');
require('dotenv').config();
const logger = require('../utils/logger'); // 引入日志模块

// 慢查询阈值，单位：毫秒
const SLOW_QUERY_THRESHOLD = 500;

// 创建连接池
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// 封装 Promise 版本的 query
const db = pool.promise();

/**
 * 执行 SQL 的通用函数
 * @param {string} sql - SQL 语句
 * @param {Array} params - 参数数组
 */
async function query(sql, params) {
    // 记录开始时间
    const startTime = Date.now();

    try {
        const [results] = await db.execute(sql, params);

        // 计算执行时长
        const duration = Date.now() - startTime;

        // 检查是否为慢查询，并记录警告日志
        if (duration > SLOW_QUERY_THRESHOLD) {
            logger.warn(`[SQL] SLOW QUERY (${duration}ms) detected.`, {
                duration: duration,
                sql: sql,
                params: params
            });
        }

        return results;
    } catch (error) {
        // ❌ 以前: console.error('Database Error:', error.sqlMessage);

        // ✅ 现在: 记录数据库错误日志，包含 SQL 语句和参数
        logger.error('[Database] Query execution failed.', {
            message: error.sqlMessage,
            sql: sql,
            params: params,
            // 记录堆栈，方便定位是哪个路由调用出错
            stack: error.stack
        });

        throw error;
    }
}

module.exports = { query, pool };
