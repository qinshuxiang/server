const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
    // 1. 获取 header 中的 token
    // 前端通常发送: Authorization: Bearer <token>
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(403).json({ message: '未提供 Token，访问拒绝' });
    }

    // 2. 验证 token
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ message: 'Token 无效或已过期' });
        }

        // 3. 将解析出的用户信息（包含 role）挂载到 req 上
        req.user = user;
        next();
    });
};
