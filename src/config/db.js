// src/config/db.js
const mysql = require('mysql2/promise');
const logger = require('../utils/logger');

const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '12345678',
    database: process.env.DB_NAME || 'police_system_db',
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_POOL_LIMIT || 10),
    queueLimit: 0,
    dateStrings: true, // 所有 DATE/DATETIME 以字符串返回，避免时区转换
    timezone: '+08:00' // 与 MySQL 统一为东八区本地时间
});

/**
 * 统一事务封装：
 * withTransaction(async (conn) => { ... })
 */
async function withTransaction(fn) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const result = await fn(connection);
        await connection.commit();
        return result;
    } catch (err) {
        try {
            await connection.rollback();
        } catch (rollbackErr) {
            logger.error('Transaction rollback failed', { rollbackErr });
        }
        throw err;
    } finally {
        connection.release();
    }
}

pool.getConnection()
    .then((conn) => {
        logger.info('MySQL pool created successfully');
        conn.release();
    })
    .catch((err) => {
        logger.error('MySQL pool initialization failed', { err });
    });

module.exports = {
    pool,
    withTransaction
};
