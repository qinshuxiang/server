const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { query, pool } = require('../config/db'); // 引入 pool
const logger = require('../utils/logger');
const authMiddleware = require('../middlewares/authMiddleware');

// 所有 /users 接口都需要登录
router.use(authMiddleware);

// 工具函数：处理空字符串转 NULL，避免唯一键冲突
const cleanVal = (val) => (val === '' || val === undefined ? null : val);

/**
 * GET /
 * 用户列表（分页 + 模糊搜索），附带基础资料
 */
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const pageSize = parseInt(req.query.pageSize, 10) || 10;
        const keyword = (req.query.keyword || '').trim();
        const offset = (page - 1) * pageSize;

        const params = [];
        let whereSql = '';

        if (keyword) {
            const likeKeyword = `%${keyword}%`;

            // 需求 4: 实现全字段搜索
            // 使用 IFNULL(p.column, '') 将 LEFT JOIN 结果中的 NULL 字段转为空字符串，
            // 确保 LIKE 搜索能正常工作，并提高查询的健壮性。
            whereSql = `
                WHERE 
                    u.username LIKE ? OR u.email LIKE ? OR
                    IFNULL(p.id_number, '') LIKE ? OR IFNULL(p.phone, '') LIKE ? OR
                    IFNULL(p.company, '') LIKE ? OR IFNULL(p.position, '') LIKE ? OR
                    IFNULL(p.car_plate, '') LIKE ? OR IFNULL(p.home, '') LIKE ? OR
                    IFNULL(p.type, '') LIKE ? OR IFNULL(p.note, '') LIKE ?
            `;

            // 确保为 10 个 LIKE 占位符推送 10 个参数
            // u.username, u.email, p.id_number, p.phone, p.company, p.position, p.car_plate, p.home, p.type, p.note
            for (let i = 0; i < 10; i++) {
                params.push(likeKeyword);
            }
        }

        const limitSql = `LIMIT ${pageSize} OFFSET ${offset}`;

        // 关联查询列表
        const listSql = `
            SELECT
                u.id, u.username, u.email, u.role, u.created_at,
                p.avatar_url, p.id_number, p.phone, p.company, p.position,
                p.car_plate, p.home, p.type, p.note
            FROM users u
                     LEFT JOIN user_profiles p ON p.user_id = u.id
                ${whereSql}
            ORDER BY u.id DESC
                ${limitSql}
        `;

        const rows = await query(listSql, params);

        // 统计总数
        const countSql = `
            SELECT COUNT(u.id) AS total
            FROM users u
                     LEFT JOIN user_profiles p ON p.user_id = u.id
                ${whereSql}
        `;
        const countResult = await query(countSql, params);
        const total = countResult[0]?.total || 0;

        res.json({
            code: 200,
            data: {
                list: rows,
                total,
                page,
                pageSize,
            },
        });
    } catch (error) {
        logger.error(`GET /users error: ${error.message}`, {
            stack: error.stack,
            query: req.query,
        });
        res.status(500).json({ message: '服务器内部错误' });
    }
});

/**
 * GET /:id
 * 用户详情（包含 profile + settings）
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const sql = `
            SELECT
                u.id,
                u.username,
                u.email,
                u.role,
                u.created_at,
                p.avatar_url,
                p.id_number,
                p.phone,
                p.company,
                p.position,
                p.car_plate,
                s.theme,
                s.email_notifications,
                s.page_size,
                s.left_sidebar_collapsed,
                s.right_sidebar_collapsed,
                s.extra
            FROM users u
                     LEFT JOIN user_profiles p ON p.user_id = u.id
                     LEFT JOIN user_settings s ON s.user_id = u.id
            WHERE u.id = ?
        `;

        const rows = await query(sql, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: '用户不存在' });
        }

        res.json({ code: 200, data: rows[0] });
    } catch (error) {
        logger.error(`GET /users/:id error: ${error.message}`, {
            stack: error.stack,
            params: req.params,
        });
        res.status(500).json({ message: '服务器内部错误' });
    }
});

/**
 * POST /
 * 新增用户（事务版：顺带创建 profile + settings）
 */
router.post('/', async (req, res) => {
    // 获取单独连接以开启事务
    const conn = await pool.promise().getConnection();

    try {
        const {
            username,
            email,
            password,
            role = 'user',

            // user_profiles 字段
            avatar_url,
            id_number,
            phone,
            company,
            position,
            car_plate,
            home,         /* <--- 【新增】 */
            type,         /* <--- 【新增】 */
            note,         /* <--- 【新增】 */

            // user_settings 字段
            theme,
            email_notifications,
            page_size,
            left_sidebar_collapsed,
            right_sidebar_collapsed,
            extra,
        } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ message: '用户名、邮箱、密码不能为空' });
        }

        // 开启事务
        await conn.beginTransaction();

        // 1. 检查邮箱
        const [existing] = await conn.execute('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            await conn.rollback();
            return res.status(400).json({ message: '该邮箱已被注册' });
        }

        // 2. 插入 users
        const hashedPassword = await bcrypt.hash(password, 10);
        const [userResult] = await conn.execute(
            'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
            [username, email, hashedPassword, role]
        );
        const userId = userResult.insertId;

        // 3. 插入 user_profiles (使用 cleanVal 处理唯一键)
        const profileSql = `
            INSERT INTO user_profiles
            (user_id, avatar_url, id_number, phone, company, position, car_plate, home, type, note)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        // 注意：undefined 也会被 cleanVal 转为 null，这是符合预期的，因为数据库默认值由 SQL 定义或为 NULL
        await conn.execute(profileSql, [
            userId,
            avatar_url || '/static/images/default-avatar.png',
            cleanVal(id_number),
            cleanVal(phone),
            company || null,
            position || null,
            cleanVal(car_plate),
            home || null,       /* <--- 【新增】 */
            type || null,       /* <--- 【新增】 */
            note || null        /* <--- 【新增】 */
        ]);

        // 4. 插入 user_settings
        const settingsSql = `
            INSERT INTO user_settings
            (user_id, theme, email_notifications, page_size, left_sidebar_collapsed, right_sidebar_collapsed, extra)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        await conn.execute(settingsSql, [
            userId,
            theme || 'light',
            email_notifications !== undefined ? email_notifications : 1,
            page_size || 20,
            left_sidebar_collapsed || 0,
            right_sidebar_collapsed || 0,
            extra ? JSON.stringify(extra) : null
        ]);

        // 提交事务
        await conn.commit();

        res.status(201).json({
            code: 201,
            message: '创建成功',
            data: { id: userId, username, email, role },
        });

    } catch (error) {
        await conn.rollback(); // 回滚

        logger.error(`POST /users error: ${error.message}`, {
            stack: error.stack,
            body: { email: req.body && req.body.email },
        });

        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: '邮箱或身份证/手机号/车牌号已被占用' });
        }
        res.status(500).json({ message: '服务器内部错误' });
    } finally {
        conn.release(); // 释放连接
    }
});

