const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { query } = require('../config/db');
const logger = require('../utils/logger'); // 确保路径正确
const authMiddleware = require('../middlewares/authMiddleware');

router.use(authMiddleware);

/**
 * GET /
 * 获取用户列表 (分页 + 搜索)
 */
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const pageSize = parseInt(req.query.pageSize, 10) || 10;
        const keyword = (req.query.keyword || '').trim();
        const offset = (page - 1) * pageSize;

        let whereSql = '';
        const params = [];

        if (keyword) {
            whereSql = 'WHERE username LIKE ? OR email LIKE ?';
            params.push(`%${keyword}%`, `%${keyword}%`);
        }

        // -----------------------------------------------------------
        // FIX 1: LIMIT/OFFSET 必须直接拼接进 SQL 字符串中，不能使用 ? 占位符
        // -----------------------------------------------------------
        const limitSql = `LIMIT ${pageSize} OFFSET ${offset}`;

        const listSql = `
            SELECT id, username, email, role, created_at
            FROM users
            ${whereSql}
            ORDER BY id DESC
            ${limitSql}
        `;

        // 执行查询 (参数数组中只包含 where 条件相关的参数)
        const rows = await query(listSql, params); // FIX 2: 移除 pageSize 和 offset

        // 查询总数 (count query 逻辑不变，参数为 whereSql 相关的)
        const countSql = `SELECT COUNT(*) AS total FROM users ${whereSql}`;
        const countResult = await query(countSql, params);
        const total = countResult[0]?.total || 0;

        res.json({
            code: 200,
            data: {
                list: rows,
                total,
                page,
                pageSize
            }
        });
    } catch (error) {
        // 优化日志：使用 logger.error 记录错误，并包含堆栈信息
        logger.error(`GET /users error: ${error.message}`, { stack: error.stack, query: req.query });
        res.status(500).json({ message: '服务器内部错误' });
    }
});

/**
 * GET /:id
 * 获取单个用户详情
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        // 同样排除密码字段
        const sql = `SELECT id, username, email, role, created_at FROM users WHERE id = ?`;
        const rows = await query(sql, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: '用户不存在' });
        }

        res.json({ code: 200, data: rows[0] });
    } catch (error) {
        // 优化日志
        logger.error(`GET /users/:id error: ${error.message}`, { stack: error.stack, params: req.params });
        res.status(500).json({ message: '服务器内部错误' });
    }
});

/**
 * POST /
 * 新增用户
 */
router.post('/', async (req, res) => {
    try {
        const { username, email, password, role = 'user' } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ message: '用户名、邮箱、密码不能为空' });
        }

        // 1. 检查邮箱是否存在 (虽然数据库有唯一索引，但先查一下更友好)
        const checkSql = 'SELECT id FROM users WHERE email = ?';
        const existing = await query(checkSql, [email]);
        if (existing.length > 0) {
            return res.status(400).json({ message: '该邮箱已被注册' });
        }

        // 2. 加密密码
        const hashedPassword = await bcrypt.hash(password, 10);

        // 3. 插入数据
        const insertSql = `
            INSERT INTO users (username, email, password, role)
            VALUES (?, ?, ?, ?)
        `;
        const result = await query(insertSql, [username, email, hashedPassword, role]);

        res.status(201).json({
            code: 201,
            message: '创建成功',
            data: {
                id: result.insertId,
                username,
                email,
                role
            }
        });

    } catch (error) {
        // 优化日志 (只记录邮箱等非敏感信息)
        logger.error(`POST /users error: ${error.message}`, { stack: error.stack, body: { email: req.body.email, username: req.body.username } });
        // 兜底处理唯一键冲突
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: '该邮箱已被注册' });
        }
        res.status(500).json({ message: '服务器内部错误' });
    }
});

/**
 * PUT /:id
 * 更新用户信息 (支持部分更新)
 */
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { username, email, password, role } = req.body;

        // 构建动态 SQL
        const fields = [];
        const params = [];

        if (username) {
            fields.push('username = ?');
            params.push(username);
        }
        if (email) {
            fields.push('email = ?');
            params.push(email);
        }
        if (role) {
            fields.push('role = ?');
            params.push(role);
        }
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            fields.push('password = ?');
            params.push(hashedPassword);
        }

        if (fields.length === 0) {
            return res.status(400).json({ message: '没有提供任何需要更新的字段' });
        }

        // 添加 ID 到参数末尾
        params.push(id);

        const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;

        const result = await query(sql, params);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: '用户不存在或无变更' });
        }

        res.json({ code: 200, message: '更新成功' });

    } catch (error) {
        // 优化日志
        logger.error(`PUT /users/:id error: ${error.message}`, { stack: error.stack, params: req.params, body: { email: req.body.email } });
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: '邮箱已被其他用户使用' });
        }
        res.status(500).json({ message: '服务器内部错误' });
    }
});

/**
 * DELETE /:id
 * 删除用户
 */
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // 防止删除自己 (可选逻辑，需要结合 req.user.id 判断)
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
        // 优化日志
        logger.error(`DELETE /users/:id error: ${error.message}`, { stack: error.stack, params: req.params });
        res.status(500).json({ message: '服务器内部错误' });
    }
});

module.exports = router;
