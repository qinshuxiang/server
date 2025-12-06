// src/config/jwt.js
const jwt = require('jsonwebtoken');

const JWT_SECRET =
    process.env.JWT_SECRET || 'dev-secret-change-this-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

function signToken(payload, options = {}) {
    return jwt.sign(payload, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN,
        ...options
    });
}

function verifyToken(token) {
    return jwt.verify(token, JWT_SECRET);
}

function decodeToken(token) {
    return jwt.decode(token);
}

module.exports = {
    signToken,
    verifyToken,
    decodeToken,
    JWT_SECRET,
    JWT_EXPIRES_IN
};
