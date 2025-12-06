'use strict';

const { pool } = require('../../config/db');
const logger = require('../../utils/logger');
const {
    validationError,
    notFound,
    conflict,
    dbError,
} = require('../../utils/errors');

/**
 * 将九小场所表记录映射为接口返回结构（camelCase）
 */
function mapPlaceRow(row) {
    if (!row) return null;
    return {
        id: row.id,
        name: row.name,
        address: row.address,
        communityId: row.communityId,
        communityName: row.communityName || null,
        type: row.type || null,
        typeItemId: row.typeItemId || null,
        typeName: row.typeName || null,
        gridName: row.gridName || null,
        principalName: row.principalName || null,
        contactPhone: row.contactPhone || null,
        remark: row.remark || null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

/**
 * 将巡查记录表记录映射为接口返回结构（camelCase）
 */
function mapInspectionRow(row) {
    if (!row) return null;
    return {
        id: row.id,
        placeId: row.placeId,
        inspectDate: row.inspectDate,
        inspectorOfficerId: row.inspectorOfficerId || null,
        inspectorName: row.inspectorName || null,
        description: row.description || null,
        hasHiddenDanger:
            row.hasHiddenDanger === 1 ||
            row.hasHiddenDanger === true ||
            row.hasHiddenDanger === '1',
        rectificationAdvice: row.rectificationAdvice || null,
        rectificationStatusId: row.rectificationStatusId || null,
        rectificationStatusName: row.rectificationStatusName || null,
        rectifiedDate: row.rectifiedDate || null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

function handlePlaceDbError(err) {
    logger.error('DB error in nineSmall.place operation', { err });

    if (err && err.code === 'ER_DUP_ENTRY') {
        // 若对名称或 (community_id + name) 有唯一约束
        throw conflict('九小场所已存在或名称重复');
    }

    if (
        err &&
        (err.code === 'ER_NO_REFERENCED_ROW_2' ||
            err.code === 'ER_ROW_IS_REFERENCED_2')
    ) {
        throw validationError('关联社区或字典项不存在或已被删除');
    }

    throw dbError('九小场所数据库操作失败');
}

function handleInspectionDbError(err) {
    logger.error('DB error in nineSmall.inspection operation', { err });

    // MySQL 8.0 CHECK 约束错误
    if (err && err.code === 'ER_CHECK_CONSTRAINT_VIOLATED') {
        const msg = err.message || '';
        if (msg.includes('rectified_date') && msg.includes('inspect_date')) {
            throw validationError('整改完成时间不能早于巡查时间');
        }
        if (msg.includes('inspector_not_empty') || msg.includes('inspector')) {
            throw validationError('巡查民警或巡查人员姓名至少填写一项');
        }
        throw validationError('巡查记录数据不符合约束，请检查填写内容');
    }

    if (
        err &&
        (err.code === 'ER_NO_REFERENCED_ROW_2' ||
            err.code === 'ER_ROW_IS_REFERENCED_2')
    ) {
        throw validationError('关联数据不存在或已被删除');
    }

    throw dbError('九小场所巡查记录数据库操作失败');
}

/**
 * 场所列表
 */
async function listPlaces(params) {
    const {
        communityId,
        placeName,
        typeItemId,
        page = 1,
        pageSize = 20,
    } = params || {};

    const where = [];
    const sqlParams = [];

    if (communityId) {
        where.push('p.community_id = ?');
        sqlParams.push(communityId);
    }

    if (placeName) {
        where.push('p.name LIKE ?');
        sqlParams.push(`%${placeName}%`);
    }

    if (typeItemId) {
        where.push('p.type_item_id = ?');
        sqlParams.push(typeItemId);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const offset = (page - 1) * pageSize;

    const countSql = `
    SELECT COUNT(*) AS total
    FROM nine_small_places p
    ${whereSql}
  `;

    const listSql = `
    SELECT
      p.id AS id,
      p.name AS name,
      p.address AS address,
      p.community_id AS communityId,
      c.community_name AS communityName,
      p.type AS type,
      p.type_item_id AS typeItemId,
      dt.item_name AS typeName,
      p.grid_name AS gridName,
      p.principal_name AS principalName,
      p.contact_phone AS contactPhone,
      p.remark AS remark,
      p.created_at AS createdAt,
      p.updated_at AS updatedAt
    FROM nine_small_places p
    LEFT JOIN communities c ON p.community_id = c.id
    LEFT JOIN dict_items dt ON p.type_item_id = dt.id
    ${whereSql}
    ORDER BY p.id DESC
    LIMIT ? OFFSET ?
  `;

    const [countRows] = await pool.query(countSql, sqlParams);
    const total = countRows[0] ? Number(countRows[0].total) : 0;

    const [rows] = await pool.query(listSql, [...sqlParams, pageSize, offset]);

    return {
        items: rows.map(mapPlaceRow),
        total,
        page,
        pageSize,
    };
}

/**
 * 获取单个场所详情
 */
async function getPlaceById(id) {
    const sql = `
    SELECT
      p.id AS id,
      p.name AS name,
      p.address AS address,
      p.community_id AS communityId,
      c.community_name AS communityName,
      p.type AS type,
      p.type_item_id AS typeItemId,
      dt.item_name AS typeName,
      p.grid_name AS gridName,
      p.principal_name AS principalName,
      p.contact_phone AS contactPhone,
      p.remark AS remark,
      p.created_at AS createdAt,
      p.updated_at AS updatedAt
    FROM nine_small_places p
    LEFT JOIN communities c ON p.community_id = c.id
    LEFT JOIN dict_items dt ON p.type_item_id = dt.id
    WHERE p.id = ?
    LIMIT 1
  `;

    const [rows] = await pool.query(sql, [id]);
    if (!rows.length) {
        return null;
    }
    return mapPlaceRow(rows[0]);
}

/**
 * 创建九小场所
 */
async function createPlace(data) {
    const sql = `
    INSERT INTO nine_small_places (
      name,
      address,
      community_id,
      type,
      type_item_id,
      grid_name,
      principal_name,
      contact_phone,
      remark
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

    const params = [
        data.name,
        data.address,
        data.communityId ?? null,
        data.type ?? null,
        data.typeItemId ?? null,
        data.gridName ?? null,
        data.principalName ?? null,
        data.contactPhone ?? null,
        data.remark ?? null,
    ];

    try {
        const [result] = await pool.query(sql, params);
        return await getPlaceById(result.insertId);
    } catch (err) {
        handlePlaceDbError(err);
    }
}

/**
 * 更新九小场所（局部更新）
 */
async function updatePlace(id, data) {
    const [rows] = await pool.query(
        'SELECT * FROM nine_small_places WHERE id = ?',
        [id]
    );
    if (!rows.length) {
        throw notFound('九小场所不存在');
    }

    const existing = rows[0];

    const merged = {
        name: data.name ?? existing.name,
        address: data.address ?? existing.address,
        communityId:
            data.communityId !== undefined ? data.communityId : existing.community_id,
        type: data.type ?? existing.type,
        typeItemId:
            data.typeItemId !== undefined
                ? data.typeItemId
                : existing.type_item_id,
        gridName: data.gridName ?? existing.grid_name,
        principalName: data.principalName ?? existing.principal_name,
        contactPhone: data.contactPhone ?? existing.contact_phone,
        remark: data.remark ?? existing.remark,
    };

    const sql = `
    UPDATE nine_small_places
    SET
      name = ?,
      address = ?,
      community_id = ?,
      type = ?,
      type_item_id = ?,
      grid_name = ?,
      principal_name = ?,
      contact_phone = ?,
      remark = ?
    WHERE id = ?
  `;

    const params = [
        merged.name,
        merged.address,
        merged.communityId ?? null,
        merged.type ?? null,
        merged.typeItemId ?? null,
        merged.gridName ?? null,
        merged.principalName ?? null,
        merged.contactPhone ?? null,
        merged.remark ?? null,
        id,
    ];

    try {
        await pool.query(sql, params);
        return await getPlaceById(id);
    } catch (err) {
        handlePlaceDbError(err);
    }
}

/**
 * 获取单条巡查记录
 */
async function getInspectionById(id) {
    const sql = `
    SELECT
      i.id AS id,
      i.place_id AS placeId,
      i.inspect_date AS inspectDate,
      i.inspector_officer_id AS inspectorOfficerId,
      i.inspector_name AS inspectorName,
      i.description AS description,
      i.has_hidden_danger AS hasHiddenDanger,
      i.rectification_advice AS rectificationAdvice,
      i.rectification_status_id AS rectificationStatusId,
      ds.item_name AS rectificationStatusName,
      i.rectified_date AS rectifiedDate,
      i.created_at AS createdAt,
      i.updated_at AS updatedAt
    FROM nine_small_inspections i
    LEFT JOIN dict_items ds ON i.rectification_status_id = ds.id
    WHERE i.id = ?
    LIMIT 1
  `;

    const [rows] = await pool.query(sql, [id]);
    if (!rows.length) {
        return null;
    }
    return mapInspectionRow(rows[0]);
}

/**
 * 指定场所的巡查记录列表（分页）
 */
async function listInspections(placeId, params = {}) {
    const { page = 1, pageSize = 20 } = params;

    // 先确保场所存在
    const place = await getPlaceById(placeId);
    if (!place) {
        throw notFound('九小场所不存在');
    }

    const offset = (page - 1) * pageSize;

    const countSql = `
    SELECT COUNT(*) AS total
    FROM nine_small_inspections
    WHERE place_id = ?
  `;
    const [countRows] = await pool.query(countSql, [placeId]);
    const total = countRows[0] ? Number(countRows[0].total) : 0;

    const listSql = `
    SELECT
      i.id AS id,
      i.place_id AS placeId,
      i.inspect_date AS inspectDate,
      i.inspector_officer_id AS inspectorOfficerId,
      i.inspector_name AS inspectorName,
      i.description AS description,
      i.has_hidden_danger AS hasHiddenDanger,
      i.rectification_advice AS rectificationAdvice,
      i.rectification_status_id AS rectificationStatusId,
      ds.item_name AS rectificationStatusName,
      i.rectified_date AS rectifiedDate,
      i.created_at AS createdAt,
      i.updated_at AS updatedAt
    FROM nine_small_inspections i
    LEFT JOIN dict_items ds ON i.rectification_status_id = ds.id
    WHERE i.place_id = ?
    ORDER BY i.inspect_date DESC, i.id DESC
    LIMIT ? OFFSET ?
  `;

    const [rows] = await pool.query(listSql, [placeId, pageSize, offset]);

    return {
        items: rows.map(mapInspectionRow),
        total,
        page,
        pageSize,
    };
}

/**
 * 创建巡查记录
 */
async function createInspection(placeId, data) {
    // 确保场所存在
    const place = await getPlaceById(placeId);
    if (!place) {
        throw notFound('九小场所不存在');
    }

    const sql = `
    INSERT INTO nine_small_inspections (
      place_id,
      inspect_date,
      inspector_officer_id,
      inspector_name,
      description,
      has_hidden_danger,
      rectification_advice,
      rectification_status_id,
      rectified_date
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

    const params = [
        placeId,
        data.inspectDate,
        data.inspectorOfficerId ?? null,
        data.inspectorName ?? null,
        data.description ?? null,
        data.hasHiddenDanger ? 1 : 0,
        data.rectificationAdvice ?? null,
        data.rectificationStatusId ?? null,
        data.rectifiedDate ?? null,
    ];

    try {
        const [result] = await pool.query(sql, params);
        return await getInspectionById(result.insertId);
    } catch (err) {
        handleInspectionDbError(err);
    }
}

/**
 * 更新巡查记录（局部更新）
 */
async function updateInspection(inspectionId, data) {
    const [rows] = await pool.query(
        'SELECT * FROM nine_small_inspections WHERE id = ?',
        [inspectionId]
    );
    if (!rows.length) {
        throw notFound('巡查记录不存在');
    }

    const existing = rows[0];

    const merged = {
        placeId:
            data.placeId !== undefined ? data.placeId : existing.place_id,
        inspectDate:
            data.inspectDate !== undefined
                ? data.inspectDate
                : existing.inspect_date,
        inspectorOfficerId:
            data.inspectorOfficerId !== undefined
                ? data.inspectorOfficerId
                : existing.inspector_officer_id,
        inspectorName:
            data.inspectorName !== undefined
                ? data.inspectorName
                : existing.inspector_name,
        description:
            data.description !== undefined
                ? data.description
                : existing.description,
        hasHiddenDanger:
            typeof data.hasHiddenDanger === 'boolean'
                ? data.hasHiddenDanger
                : existing.has_hidden_danger === 1,
        rectificationAdvice:
            data.rectificationAdvice !== undefined
                ? data.rectificationAdvice
                : existing.rectification_advice,
        rectificationStatusId:
            data.rectificationStatusId !== undefined
                ? data.rectificationStatusId
                : existing.rectification_status_id,
        rectifiedDate:
            data.rectifiedDate !== undefined
                ? data.rectifiedDate
                : existing.rectified_date,
    };

    // 业务规则：至少一个巡查人信息
    if (
        !merged.inspectorOfficerId &&
        (!merged.inspectorName ||
            String(merged.inspectorName).trim() === '')
    ) {
        throw validationError('巡查民警或巡查人员姓名至少填写一项');
    }

    // 业务规则：整改时间 >= 巡查时间
    if (
        merged.rectifiedDate &&
        merged.inspectDate &&
        merged.rectifiedDate < merged.inspectDate
    ) {
        throw validationError('整改完成时间不能早于巡查时间');
    }

    // 若修改了 placeId，先确保新场所存在
    if (
        data.placeId !== undefined &&
        Number(data.placeId) !== Number(existing.place_id)
    ) {
        const newPlace = await getPlaceById(data.placeId);
        if (!newPlace) {
            throw validationError('关联的九小场所不存在');
        }
    }

    const sql = `
    UPDATE nine_small_inspections
    SET
      place_id = ?,
      inspect_date = ?,
      inspector_officer_id = ?,
      inspector_name = ?,
      description = ?,
      has_hidden_danger = ?,
      rectification_advice = ?,
      rectification_status_id = ?,
      rectified_date = ?
    WHERE id = ?
  `;

    const params = [
        merged.placeId,
        merged.inspectDate,
        merged.inspectorOfficerId ?? null,
        merged.inspectorName ?? null,
        merged.description ?? null,
        merged.hasHiddenDanger ? 1 : 0,
        merged.rectificationAdvice ?? null,
        merged.rectificationStatusId ?? null,
        merged.rectifiedDate ?? null,
        inspectionId,
    ];

    try {
        await pool.query(sql, params);
        return await getInspectionById(inspectionId);
    } catch (err) {
        handleInspectionDbError(err);
    }
}

module.exports = {
    listPlaces,
    getPlaceById,
    createPlace,
    updatePlace,
    listInspections,
    createInspection,
    updateInspection,
    getInspectionById,
};
