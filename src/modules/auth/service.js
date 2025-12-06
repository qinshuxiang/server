// src/modules/auth/service.js
const bcrypt = require('bcryptjs');
const { pool } = require('../../config/db');
const {
    conflict,
    unauthorized,
    validationError,
    dbError
} = require('../../utils/errors');
const logger = require('../../utils/logger');
const { signToken } = require('../../config/jwt');

/**
 * 根据警号查找民警
 */
async function findOfficerByBadgeNo(badgeNo) {
    const sql = `
        SELECT
            id,
            name,
            badge_no,
            phone,
            status,
            is_active,
            password_hash
        FROM police_officers
        WHERE badge_no = ?
        LIMIT 1
    `;
    const [rows] = await pool.query(sql, [badgeNo]);
    return rows[0] || null;
}

/**
 * 加载用户角色和权限
 */
async function loadRolesAndPermissions(officerId) {
    // 角色
    const roleSql = `
        SELECT
            r.id,
            r.code,
            r.name
        FROM officer_roles orr
        JOIN roles r ON orr.role_id = r.id
        WHERE orr.officer_id = ?
    `;
    const [roleRows] = await pool.query(roleSql, [officerId]);
    const roleIds = roleRows.map((r) => r.id);
    const roles = roleRows.map((r) => r.code);
    const roleNames = roleRows.map((r) => r.name);

    // 权限
    let permissions = [];
    if (roleIds.length > 0) {
        const permSql = `
            SELECT DISTINCT p.code
            FROM role_permissions rp
            JOIN permissions p ON rp.permission_id = p.id
            WHERE rp.role_id IN (?)
        `;
        const [permRows] = await pool.query(permSql, [roleIds]);
        permissions = permRows.map((p) => p.code);
    }

    return {
        roleIds,
        roles,
        roleNames,
        permissions
    };
}

/**
 * 将数据库 row + 角色权限映射成前端 userInfo
 */
function mapOfficerToUser(row, extra) {
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
        roles: extra.roles || [],
        roleNames: extra.roleNames || [],
        permissions: extra.permissions || []
    };
}

/**
 * 登录
 * @param {{ badgeNo: string, password: string }} payload
 */
async function login(payload) {
    const { badgeNo, password } = payload;

    const officer = await findOfficerByBadgeNo(badgeNo);
    if (!officer) {
        throw unauthorized('警号或密码错误');
    }

    if (officer.status === 'LOCKED') {
        throw unauthorized('账号已锁定，请联系管理员');
    }

    const ok = await bcrypt.compare(password, officer.password_hash || '');
    if (!ok) {
        throw unauthorized('警号或密码错误');
    }

    const extra = await loadRolesAndPermissions(officer.id);
    const user = mapOfficerToUser(officer, extra);

    const tokenPayload = {
        id: user.id,
        badgeNo: user.badgeNo,
        name: user.name,
        roles: user.roles,
        permissions: user.permissions
    };
    const token = signToken(tokenPayload);

    return { token, user };
}

/**
 * 注册（自助创建账号）
 * @param {{ badgeNo: string, name: string, password: string, phone?: string }} payload
 */
async function register(payload) {
    const { badgeNo, name, password, phone } = payload;

    if (!badgeNo || !name || !password) {
        throw validationError('警号、姓名、密码不能为空');
    }

    // 警号唯一
    const existed = await findOfficerByBadgeNo(badgeNo);
    if (existed) {
        throw conflict('警号已存在，请联系管理员或直接登录');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const insertSql = `
        INSERT INTO police_officers
            (name, badge_no, phone, status, is_active, password_hash)
        VALUES (?, ?, ?, 'ACTIVE', 1, ?)
    `;

    let insertId;
    try {
        const [res] = await pool.query(insertSql, [
            name,
            badgeNo,
            phone || null,
            passwordHash
        ]);
        insertId = res.insertId;
    } catch (err) {
        logger.error('[auth] register officer failed', { err });
        throw dbError('注册失败，请稍后重试');
    }

    // 刚注册默认没有任何角色、权限，由管理员后续分配
    const officerRow = {
        id: insertId,
        name,
        badge_no: badgeNo,
        phone: phone || null,
        status: 'ACTIVE',
        is_active: 1
    };
    const extra = {
        roleIds: [],
        roles: [],
        roleNames: [],
        permissions: []
    };
    const user = mapOfficerToUser(officerRow, extra);

    const tokenPayload = {
        id: user.id,
        badgeNo: user.badgeNo,
        name: user.name,
        roles: user.roles,
        permissions: user.permissions
    };
    const token = signToken(tokenPayload);

    return { token, user };
}

/**
 * 修改密码
 * @param {number} officerId
 * @param {{ oldPassword: string, newPassword: string }} payload
 */
async function changePassword(officerId, payload) {
    const { oldPassword, newPassword } = payload;

    const sql = `
        SELECT id, password_hash
        FROM police_officers
        WHERE id = ?
        LIMIT 1
    `;
    const [rows] = await pool.query(sql, [officerId]);
    const officer = rows[0];

    if (!officer) {
        throw unauthorized('用户不存在或已被删除');
    }

    const ok = await bcrypt.compare(oldPassword, officer.password_hash || '');
    if (!ok) {
        throw validationError('原密码不正确', {
            fieldErrors: { oldPassword: '原密码不正确' }
        });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    const updateSql = `
        UPDATE police_officers
        SET password_hash = ?
        WHERE id = ?
    `;
    try {
        await pool.query(updateSql, [newHash, officerId]);
    } catch (err) {
        logger.error('[auth] change password failed', { err, officerId });
        throw dbError('修改密码失败，请稍后重试');
    }

    return true;
}

/**
 * 获取当前登录用户信息（含角色和权限）
 * @param {number} officerId
 */
async function getCurrentUser(officerId) {
    const sql = `
        SELECT
            id,
            name,
            badge_no,
            phone,
            status,
            is_active
        FROM police_officers
        WHERE id = ?
        LIMIT 1
    `;
    const [rows] = await pool.query(sql, [officerId]);
    const row = rows[0];
    if (!row) {
        throw unauthorized('用户不存在或已被删除');
    }

    const extra = await loadRolesAndPermissions(officerId);
    const user = mapOfficerToUser(row, extra);
    return user;
}

module.exports = {
    login,
    register,
    changePassword,
    getCurrentUser
};
