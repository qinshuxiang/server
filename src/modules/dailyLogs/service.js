const pool = require('../../config/db');
const dayjs = require('dayjs');
const { AppError } = require('../../utils/errors');

/**
 * 查询日志列表
 * @param {Object} query - 查询条件
 * @returns {Promise<Array>}
 */
async function listDailyLogs(query) {
    const {
        officerId,
        dateFrom,
        dateTo,
        isOnDuty
    } = query;

    const conditions = [];
    const params = [];

    if (officerId) {
        conditions.push('dl.officer_id = ?');
        params.push(officerId);
    }

    if (dateFrom) {
        conditions.push('dl.log_date >= ?');
        params.push(dateFrom);
    }

    if (dateTo) {
        conditions.push('dl.log_date <= ?');
        params.push(dateTo);
    }

    if (isOnDuty !== undefined) {
        conditions.push('dl.is_on_duty = ?');
        params.push(isOnDuty ? 1 : 0);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
    SELECT 
      dl.id,
      dl.officer_id AS officerId,
      po.name AS officerName,
      po.badge_no AS badgeNo,
      dl.log_date AS logDate,
      dl.is_on_duty AS isOnDuty,
      dl.alarm_count AS alarmCount,
      dl.admin_case_count AS adminCaseCount,
      dl.criminal_case_count AS criminalCaseCount,
      dl.content,
      dl.created_at AS createdAt,
      dl.updated_at AS updatedAt
    FROM daily_logs dl
    LEFT JOIN police_officers po ON dl.officer_id = po.id
    ${whereClause}
    ORDER BY dl.log_date DESC, dl.id DESC
  `;

    const [rows] = await pool.query(sql, params);
    return rows;
}

/**
 * 获取单条日志详情
 * @param {number} id - 日志ID
 * @returns {Promise<Object|null>}
 */
async function getDailyLogById(id) {
    const sql = `
    SELECT 
      dl.id,
      dl.officer_id AS officerId,
      po.name AS officerName,
      po.badge_no AS badgeNo,
      dl.log_date AS logDate,
      dl.is_on_duty AS isOnDuty,
      dl.alarm_count AS alarmCount,
      dl.admin_case_count AS adminCaseCount,
      dl.criminal_case_count AS criminalCaseCount,
      dl.content,
      dl.created_at AS createdAt,
      dl.updated_at AS updatedAt
    FROM daily_logs dl
    LEFT JOIN police_officers po ON dl.officer_id = po.id
    WHERE dl.id = ?
  `;

    const [rows] = await pool.query(sql, [id]);
    return rows[0] || null;
}

/**
 * 检查某民警某天是否已有日志
 * @param {number} officerId - 民警ID
 * @param {string} logDate - 日志日期(YYYY-MM-DD)
 * @returns {Promise<Object|null>}
 */
async function getDailyLogByOfficerAndDate(officerId, logDate) {
    const sql = `
    SELECT 
      dl.id,
      dl.officer_id AS officerId,
      po.name AS officerName,
      dl.log_date AS logDate,
      dl.is_on_duty AS isOnDuty,
      dl.alarm_count AS alarmCount,
      dl.admin_case_count AS adminCaseCount,
      dl.criminal_case_count AS criminalCaseCount,
      dl.content,
      dl.created_at AS createdAt,
      dl.updated_at AS updatedAt
    FROM daily_logs dl
    LEFT JOIN police_officers po ON dl.officer_id = po.id
    WHERE dl.officer_id = ? AND dl.log_date = ?
  `;

    const [rows] = await pool.query(sql, [officerId, logDate]);
    return rows[0] || null;
}

/**
 * 检查今天是否已填写日志
 * @param {number} officerId - 民警ID
 * @returns {Promise<boolean>}
 */
async function hasTodayLog(officerId) {
    const sql = `
    SELECT COUNT(*) as count 
    FROM daily_logs 
    WHERE officer_id = ? AND log_date = CURDATE()
  `;

    const [rows] = await pool.query(sql, [officerId]);
    return rows[0].count > 0;
}

/**
 * 创建日志
 * @param {Object} data - 日志数据
 * @param {number} officerId - 民警ID(当前登录用户)
 * @returns {Promise<number>} 日志ID
 */
async function createDailyLog(data, officerId) {
    const {
        logDate,
        isOnDuty = false,
        alarmCount = 0,
        adminCaseCount = 0,
        criminalCaseCount = 0,
        content
    } = data;

    // 检查是否已存在该日期的日志
    const existing = await getDailyLogByOfficerAndDate(officerId, logDate);
    if (existing) {
        throw new AppError('CONFLICT', '该日期已存在日志记录,请修改原记录');
    }

    const sql = `
    INSERT INTO daily_logs (
      officer_id, log_date, is_on_duty, 
      alarm_count, admin_case_count, criminal_case_count, 
      content
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

    const [result] = await pool.query(sql, [
        officerId,
        logDate,
        isOnDuty ? 1 : 0,
        alarmCount,
        adminCaseCount,
        criminalCaseCount,
        content || null
    ]);

    return result.insertId;
}

/**
 * 更新日志
 * @param {number} id - 日志ID
 * @param {Object} data - 更新数据
 * @param {number} officerId - 当前登录用户ID
 * @returns {Promise<void>}
 */
async function updateDailyLog(id, data, officerId) {
    // 检查日志是否存在
    const existing = await getDailyLogById(id);
    if (!existing) {
        throw new AppError('NOT_FOUND', '日志不存在');
    }

    // 权限检查:只能修改自己的日志
    if (existing.officerId !== officerId) {
        throw new AppError('FORBIDDEN', '只能修改自己的日志');
    }

    const {
        logDate,
        isOnDuty,
        alarmCount,
        adminCaseCount,
        criminalCaseCount,
        content
    } = data;

    // 如果修改了日期,需要检查新日期是否已有日志
    if (logDate && logDate !== existing.logDate) {
        const conflict = await getDailyLogByOfficerAndDate(officerId, logDate);
        if (conflict && conflict.id !== id) {
            throw new AppError('CONFLICT', '该日期已存在其他日志记录');
        }
    }

    const sql = `
    UPDATE daily_logs SET
      log_date = ?,
      is_on_duty = ?,
      alarm_count = ?,
      admin_case_count = ?,
      criminal_case_count = ?,
      content = ?
    WHERE id = ?
  `;

    await pool.query(sql, [
        logDate || existing.logDate,
        isOnDuty !== undefined ? (isOnDuty ? 1 : 0) : existing.isOnDuty,
        alarmCount !== undefined ? alarmCount : existing.alarmCount,
        adminCaseCount !== undefined ? adminCaseCount : existing.adminCaseCount,
        criminalCaseCount !== undefined ? criminalCaseCount : existing.criminalCaseCount,
        content !== undefined ? content : existing.content,
        id
    ]);
}

/**
 * 删除日志
 * @param {number} id - 日志ID
 * @param {number} officerId - 当前登录用户ID
 * @returns {Promise<void>}
 */
async function deleteDailyLog(id, officerId) {
    // 检查日志是否存在
    const existing = await getDailyLogById(id);
    if (!existing) {
        throw new AppError('NOT_FOUND', '日志不存在');
    }

    // 权限检查:只能删除自己的日志
    if (existing.officerId !== officerId) {
        throw new AppError('FORBIDDEN', '只能删除自己的日志');
    }

    const sql = 'DELETE FROM daily_logs WHERE id = ?';
    await pool.query(sql, [id]);
}

/**
 * 获取民警的日志统计
 * @param {number} officerId - 民警ID
 * @param {string} dateFrom - 开始日期
 * @param {string} dateTo - 结束日期
 * @returns {Promise<Object>}
 */
async function getLogStatistics(officerId, dateFrom, dateTo) {
    const sql = `
    SELECT 
      COUNT(*) as totalLogs,
      SUM(is_on_duty) as dutyDays,
      SUM(alarm_count) as totalAlarms,
      SUM(admin_case_count) as totalAdminCases,
      SUM(criminal_case_count) as totalCriminalCases
    FROM daily_logs
    WHERE officer_id = ?
      AND log_date >= ?
      AND log_date <= ?
  `;

    const [rows] = await pool.query(sql, [officerId, dateFrom, dateTo]);
    return rows[0] || {
        totalLogs: 0,
        dutyDays: 0,
        totalAlarms: 0,
        totalAdminCases: 0,
        totalCriminalCases: 0
    };
}

/**
 * 获取最近N天未填写日志的日期列表
 * @param {number} officerId - 民警ID
 * @param {number} days - 天数(默认7天)
 * @returns {Promise<Array>} 未填写日志的日期数组
 */
async function getMissingLogDates(officerId, days = 7) {
    // 生成最近N天的日期列表
    const dates = [];
    for (let i = 0; i < days; i++) {
        dates.push(dayjs().subtract(i, 'day').format('YYYY-MM-DD'));
    }

    // 查询已有日志的日期
    const sql = `
    SELECT log_date 
    FROM daily_logs 
    WHERE officer_id = ? 
      AND log_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
  `;

    const [rows] = await pool.query(sql, [officerId, days]);
    const existingDates = rows.map(row => row.log_date);

    // 返回缺失的日期
    return dates.filter(date => !existingDates.includes(date));
}

module.exports = {
    listDailyLogs,
    getDailyLogById,
    getDailyLogByOfficerAndDate,
    hasTodayLog,
    createDailyLog,
    updateDailyLog,
    deleteDailyLog,
    getLogStatistics,
    getMissingLogDates
};
