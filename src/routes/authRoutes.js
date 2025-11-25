const express = require('express');
const router = express.Router();
const {query} = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require('jsonwebtoken');

const signToken = (user) => {
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN }
    );
};

router.post('/register', async (req, res) => {
    try {
        const { username, email, password, role } = req.body;
        const userList = await query('SELECT id FROM users WHERE email = ?', [email]);
        if (userList.length > 0)  return res.status(400).json({ message: '该邮箱已被注册' });
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const userRole = role || 'user';
        const result = await query(
            'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
            [username, email, hashedPassword, userRole]
        );
        if (result.affectedRows === 1) {
            res.status(201).json({ message: '用户注册成功', userId: result.insertId });
        } else {
            res.status(500).json({ message: '注册失败' });
        }
    } catch (error) {
        res.status(500).json({ message: '服务器错误' });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const users = await query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) return res.status(401).json({ message: '邮箱或密码错误' });
        const user = users[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ message: '邮箱或密码错误' });
        const token = signToken(user);
        res.json({
            message: '登录成功',
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        res.status(500).json({ message: '服务器错误' });
    }
});

module.exports = router;
