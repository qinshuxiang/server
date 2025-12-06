// src/modules/communities/service.js
const pool = require('../../config/db');
const { AppError } = require('../../utils/errors');

/**
 * 获取全部社区列表
 * 返回 [{ id, communityName }, ...]
 */
async function listCommunities() {
    const sql = `
    SELECT 
      id,
      community_name AS communityName
    FROM communities
    ORDER BY id ASC
  `;
    const [rows] = await pool.query(sql);
    return rows;
}

/**
 * 新增社区
 * @param {{ communityName: string }} data
 */
async function createCommunity(data) {
    const { communityName } = data;

    // 先检查重名，避免直接撞 UNIQUE
    const [existRows] = await pool.query(
        'SELECT id FROM communities WHERE community_name = ? LIMIT 1',
        [communityName]
    );
    if (existRows.length > 0) {
        throw new AppError({
            statusCode: 409,
            errorCode: 'CONFLICT',
            message: '社区名称已存在'
        });
    }

    const insertSql = `
    INSERT INTO communities (community_name)
    VALUES (?)
  `;
    try {
        const [res] = await pool.query(insertSql, [communityName]);
        return {
            id: res.insertId,
            communityName
        };
    } catch (err) {
        // 兜底处理 UNIQUE 约束（万一并发下撞 UNIQUE）
        if (err && err.code === 'ER_DUP_ENTRY') {
            throw new AppError({
                statusCode: 409,
                errorCode: 'CONFLICT',
                message: '社区名称已存在'
            });
        }
        throw err;
    }
}

/**
 * 更新社区
 * @param {number} id
 * @param {{ communityName: string }} data
 */
async function updateCommunity(id, data) {
    const { communityName } = data;

    // 检查是否存在
    const [rows] = await pool.query(
        'SELECT id FROM communities WHERE id = ? LIMIT 1',
        [id]
    );
    if (rows.length === 0) {
        throw new AppError({
            statusCode: 404,
            errorCode: 'NOT_FOUND',
            message: '社区不存在'
        });
    }

    // 检查重名（排除自身）
    const [dupRows] = await pool.query(
        'SELECT id FROM communities WHERE community_name = ? AND id <> ? LIMIT 1',
        [communityName, id]
    );
    if (dupRows.length > 0) {
        throw new AppError({
            statusCode: 409,
            errorCode: 'CONFLICT',
            message: '社区名称已存在'
        });
    }

    const updateSql = `
    UPDATE communities
    SET community_name = ?
    WHERE id = ?
  `;
    try {
        await pool.query(updateSql, [communityName, id]);
        return {
            id,
            communityName
        };
    } catch (err) {
        if (err && err.code === 'ER_DUP_ENTRY') {
            throw new AppError({
                statusCode: 409,
                errorCode: 'CONFLICT',
                message: '社区名称已存在'
            });
        }
        throw err;
    }
}

/**
 * 删除社区（当前实现为物理删除）
 * @param {number} id
 */
async function deleteCommunity(id) {
    const sql = 'DELETE FROM communities WHERE id = ?';
    const [res] = await pool.query(sql, [id]);

    if (res.affectedRows === 0) {
        throw new AppError({
            statusCode: 404,
            errorCode: 'NOT_FOUND',
            message: '社区不存在'
        });
    }

    // 若 DB 里设置了 ON DELETE CASCADE，则会级联删除该社区下的房屋等记录
    return;
}

module.exports = {
    listCommunities,
    createCommunity,
    updateCommunity,
    deleteCommunity
};
