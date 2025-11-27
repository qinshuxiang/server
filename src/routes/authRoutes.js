const express = require('express');
const router = express.Router();
const { query, pool } = require('../config/db'); // 引入 pool
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const signToken = (user) => {
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN }
    );
};

/**
 * 注册：创建 user + 默认的 profile / settings (事务版)
 */
router.post('/register', async (req, res) => {
    const conn = await pool.promise().getConnection();
    try {
        const { username, email, password, role } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ message: '用户名、邮箱、密码不能为空' });
        }

        // 开启事务
        await conn.beginTransaction();

        // 1. 查重
        const [userList] = await conn.execute('SELECT id FROM users WHERE email = ?', [email]);
        if (userList.length > 0) {
            await conn.rollback();
            return res.status(400).json({ message: '该邮箱已被注册' });
        }

        // 2. 插入用户
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const userRole = role || 'user';

        const [result] = await conn.execute(
            'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
            [username, email, hashedPassword, userRole]
        );
        const userId = result.insertId;

        // 3. 插入关联表默认值
        await conn.execute('INSERT INTO user_profiles (user_id) VALUES (?)', [userId]);
        await conn.execute('INSERT INTO user_settings (user_id) VALUES (?)', [userId]);

        // 提交
        await conn.commit();

        res.status(201).json({ message: '用户注册成功', userId });

    } catch (error) {
        await conn.rollback(); // 出错回滚
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: '邮箱已被注册' });
        }
        res.status(500).json({ message: '服务器错误' });
    } finally {
        conn.release();
    }
});

/**
 * 登录：返回 token + 用户信息（不变）
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const rows = await query(
            `
      SELECT
        u.id,
        u.username,
        u.email,
        u.password,
        u.role,
        p.avatar_url,
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
      WHERE u.email = ?
      `,
            [email]
        );

        if (rows.length === 0) {
            return res.status(401).json({ message: '邮箱或密码错误' });
        }

        const user = rows[0];

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: '邮箱或密码错误' });
        }

        const token = signToken(user);

        let extra = null;
        if (user.extra) {
            try {
                extra = JSON.parse(user.extra);
            } catch (e) {
                extra = null;
            }
        }

        res.json({
            message: '登录成功',
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
                avatar_url: user.avatar_url,
                phone: user.phone,
                company: user.company,
                position: user.position,
                car_plate: user.car_plate,
                theme: user.theme,
                email_notifications: user.email_notifications,
                page_size: user.page_size,
                left_sidebar_collapsed: !!user.left_sidebar_collapsed, // 确保转为 Boolean
                right_sidebar_collapsed: !!user.right_sidebar_collapsed,
                extra,
            },
        });
    } catch (error) {
        res.status(500).json({ message: '服务器错误' });
    }
});

module.exports = router;
