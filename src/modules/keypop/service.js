const pool = require('../../config/db');
const dayjs = require('dayjs');
const { AppError } = require('../../utils/errors');

/**
 * 查询重点人口列表(支持分页和筛选)
 * @param {Object} query - 查询条件
 * @param {number} userId - 当前用户ID
 * @param {boolean} hasViewAll - 是否有查看全部权限
 * @returns {Promise<Object>}
 */
async function listKeyPopulations(query, userId, hasViewAll = false) {
    const {
        communityId,
        typeItemId,
        name,
        idCardNo,
        isKey,
        controlOfficerId,
        page = 1,
        pageSize = 20
    } = query;

    const conditions = [];
    const params = [];

    // 权限控制:非管理员只能看自己管控的
    if (!hasViewAll) {
        conditions.push('kp.control_officer_id = ?');
        params.push(userId);
    }

    // 筛选条件
    if (communityId) {
        conditions.push('kp.community_id = ?');
        params.push(communityId);
    }

    if (typeItemId) {
        conditions.push('kp.type_item_id = ?');
        params.push(typeItemId);
    }

    if (name) {
        conditions.push('kp.name LIKE ?');
        params.push(`%${name}%`);
    }

    if (idCardNo) {
        conditions.push('kp.id_card_no LIKE ?');
        params.push(`%${idCardNo}%`);
    }

    if (isKey !== undefined) {
        conditions.push('kp.is_key_population = ?');
        params.push(isKey ? 1 : 0);
    }

    if (controlOfficerId) {
        conditions.push('kp.control_officer_id = ?');
        params.push(controlOfficerId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 查询总数
    const countSql = `SELECT COUNT(*) as total FROM key_populations kp ${whereClause}`;
    const [countResult] = await pool.query(countSql, params);
    const total = countResult[0].total;

    // 分页查询
    const limit = Math.min(pageSize, 100);
    const offset = (page - 1) * limit;

    const sql = `
    SELECT 
      kp.id,
      kp.name,
      kp.gender_item_id AS genderItemId,
      g.item_name AS genderName,
      kp.id_card_no AS idCardNo,
      kp.community_id AS communityId,
      c.community_name AS communityName,
      kp.household_id AS householdId,
      kp.contact_phone AS contactPhone,
      kp.residence_address AS residenceAddress,
      kp.household_address AS householdAddress,
      kp.is_key_population AS isKeyPopulation,
      kp.type_item_id AS typeItemId,
      t.item_name AS typeName,
      kp.control_level_item_id AS controlLevelItemId,
      cl.item_name AS controlLevelName,
      kp.risk_level_item_id AS riskLevelItemId,
      rl.item_name AS riskLevelName,
      kp.control_officer_id AS controlOfficerId,
      po.name AS controlOfficerName,
      kp.control_measure AS controlMeasure,
      kp.next_visit_date AS nextVisitDate,
      kp.revisit_interval_days AS revisitIntervalDays,
      kp.latest_visit_date AS latestVisitDate,
      kp.remark,
      kp.created_at AS createdAt,
      kp.updated_at AS updatedAt
    FROM key_populations kp
    LEFT JOIN dict_items g ON kp.gender_item_id = g.id
    LEFT JOIN communities c ON kp.community_id = c.id
    LEFT JOIN dict_items t ON kp.type_item_id = t.id
    LEFT JOIN dict_items cl ON kp.control_level_item_id = cl.id
    LEFT JOIN dict_items rl ON kp.risk_level_item_id = rl.id
    LEFT JOIN police_officers po ON kp.control_officer_id = po.id
    ${whereClause}
    ORDER BY kp.is_key_population DESC, kp.next_visit_date ASC, kp.id DESC
    LIMIT ? OFFSET ?
  `;

    const [rows] = await pool.query(sql, [...params, limit, offset]);

    return {
        items: rows,
        total,
        page,
        pageSize: limit
    };
}

/**
 * 获取重点人口详情
 * @param {number} id - 重点人口ID
 * @returns {Promise<Object|null>}
 */
async function getKeyPopulationById(id) {
    const sql = `
    SELECT 
      kp.id,
      kp.name,
      kp.gender_item_id AS genderItemId,
      g.item_name AS genderName,
      kp.id_card_no AS idCardNo,
      kp.community_id AS communityId,
      c.community_name AS communityName,
      kp.household_id AS householdId,
      kp.contact_phone AS contactPhone,
      kp.residence_address AS residenceAddress,
      kp.household_address AS householdAddress,
      kp.is_key_population AS isKeyPopulation,
      kp.type_item_id AS typeItemId,
      t.item_name AS typeName,
      kp.control_level_item_id AS controlLevelItemId,
      cl.item_name AS controlLevelName,
      kp.risk_level_item_id AS riskLevelItemId,
      rl.item_name AS riskLevelName,
      kp.control_officer_id AS controlOfficerId,
      po.name AS controlOfficerName,
      kp.control_measure AS controlMeasure,
      kp.next_visit_date AS nextVisitDate,
      kp.revisit_interval_days AS revisitIntervalDays,
      kp.latest_visit_date AS latestVisitDate,
      kp.remark,
      kp.created_at AS createdAt,
      kp.updated_at AS updatedAt
    FROM key_populations kp
    LEFT JOIN dict_items g ON kp.gender_item_id = g.id
    LEFT JOIN communities c ON kp.community_id = c.id
    LEFT JOIN dict_items t ON kp.type_item_id = t.id
    LEFT JOIN dict_items cl ON kp.control_level_item_id = cl.id
    LEFT JOIN dict_items rl ON kp.risk_level_item_id = rl.id
    LEFT JOIN police_officers po ON kp.control_officer_id = po.id
    WHERE kp.id = ?
  `;

    const [rows] = await pool.query(sql, [id]);
    return rows[0] || null;
}

/**
 * 创建重点人口记录
 * @param {Object} data - 人口数据
 * @returns {Promise<number>} 记录ID
 */
async function createKeyPopulation(data) {
    const {
        name,
        genderItemId,
        idCardNo,
        communityId,
        householdId,
        contactPhone,
        residenceAddress,
        householdAddress,
        isKeyPopulation,
        typeItemId,
        controlLevelItemId,
        riskLevelItemId,
        controlOfficerId,
        controlMeasure,
        revisitIntervalDays = 30,
        remark
    } = data;

    // 业务校验:当is_key_population=1时,type和control_level必填
    if (isKeyPopulation && (!typeItemId || !controlLevelItemId)) {
        throw new AppError('VALIDATION_ERROR', '重点人口必须填写类型和管控等级');
    }

    // 检查身份证号唯一性
    if (idCardNo) {
        const [existing] = await pool.query(
            'SELECT id FROM key_populations WHERE id_card_no = ?',
            [idCardNo]
        );
        if (existing.length > 0) {
            throw new AppError('CONFLICT', '身份证号已存在');
        }
    }

    const sql = `
    INSERT INTO key_populations (
      name, gender_item_id, id_card_no, community_id, household_id,
      contact_phone, residence_address, household_address,
      is_key_population, type_item_id, control_level_item_id,
      risk_level_item_id, control_officer_id, control_measure,
      revisit_interval_days, remark
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

    const [result] = await pool.query(sql, [
        name,
        genderItemId || null,
        idCardNo || null,
        communityId || null,
        householdId || null,
        contactPhone || null,
        residenceAddress || null,
        householdAddress || null,
        isKeyPopulation ? 1 : 0,
        typeItemId || null,
        controlLevelItemId || null,
        riskLevelItemId || null,
        controlOfficerId || null,
        controlMeasure || null,
        revisitIntervalDays,
        remark || null
    ]);

    return result.insertId;
}

/**
 * 更新重点人口信息
 * @param {number} id - 记录ID
 * @param {Object} data - 更新数据
 * @returns {Promise<void>}
 */
async function updateKeyPopulation(id, data) {
    const {
        name,
        genderItemId,
        idCardNo,
        communityId,
        householdId,
        contactPhone,
        residenceAddress,
        householdAddress,
        isKeyPopulation,
        typeItemId,
        controlLevelItemId,
        riskLevelItemId,
        controlOfficerId,
        controlMeasure,
        revisitIntervalDays,
        remark
    } = data;

    // 业务校验
    if (isKeyPopulation && (!typeItemId || !controlLevelItemId)) {
        throw new AppError('VALIDATION_ERROR', '重点人口必须填写类型和管控等级');
    }

    // 检查身份证号唯一性(排除自己)
    if (idCardNo) {
        const [existing] = await pool.query(
            'SELECT id FROM key_populations WHERE id_card_no = ? AND id != ?',
            [idCardNo, id]
        );
        if (existing.length > 0) {
            throw new AppError('CONFLICT', '身份证号已存在');
        }
    }

    const sql = `
        UPDATE key_populations SET
                                   name = ?,
                                   gender_item_id = ?,
                                   id_card_no = ?,
                                   community_id = ?,
                                   household_id = ?,
                                   contact_phone = ?,
                                   residence_address = ?,
                                   household_address = ?,
                                   is_key_population = ?,
                                   type_item_id = ?,
                                   control_level_item_id = ?,
                                   risk_level_item_id = ?,
                                   control_officer_id = ?,
                                   control_measure = ?,
                                   revisit_interval_days = ?,
                                   remark = ?
        WHERE id = ?
    `;

    await pool.query(sql, [
        name,
        genderItemId || null,
        idCardNo || null,
        communityId || null,
        householdId || null,
        contactPhone || null,
        residenceAddress || null,
        householdAddress || null,
        isKeyPopulation ? 1 : 0,
        typeItemId || null,
        controlLevelItemId || null,
        riskLevelItemId || null,
        controlOfficerId || null,
        controlMeasure || null,
        revisitIntervalDays || 30,
        remark || null,
        id
    ]);
}

/**
 * 删除重点人口(级联删除回访记录)
 * @param {number} id - 记录ID
 * @returns {Promise<void>}
 */
async function deleteKeyPopulation(id) {
    // 外键ON DELETE CASCADE会自动删除回访记录
    const sql = 'DELETE FROM key_populations WHERE id = ?';
    await pool.query(sql, [id]);
}

/**
 * 获取回访记录列表
 * @param {number} populationId - 重点人口ID
 * @returns {Promise<Array>}
 */
async function listVisits(populationId) {
    const sql = `
    SELECT
      v.id,
      v.population_id AS populationId,
      v.visit_date AS visitDate,
      v.visitor_officer_id AS visitorOfficerId,
      po.name AS visitorOfficerName,
      v.visitor_name AS visitorName,
      v.location,
      v.visit_content AS visitContent,
      v.is_abnormal AS isAbnormal,
      v.created_at AS createdAt,
      v.updated_at AS updatedAt
    FROM key_population_visits v
    LEFT JOIN police_officers po ON v.visitor_officer_id = po.id
    WHERE v.population_id = ?
    ORDER BY v.visit_date DESC, v.id DESC
  `;

    const [rows] = await pool.query(sql, [populationId]);
    return rows;
}

/**
 * 创建回访记录(并更新人口表的latest_visit_date和next_visit_date)
 * @param {number} populationId - 重点人口ID
 * @param {Object} data - 回访数据
 * @param {number} officerId - 回访民警ID(当前登录用户)
 * @returns {Promise<number>}
 */
async function createVisit(populationId, data, officerId) {
    const {
        visitDate,
        visitorOfficerId,
        visitorName,
        location,
        visitContent,
        isAbnormal
    } = data;

    // 至少要有一个访客身份
    if (!visitorOfficerId && !visitorName) {
        throw new AppError('VALIDATION_ERROR', '访客身份至少填写一项');
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // 1. 插入回访记录
        const insertSql = `
      INSERT INTO key_population_visits (
        population_id, visit_date, visitor_officer_id, visitor_name,
        location, visit_content, is_abnormal
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

        const [result] = await conn.query(insertSql, [
            populationId,
            visitDate,
            visitorOfficerId || null,
            visitorName || null,
            location || null,
            visitContent || null,
            isAbnormal ? 1 : 0
        ]);

        // 2. 更新重点人口的最新回访日期和下次回访日期
        const [person] = await conn.query(
            'SELECT revisit_interval_days FROM key_populations WHERE id = ?',
            [populationId]
        );

        if (person.length === 0) {
            throw new AppError('NOT_FOUND', '重点人口不存在');
        }

        const intervalDays = person[0].revisit_interval_days || 30;
        const nextVisitDate = dayjs(visitDate).add(intervalDays, 'day').format('YYYY-MM-DD');

        const updateSql = `
      UPDATE key_populations 
      SET latest_visit_date = ?, next_visit_date = ?
      WHERE id = ?
    `;

        await conn.query(updateSql, [visitDate, nextVisitDate, populationId]);

        await conn.commit();
        return result.insertId;
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

/**
 * 更新回访记录
 * @param {number} visitId - 回访记录ID
 * @param {Object} data - 更新数据
 * @returns {Promise<void>}
 */
async function updateVisit(visitId, data) {
    const {
        visitDate,
        visitorOfficerId,
        visitorName,
        location,
        visitContent,
        isAbnormal
    } = data;

    if (!visitorOfficerId && !visitorName) {
        throw new AppError('VALIDATION_ERROR', '访客身份至少填写一项');
    }

    const sql = `
    UPDATE key_population_visits SET
      visit_date = ?,
      visitor_officer_id = ?,
      visitor_name = ?,
      location = ?,
      visit_content = ?,
      is_abnormal = ?
    WHERE id = ?
  `;

    await pool.query(sql, [
        visitDate,
        visitorOfficerId || null,
        visitorName || null,
        location || null,
        visitContent || null,
        isAbnormal ? 1 : 0,
        visitId
    ]);
}

/**
 * 删除回访记录
 * @param {number} visitId - 回访记录ID
 * @returns {Promise<void>}
 */
async function deleteVisit(visitId) {
    const sql = 'DELETE FROM key_population_visits WHERE id = ?';
    await pool.query(sql, [visitId]);
}

/**
 * 获取单条回访记录详情
 * @param {number} visitId - 回访记录ID
 * @returns {Promise<Object|null>}
 */
async function getVisitById(visitId) {
    const sql = `
    SELECT
      v.id,
      v.population_id AS populationId,
      v.visit_date AS visitDate,
      v.visitor_officer_id AS visitorOfficerId,
      po.name AS visitorOfficerName,
      v.visitor_name AS visitorName,
      v.location,
      v.visit_content AS visitContent,
      v.is_abnormal AS isAbnormal,
      v.created_at AS createdAt,
      v.updated_at AS updatedAt
    FROM key_population_visits v
    LEFT JOIN police_officers po ON v.visitor_officer_id = po.id
    WHERE v.id = ?
  `;

    const [rows] = await pool.query(sql, [visitId]);
    return rows[0] || null;
}

module.exports = {
    listKeyPopulations,
    getKeyPopulationById,
    createKeyPopulation,
    updateKeyPopulation,
    deleteKeyPopulation,
    listVisits,
    createVisit,
    updateVisit,
    deleteVisit,
    getVisitById
};
