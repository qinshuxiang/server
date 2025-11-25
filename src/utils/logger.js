// src/utils/logger.js
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

// 定义日志格式
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }), // 记录错误堆栈
    winston.format.json() // 文件中存储为 JSON 格式，方便后续分析
);

// 创建 Logger 实例
const logger = winston.createLogger({
    level: 'info', // 默认记录 info 及以上级别 (info, warn, error)
    format: logFormat,
    transports: [
        // 1. 错误日志单独存一个文件 (自动按天轮转)
        new DailyRotateFile({
            filename: path.join('logs', 'error-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            level: 'error',
            zippedArchive: true, // 归档压缩
            maxSize: '20m',      // 单个文件最大 20MB
            maxFiles: '14d'      // 保留最近 14 天的日志
        }),
        // 2. 所有级别的日志存另一个文件
        new DailyRotateFile({
            filename: path.join('logs', 'combined-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '14d'
        })
    ]
});

// 如果不是生产环境，也在控制台打印，方便调试
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ level, message, timestamp, stack }) => {
                return `${timestamp} [${level}]: ${stack || message}`;
            })
        )
    }));
}

// 导出一个流对象，供 morgan 使用
logger.stream = {
    write: (message) => {
        // 这里的 trim 是为了去掉 morgan 自动添加的换行符
        logger.info(message.trim());
    }
};

module.exports = logger;
