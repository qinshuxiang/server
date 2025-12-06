const pool = require('../../config/db');
const path = require('path');
const fs = require('fs').promises;
const { AppError } = require('../../utils/errors');

const UPLOAD_BASE_DIR = process.env.UPLOAD_BASE_DIR || './uploads';

/**
 * 查询附件列表(按业务类型和业务ID)
 * @param {string} bizType - 业务类型
 * @param {number} bizId - 业务ID
 * @returns {Promise<Array>}
 */
async function listAttachments(bizType, bizId) {
    const sql = `
        SELECT
            a.id,
            a.biz_type AS bizType,
            a.biz_id AS bizId,
            a.is_primary AS isPrimary,
            a.file_path AS filePath,
            a.file_name AS fileName,
            a.file_ext AS fileExt,
            a.mime_type AS mimeType,
            a.file_size AS fileSize,
            a.uploaded_by_officer_id AS uploadedByOfficerId,
            po.name AS uploadedByName,
            a.uploaded_at AS uploadedAt,
            a.remark
        FROM attachments a
                 LEFT JOIN police_officers po ON a.uploaded_by_officer_id = po.id
        WHERE a.biz_type = ? AND a.biz_id = ?
        ORDER BY a.is_primary DESC, a.uploaded_at DESC
    `;

    const [rows] = await pool.query(sql, [bizType, bizId]);
    return rows;
}

/**
 * 获取单个附件详情
 * @param {number} id - 附件ID
 * @returns {Promise<Object|null>}
 */
async function getAttachmentById(id) {
    const sql = `
        SELECT
            a.id,
            a.biz_type AS bizType,
            a.biz_id AS bizId,
            a.is_primary AS isPrimary,
            a.file_path AS filePath,
            a.file_name AS fileName,
            a.file_ext AS fileExt,
            a.mime_type AS mimeType,
            a.file_size AS fileSize,
            a.uploaded_by_officer_id AS uploadedByOfficerId,
            po.name AS uploadedByName,
            a.uploaded_at AS uploadedAt,
            a.remark
        FROM attachments a
                 LEFT JOIN police_officers po ON a.uploaded_by_officer_id = po.id
        WHERE a.id = ?
    `;

    const [rows] = await pool.query(sql, [id]);
    return rows[0] || null;
}

/**
 * 创建附件记录
 * @param {Object} data - 附件数据
 * @param {Object} file - multer处理后的文件对象
 * @param {number} officerId - 上传者ID
 * @returns {Promise<number>} 附件ID
 */
async function createAttachment(data, file, officerId) {
    const { bizType, bizId, isPrimary = 0, remark } = data;

    // 生成相对路径(相对于UPLOAD_BASE_DIR)
    const relativePath = file.path.replace(UPLOAD_BASE_DIR + path.sep, '');

    const sql = `
        INSERT INTO attachments (
            biz_type, biz_id, is_primary, file_path, file_name,
            file_ext, mime_type, file_size, uploaded_by_officer_id, remark
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await pool.query(sql, [
        bizType,
        bizId,
        isPrimary ? 1 : 0,
        relativePath,
        file.originalname,
        path.extname(file.originalname),
        file.mimetype,
        file.size,
        officerId,
        remark || null
    ]);

    return result.insertId;
}

/**
 * 删除附件(包括物理文件和数据库记录)
 * @param {number} id - 附件ID
 * @returns {Promise<void>}
 */
async function deleteAttachment(id) {
    // 1. 先查询附件信息
    const attachment = await getAttachmentById(id);
    if (!attachment) {
        throw new AppError('NOT_FOUND', '附件不存在');
    }

    // 2. 删除物理文件
    const fullPath = path.join(UPLOAD_BASE_DIR, attachment.filePath);
    try {
        await fs.unlink(fullPath);
    } catch (err) {
        // 文件可能已被删除, 记录日志但不中断流程
        console.warn(`删除物理文件失败: ${fullPath}`, err.message);
    }

    // 3. 删除数据库记录
    const sql = 'DELETE FROM attachments WHERE id = ?';
    await pool.query(sql, [id]);
}

/**
 * 批量删除业务相关的所有附件(用于删除主业务记录时调用)
 * @param {string} bizType - 业务类型
 * @param {number} bizId - 业务ID
 * @returns {Promise<void>}
 */
async function deleteAttachmentsByBiz(bizType, bizId) {
    // 1. 查出所有附件
    const attachments = await listAttachments(bizType, bizId);

    // 2. 逐个删除物理文件
    for (const att of attachments) {
        const fullPath = path.join(UPLOAD_BASE_DIR, att.filePath);
        try {
            await fs.unlink(fullPath);
        } catch (err) {
            console.warn(`删除物理文件失败: ${fullPath}`, err.message);
        }
    }

    // 3. 批量删除数据库记录
    const sql = 'DELETE FROM attachments WHERE biz_type = ? AND biz_id = ?';
    await pool.query(sql, [bizType, bizId]);
}

/**
 * 更新附件备注或主附件标识
 * @param {number} id - 附件ID
 * @param {Object} updates - 更新字段 {isPrimary, remark}
 * @returns {Promise<void>}
 */
async function updateAttachment(id, updates) {
    const fields = [];
    const values = [];

    if (updates.isPrimary !== undefined) {
        fields.push('is_primary = ?');
        values.push(updates.isPrimary ? 1 : 0);
    }

    if (updates.remark !== undefined) {
        fields.push('remark = ?');
        values.push(updates.remark);
    }

    if (fields.length === 0) {
        return; // 无需更新
    }

    values.push(id);
    const sql = `UPDATE attachments SET ${fields.join(', ')} WHERE id = ?`;
    await pool.query(sql, values);
}

module.exports = {
    listAttachments,
    getAttachmentById,
    createAttachment,
    deleteAttachment,
    deleteAttachmentsByBiz,
    updateAttachment
};
