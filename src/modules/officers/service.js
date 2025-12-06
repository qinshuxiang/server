// src/modules/officers/service.js
const bcrypt = require('bcryptjs');
const { pool } = require('../../config/db');
const {
    conflict,
    notFound,
    dbError,
    validationError
} = require('../../utils/errors');
const logger = require('../../utils/logger');

// 分页参数处理（按文档 0.3）:contentReference[oaicite:2]{index=2}
function normalizePaging({ page, pageSize }) {
    let p = Number(page) || 1;
    let ps = Number(pageSize) || 20;

    if (p < 1) p = 1;
    if (ps < 1) ps = 1;
    if (ps > 100) ps = 100;

    return { page: p, pageSize: ps };
}

function mapOfficerRow(row, roleIdsMap) {
    const isActive =
        row.is_active === 1 ||
        row.is_active === true ||
        row.is_active === '1';

    return {
        id: row.id,
        name: row.name,
        badgeNo: row.badge_no,
        phone: row.phone,
        status: row.status,
        isActive,
        remark: row.remark,
        roleIds: roleIdsMap[row.id] || []
    };
}

function generateRandomPassword(length = 8) {
    const chars =
        'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let pwd = '';
    for (let i = 0; i < length; i += 1) {
        pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pwd;
}

/**
 * 民警列表
 * @param {{ keyword?: string, status?: string, page?: number, pageSize?: number }} query
 */
async function listOfficers(query) {
    const { keyword, status } = query;
    const { page, pageSize } = normalizePaging(query);

    const whereParts = [];
    const params = [];

    if (keyword) {
        whereParts.push('(o.name LIKE ? OR o.badge_no LIKE ?)');
        const like = `%${keyword}%`;
        params.push(like, like);
    }

    if (status) {
        whereParts.push('o.status = ?');
        params.push(status);
    }

    const whereSql = whereParts.length
        ? `WHERE ${whereParts.join(' AND ')}`
        : '';

    // total
    const countSql = `
        SELECT COUNT(*) AS total
        FROM police_officers o
            ${whereSql}
    `;
    const [countRows] = await pool.query(countSql, params);
    const total = Number(countRows[0]?.total || 0);

    if (!total) {
        return {
            items: [],
            total: 0,
            page,
            pageSize
        };
    }

    const offset = (page - 1) * pageSize;

    const listSql = `
        SELECT
            o.id,
            o.name,
            o.badge_no,
            o.phone,
            o.status,
            o.is_active,
            o.remark
        FROM police_officers o
            ${whereSql}
        ORDER BY o.id DESC
            LIMIT ? OFFSET ?
    `;
    const listParams = params.concat([pageSize, offset]);
    const [rows] = await pool.query(listSql, listParams);

    const officerIds = rows.map((r) => r.id);

    // 加载角色 ID 列表
    let roleIdsMap = {};
    if (officerIds.length) {
        const [roleRows] = await pool.query(
            `
                SELECT officer_id, role_id
                FROM officer_roles
                WHERE officer_id IN (?)
            `,
            [officerIds]
        );

        roleIdsMap = roleRows.reduce((acc, r) => {
            if (!acc[r.officer_id]) acc[r.officer_id] = [];
            acc[r.officer_id].push(r.role_id);
            return acc;
        }, {});
    }

    const items = rows.map((row) => mapOfficerRow(row, roleIdsMap));

    return {
        items,
        total,
        page,
        pageSize
    };
}

/**
 * 新增前检查警号唯一
 */
async function ensureBadgeNoUnique(badgeNo, excludeId) {
    if (!badgeNo) return;

    const params = [badgeNo];
    let sql = `
        SELECT id
        FROM police_officers
        WHERE badge_no = ?
    `;

    if (excludeId) {
        sql += ' AND id <> ?';
        params.push(excludeId);
    }

    const [rows] = await pool.query(sql, params);
    if (rows.length) {
        throw conflict('警号已存在');
    }
}

/**
 * 新增民警
 * @param {{
 *  name: string,
 *  badgeNo?: string,
 *  phone?: string,
 *  status?: string,
 *  isActive?: boolean,
 *  remark?: string,
 *  roleIds?: number[]
 * }} payload
 */
async function createOfficer(payload, operatorId) {
    const {
        name,
        badgeNo,
        phone,
        status,
        isActive,
        remark,
        roleIds = []
    } = payload;

    await ensureBadgeNoUnique(badgeNo);

    const initialPassword = generateRandomPassword(8); // 如未指定密码，生成随机初始密码:contentReference[oaicite:3]{index=3}
    const passwordHash = await bcrypt.hash(initialPassword, 10);

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const insertSql = `
            INSERT INTO police_officers
                (name, badge_no, phone, status, is_active, remark, password_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        const isActiveVal =
            typeof isActive === 'boolean'
                ? (isActive ? 1 : 0)
                : 1; // 默认在职 ACTIVE

        const [res] = await conn.query(insertSql, [
            name,
            badgeNo || null,
            phone || null,
            status || 'ACTIVE',
            isActiveVal,
            remark || null,
            passwordHash
        ]);

        const officerId = res.insertId;

        if (Array.isArray(roleIds) && roleIds.length) {
            const values = [];
            const placeholders = roleIds
                .map((roleId) => {
                    values.push(officerId, roleId);
                    return '(?, ?)';
                })
                .join(', ');

            const roleSql = `
                INSERT INTO officer_roles (officer_id, role_id)
                VALUES ${placeholders}
            `;
            await conn.query(roleSql, values);
        }

        await conn.commit();

        logger.info(
            '[officers] created officer %d by operator %s',
            officerId,
            operatorId || 'system'
        );

        return {
            id: officerId,
            name,
            badgeNo: badgeNo || null,
            phone: phone || null,
            status: status || 'ACTIVE',
            isActive: !!isActiveVal,
            remark: remark || null,
            roleIds: Array.isArray(roleIds) ? roleIds : [],
            initialPassword
        };
    } catch (err) {
        await conn.rollback();

        if (err && err.code === 'ER_DUP_ENTRY') {
            throw conflict('警号已存在');
        }

        logger.error('[officers] createOfficer error', { err });
        throw dbError('创建民警失败');
    } finally {
        conn.release();
    }
}

/**
 * 修改民警
 */
async function updateOfficer(id, payload, operatorId) {
    // 先查出原记录（确保存在，也便于日志）
    const [rows] = await pool.query(
        `
            SELECT
                id,
                name,
                badge_no,
                phone,
                status,
                is_active,
                remark
            FROM police_officers
            WHERE id = ?
                LIMIT 1
        `,
        [id]
    );

    const existing = rows[0];
    if (!existing) {
        throw notFound('民警不存在');
    }

    const {
        name,
        badgeNo,
        phone,
        status,
        isActive,
        remark,
        roleIds
    } = payload;

    const newBadgeNo =
        badgeNo !== undefined ? badgeNo : existing.badge_no;

    await ensureBadgeNoUnique(newBadgeNo, id);

    const newName = name ?? existing.name;
    const newPhone = phone !== undefined ? phone : existing.phone;
    const newStatus =
        status !== undefined ? status : existing.status;
    const newIsActive =
        typeof isActive === 'boolean'
            ? (isActive ? 1 : 0)
            : existing.is_active;
    const newRemark =
        remark !== undefined ? remark : existing.remark;

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const updateSql = `
            UPDATE police_officers
            SET
                name = ?,
                badge_no = ?,
                phone = ?,
                status = ?,
                is_active = ?,
                remark = ?,
                updated_at = NOW()
            WHERE id = ?
        `;

        await conn.query(updateSql, [
            newName,
            newBadgeNo || null,
            newPhone || null,
            newStatus || null,
            newIsActive,
            newRemark || null,
            id
        ]);

        // 只有当 payload 中显式给了 roleIds，才更新角色列表
        if (payload.hasOwnProperty('roleIds')) {
            await conn.query(
                'DELETE FROM officer_roles WHERE officer_id = ?',
                [id]
            );

            if (Array.isArray(roleIds) && roleIds.length) {
                const values = [];
                const placeholders = roleIds
                    .map((roleId) => {
                        values.push(id, roleId);
                        return '(?, ?)';
                    })
                    .join(', ');

                const roleSql = `
          INSERT INTO officer_roles (officer_id, role_id)
          VALUES ${placeholders}
        `;
                await conn.query(roleSql, values);
            }
        }

        await conn.commit();

        logger.info(
            '[officers] updated officer %d by operator %s',
            id,
            operatorId || 'system'
        );

        // 返回最新数据及角色
        let roleIdsMap = {};
        if (payload.hasOwnProperty('roleIds')) {
            roleIdsMap[id] = Array.isArray(roleIds) ? roleIds : [];
        } else {
            const [roleRows] = await pool.query(
                `
        SELECT role_id
        FROM officer_roles
        WHERE officer_id = ?
      `,
                [id]
            );
            roleIdsMap[id] = roleRows.map((r) => r.role_id);
        }

        const mapped = mapOfficerRow(
            {
                id,
                name: newName,
                badge_no: newBadgeNo,
                phone: newPhone,
                status: newStatus,
                is_active: newIsActive,
                remark: newRemark
            },
            roleIdsMap
        );

        return mapped;
    } catch (err) {
        await conn.rollback();

        if (err && err.code === 'ER_DUP_ENTRY') {
            throw conflict('警号已存在');
        }

        logger.error('[officers] updateOfficer error', { err });
        throw dbError('更新民警失败');
    } finally {
        conn.release();
    }
}

/**
 * 删除民警（软删除：锁定账号+标记离职）
 */
async function deleteOfficer(id, operatorId) {
    const [rows] = await pool.query(
        `
    SELECT id
    FROM police_officers
    WHERE id = ?
    LIMIT 1
  `,
        [id]
    );

    if (!rows.length) {
        throw notFound('民警不存在');
    }

    // 不做物理删除，只锁定账号并标记不在职:contentReference[oaicite:4]{index=4}
    const sql = `
    UPDATE police_officers
    SET status = 'LOCKED', is_active = 0, updated_at = NOW()
    WHERE id = ?
  `;
    await pool.query(sql, [id]);

    logger.warn(
        '[officers] soft-deleted (locked) officer %d by operator %s',
        id,
        operatorId || 'system'
    );

    return true;
}

module.exports = {
    listOfficers,
    createOfficer,
    updateOfficer,
    deleteOfficer
};
