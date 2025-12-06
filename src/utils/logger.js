// src/utils/logger.js
const { createLogger, format, transports } = require('winston');

const level = process.env.LOG_LEVEL || 'info';
const isProduction = process.env.NODE_ENV === 'production';

const consoleFormat = isProduction
    ? format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.errors({ stack: true }),
        format.splat(),
        format.json()
    )
    : format.combine(
        format.colorize(),
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.errors({ stack: true }),
        format.splat(),
        format.printf((info) => {
            const { timestamp, level, message, ...meta } = info;
            const metaStr =
                Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
            return `[${timestamp}] ${level}: ${message}${metaStr}`;
        })
    );

const logger = createLogger({
    level,
    format: consoleFormat,
    defaultMeta: { service: 'police-system-api' },
    transports: [new transports.Console()]
});

// 方便与 morgan 等集成
logger.stream = {
    write: (message) => {
        logger.info(message.trim());
    }
};

module.exports = logger;