/**
 * PUT /:id
 * 更新用户（事务版）
 */
router.put('/:id', async (req, res) => {
    const conn = await pool.promise().getConnection();

    try {
        const { id } = req.params;
        const {
            username, email, password, role,
            avatar_url, id_number, phone, company, position, car_plate,
            home, type, note,
            theme, email_notifications, page_size, left_sidebar_collapsed, right_sidebar_collapsed, extra
        } = req.body;

        await conn.beginTransaction();

        // 1. 更新 users 表
        const userFields = [];
        const userParams = [];

        if (username !== undefined) { userFields.push('username = ?'); userParams.push(username); }
        if (email !== undefined) { userFields.push('email = ?'); userParams.push(email); }
        if (role !== undefined) { userFields.push('role = ?'); userParams.push(role); }
        if (password !== undefined && password.length > 0) {
            const hashedPassword = await bcrypt.hash(password, 10);
            userFields.push('password = ?');
            userParams.push(hashedPassword);
        }

        if (userFields.length > 0) {
            userParams.push(id);
            await conn.execute(`UPDATE users SET ${userFields.join(', ')} WHERE id = ?`, userParams);
        }

        const profileFields = [];
        const profileParams = [];

        if (avatar_url !== undefined) { profileFields.push('avatar_url = ?'); profileParams.push(avatar_url); }
        if (id_number !== undefined) { profileFields.push('id_number = ?'); profileParams.push(cleanVal(id_number)); }
        if (phone !== undefined) { profileFields.push('phone = ?'); profileParams.push(cleanVal(phone)); }
        if (company !== undefined) { profileFields.push('company = ?'); profileParams.push(company); }
        if (position !== undefined) { profileFields.push('position = ?'); profileParams.push(position); }
        if (car_plate !== undefined) { profileFields.push('car_plate = ?'); profileParams.push(cleanVal(car_plate)); }
        if (home !== undefined) { profileFields.push('home = ?'); profileParams.push(home); }      /* <--- 【新增】 */
        if (type !== undefined) { profileFields.push('type = ?'); profileParams.push(type); }      /* <--- 【新增】 */
        if (note !== undefined) { profileFields.push('note = ?'); profileParams.push(note); }      /* <--- 【新增】 */

        if (profileFields.length > 0) {
            profileParams.push(id);
            await conn.execute(`UPDATE user_profiles SET ${profileFields.join(', ')} WHERE user_id = ?`, profileParams);
        }

        // 3. 更新 user_settings
        const settingsFields = [];
        const settingsParams = [];

        if (theme !== undefined) { settingsFields.push('theme = ?'); settingsParams.push(theme); }
        if (email_notifications !== undefined) { settingsFields.push('email_notifications = ?'); settingsParams.push(email_notifications); }
        if (page_size !== undefined) { settingsFields.push('page_size = ?'); settingsParams.push(page_size); }
        if (left_sidebar_collapsed !== undefined) { settingsFields.push('left_sidebar_collapsed = ?'); settingsParams.push(left_sidebar_collapsed); }
        if (right_sidebar_collapsed !== undefined) { settingsFields.push('right_sidebar_collapsed = ?'); settingsParams.push(right_sidebar_collapsed); }
        if (extra !== undefined) { settingsFields.push('extra = ?'); settingsParams.push(JSON.stringify(extra)); }

        if (settingsFields.length > 0) {
            settingsParams.push(id);
            await conn.execute(`UPDATE user_settings SET ${settingsFields.join(', ')} WHERE user_id = ?`, settingsParams);
        }

        await conn.commit();
        res.json({ code: 200, message: '更新成功' });

    } catch (error) {
        await conn.rollback();
        logger.error(`PUT /users/:id error: ${error.message}`, {
            stack: error.stack,
            params: req.params
        });
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: '邮箱或身份证/手机号/车牌号已被其他用户使用' });
        }
        res.status(500).json({ message: '服务器内部错误' });
    } finally {
        conn.release();
    }
});

/**
 * DELETE /:id
 */
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (req.user && req.user.id == id) {
            return res.status(400).json({ message: '无法删除当前登录账户' });
        }

        const sql = 'DELETE FROM users WHERE id = ?';
        const result = await query(sql, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: '用户不存在' });
        }
        res.json({ code: 200, message: '删除成功' });
    } catch (error) {
        logger.error(`DELETE /users/:id error: ${error.message}`, { stack: error.stack });
        res.status(500).json({ message: '服务器内部错误' });
    }
});



module.exports = router;
