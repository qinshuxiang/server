
const { pool } = require('../../config/db');
const logger = require('../../utils/logger');
const { dbError, conflict } = require('../../utils/errors');

/**
 * 统一 SELECT 片段
 */
const BASE_SELECT = `
    SELECT
        cpr.id,
        cpr.community_id       AS communityId,
        c.community_name       AS communityName,
        cpr.name               AS name,
        cpr.gender_item_id     AS genderItemId,
        gender.item_name       AS genderName,
        cpr.role_type_id       AS roleTypeItemId,
        role_type.item_name    AS roleTypeName,
        cpr.position_id        AS positionItemId,
        position.item_name     AS positionName,
        cpr.grid_name          AS gridName,
        cpr.contact_phone      AS contactPhone,
        cpr.is_full_time       AS isFullTime,
        cpr.remark             AS remark,
        cpr.created_at         AS createdAt,
        cpr.updated_at         AS updatedAt
    FROM community_person_roles cpr
             LEFT JOIN communities c       ON cpr.community_id   = c.id
             LEFT JOIN dict_items gender   ON cpr.gender_item_id = gender.id
             LEFT JOIN dict_items role_type ON cpr.role_type_id  = role_type.id
             LEFT JOIN dict_items position ON cpr.position_id    = position.id
`;

/**
 * is_full_time → boolean
 */
function mapIsFullTime(row) {
    if (!row) return row;
    return {
        ...row,
        isFullTime:
            row.isFullTime === 1 ||
            row.isFullTime === true ||
            row.isFullTime === '1',
    };
}

function handleDbError(err) {
    if (err && err.code === 'ER_DUP_ENTRY') {
        // 设计文档里建议的联合唯一：(community_id, role_type_id, name) :contentReference[oaicite:0]{index=0}
        throw conflict('同一社区内相同角色类型姓名已存在');
    }

    logger.error('DB error in community_person_roles', { err });
    throw dbError('社区人员角色数据库操作失败');
}

/**
 * 列表
 */
async function listCommunityPersonRoles(params) {
    const {
        communityId,
        roleTypeItemId,
        positionItemId,
        keyword,
        page = 1,
        pageSize = 20,
    } = params;

    const where = [];
    const values = [];

    if (communityId) {
        where.push('cpr.community_id = ?');
        values.push(communityId);
    }
    if (roleTypeItemId) {
        where.push('cpr.role_type_id = ?');
        values.push(roleTypeItemId);
    }
    if (positionItemId) {
        where.push('cpr.position_id = ?');
        values.push(positionItemId);
    }
    if (keyword) {
        const like = `%${keyword}%`;
        where.push(
            '(cpr.name LIKE ? OR cpr.grid_name LIKE ? OR cpr.contact_phone LIKE ?)'
        );
        values.push(like, like, like);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const offset = (page - 1) * pageSize;

    const countSql = `
        SELECT COUNT(*) AS total
        FROM community_person_roles cpr
            ${whereSql}
    `;

    const listSql = `
    ${BASE_SELECT}
    ${whereSql}
    ORDER BY cpr.id DESC
    LIMIT ? OFFSET ?
  `;

    try {
        const [countRows] = await pool.query(countSql, values);
        const total = countRows[0]?.total ? Number(countRows[0].total) : 0;

        const [rows] = await pool.query(listSql, [...values, pageSize, offset]);

        return {
            items: rows.map(mapIsFullTime),
            total,
            page,
            pageSize,
        };
    } catch (err) {
        handleDbError(err);
    }
}

/**
 * 单条详情
 */
async function getCommunityPersonRoleById(id) {
    const sql = `
    ${BASE_SELECT}
    WHERE cpr.id = ?
    LIMIT 1
  `;
    const [rows] = await pool.query(sql, [id]);
    if (!rows.length) return null;
    return mapIsFullTime(rows[0]);
}

/**
 * 新增
 */
async function createCommunityPersonRole(data) {
    const sql = `
    INSERT INTO community_person_roles (
      community_id,
      name,
      gender_item_id,
      role_type_id,
      position_id,
      grid_name,
      contact_phone,
      is_full_time,
      remark
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

    const params = [
        data.communityId,
        data.name,
        data.genderItemId || null,
        data.roleTypeItemId,
        data.positionItemId,
        data.gridName || null,
        data.contactPhone || null,
        data.isFullTime ? 1 : 0,
        data.remark || null,
    ];

    try {
        const [result] = await pool.query(sql, params);
        return getCommunityPersonRoleById(result.insertId);
    } catch (err) {
        handleDbError(err);
    }
}

/**
 * 更新（PUT，按文档是完整更新） :contentReference[oaicite:1]{index=1}
 */
async function updateCommunityPersonRole(id, data) {
    const sql = `
    UPDATE community_person_roles
    SET
      community_id   = ?,
      name           = ?,
      gender_item_id = ?,
      role_type_id   = ?,
      position_id    = ?,
      grid_name      = ?,
      contact_phone  = ?,
      is_full_time   = ?,
      remark         = ?
    WHERE id = ?
  `;

    const params = [
        data.communityId,
        data.name,
        data.genderItemId || null,
        data.roleTypeItemId,
        data.positionItemId,
        data.gridName || null,
        data.contactPhone || null,
        data.isFullTime ? 1 : 0,
        data.remark || null,
        id,
    ];

    try {
        await pool.query(sql, params);
        return getCommunityPersonRoleById(id);
    } catch (err) {
        handleDbError(err);
    }
}

/**
 * 删除
 */
async function deleteCommunityPersonRole(id) {
    const sql = 'DELETE FROM community_person_roles WHERE id = ?';
    try {
        const [result] = await pool.query(sql, [id]);
        return result.affectedRows > 0;
    } catch (err) {
        handleDbError(err);
    }
}

module.exports = {
    listCommunityPersonRoles,
    getCommunityPersonRoleById,
    createCommunityPersonRole,
    updateCommunityPersonRole,
    deleteCommunityPersonRole,
};
