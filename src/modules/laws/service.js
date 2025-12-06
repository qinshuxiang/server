const pool = require('../../config/db');
const { AppError } = require('../../utils/errors');

/**
 * 查询法律条文列表(支持分页和全文搜索)
 * @param {Object} query - 查询条件
 * @returns {Promise<Object>}
 */
async function listLawArticles(query) {
    const {
        keyword,
        lawName,
        lawCategory,
        isValid,
        publishAgency,
        page = 1,
        pageSize = 20
    } = query;

    const conditions = [];
    const params = [];

    // 关键字搜索(法规名称或内容全文搜索)
    if (keyword) {
        // 使用FULLTEXT全文搜索(针对content字段)
        // 同时对law_name进行模糊搜索
        conditions.push('(la.law_name LIKE ? OR MATCH(la.content) AGAINST(? IN NATURAL LANGUAGE MODE))');
        params.push(`%${keyword}%`, keyword);
    }

    // 法规名称精确筛选
    if (lawName) {
        conditions.push('la.law_name = ?');
        params.push(lawName);
    }

    // 法规类别筛选
    if (lawCategory) {
        conditions.push('la.law_category = ?');
        params.push(lawCategory);
    }

    // 是否有效筛选
    if (isValid !== undefined) {
        conditions.push('la.is_valid = ?');
        params.push(isValid ? 1 : 0);
    }

    // 发布机关筛选
    if (publishAgency) {
        conditions.push('la.publish_agency LIKE ?');
        params.push(`%${publishAgency}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 查询总数
    const countSql = `SELECT COUNT(*) as total FROM law_articles la ${whereClause}`;
    const [countResult] = await pool.query(countSql, params);
    const total = countResult[0].total;

    // 分页查询
    const limit = Math.min(pageSize, 100);
    const offset = (page - 1) * limit;

    const sql = `
    SELECT 
      la.id,
      la.law_name AS lawName,
      la.law_category AS lawCategory,
      la.publish_agency AS publishAgency,
      la.effective_date AS effectiveDate,
      la.expired_date AS expiredDate,
      la.is_valid AS isValid,
      la.article_no AS articleNo,
      la.content,
      la.created_at AS createdAt,
      la.updated_at AS updatedAt
    FROM law_articles la
    ${whereClause}
    ORDER BY la.is_valid DESC, la.effective_date DESC, la.id DESC
    LIMIT ? OFFSET ?
  `;

    const [rows] = await pool.query(sql, [...params, limit, offset]);

    return {
        items: rows,
        total,
        page,
        pageSize: limit
    };
}

/**
 * 获取法律条文详情
 * @param {number} id - 条文ID
 * @returns {Promise<Object|null>}
 */
async function getLawArticleById(id) {
    const sql = `
    SELECT 
      la.id,
      la.law_name AS lawName,
      la.law_category AS lawCategory,
      la.publish_agency AS publishAgency,
      la.effective_date AS effectiveDate,
      la.expired_date AS expiredDate,
      la.is_valid AS isValid,
      la.article_no AS articleNo,
      la.content,
      la.created_at AS createdAt,
      la.updated_at AS updatedAt
    FROM law_articles la
    WHERE la.id = ?
  `;

    const [rows] = await pool.query(sql, [id]);
    return rows[0] || null;
}

/**
 * 创建法律条文
 * @param {Object} data - 条文数据
 * @returns {Promise<number>} 条文ID
 */
async function createLawArticle(data) {
    const {
        lawName,
        lawCategory,
        publishAgency,
        effectiveDate,
        expiredDate,
        isValid = true,
        articleNo,
        content
    } = data;

    // 业务校验:生效日期不能晚于失效日期
    if (effectiveDate && expiredDate && effectiveDate > expiredDate) {
        throw new AppError('VALIDATION_ERROR', '生效日期不能晚于失效日期');
    }

    const sql = `
    INSERT INTO law_articles (
      law_name, law_category, publish_agency,
      effective_date, expired_date, is_valid,
      article_no, content
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

    const [result] = await pool.query(sql, [
        lawName,
        lawCategory || null,
        publishAgency || null,
        effectiveDate || null,
        expiredDate || null,
        isValid ? 1 : 0,
        articleNo || null,
        content || null
    ]);

    return result.insertId;
}

/**
 * 更新法律条文
 * @param {number} id - 条文ID
 * @param {Object} data - 更新数据
 * @returns {Promise<void>}
 */
async function updateLawArticle(id, data) {
    const {
        lawName,
        lawCategory,
        publishAgency,
        effectiveDate,
        expiredDate,
        isValid,
        articleNo,
        content
    } = data;

    // 业务校验
    if (effectiveDate && expiredDate && effectiveDate > expiredDate) {
        throw new AppError('VALIDATION_ERROR', '生效日期不能晚于失效日期');
    }

    const sql = `
    UPDATE law_articles SET
      law_name = ?,
      law_category = ?,
      publish_agency = ?,
      effective_date = ?,
      expired_date = ?,
      is_valid = ?,
      article_no = ?,
      content = ?
    WHERE id = ?
  `;

    await pool.query(sql, [
        lawName,
        lawCategory || null,
        publishAgency || null,
        effectiveDate || null,
        expiredDate || null,
        isValid ? 1 : 0,
        articleNo || null,
        content || null,
        id
    ]);
}

/**
 * 删除法律条文
 * @param {number} id - 条文ID
 * @returns {Promise<void>}
 */
async function deleteLawArticle(id) {
    const sql = 'DELETE FROM law_articles WHERE id = ?';
    await pool.query(sql, [id]);
}

/**
 * 批量导入法律条文
 * @param {Array} articles - 条文数组
 * @returns {Promise<Object>} 导入结果统计
 */
async function batchImportLawArticles(articles) {
    const conn = await pool.getConnection();
    let successCount = 0;
    let failCount = 0;
    const errors = [];

    try {
        await conn.beginTransaction();

        for (let i = 0; i < articles.length; i++) {
            try {
                const article = articles[i];

                // 基本校验
                if (!article.lawName) {
                    throw new Error('法规名称不能为空');
                }

                // 日期校验
                if (article.effectiveDate && article.expiredDate &&
                    article.effectiveDate > article.expiredDate) {
                    throw new Error('生效日期不能晚于失效日期');
                }

                const sql = `
          INSERT INTO law_articles (
            law_name, law_category, publish_agency,
            effective_date, expired_date, is_valid,
            article_no, content
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;

                await conn.query(sql, [
                    article.lawName,
                    article.lawCategory || null,
                    article.publishAgency || null,
                    article.effectiveDate || null,
                    article.expiredDate || null,
                    article.isValid !== false ? 1 : 0,
                    article.articleNo || null,
                    article.content || null
                ]);

                successCount++;
            } catch (err) {
                failCount++;
                errors.push({
                    index: i + 1,
                    lawName: articles[i].lawName || '未知',
                    error: err.message
                });
            }
        }

        await conn.commit();
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }

    return {
        total: articles.length,
        successCount,
        failCount,
        errors
    };
}

/**
 * 获取法规名称列表(去重)
 * @returns {Promise<Array>} 法规名称数组
 */
async function getLawNames() {
    const sql = `
    SELECT DISTINCT law_name AS lawName
    FROM law_articles
    WHERE law_name IS NOT NULL AND law_name != ''
    ORDER BY law_name
  `;

    const [rows] = await pool.query(sql);
    return rows.map(row => row.lawName);
}

/**
 * 获取法规类别列表(去重)
 * @returns {Promise<Array>} 法规类别数组
 */
async function getLawCategories() {
    const sql = `
    SELECT DISTINCT law_category AS lawCategory
    FROM law_articles
    WHERE law_category IS NOT NULL AND law_category != ''
    ORDER BY law_category
  `;

    const [rows] = await pool.query(sql);
    return rows.map(row => row.lawCategory);
}

/**
 * 全文搜索法律条文(高级搜索)
 * @param {string} keyword - 搜索关键字
 * @param {number} limit - 返回条数限制
 * @returns {Promise<Array>}
 */
async function fullTextSearch(keyword, limit = 20) {
    if (!keyword || keyword.trim().length === 0) {
        return [];
    }

    const sql = `
    SELECT 
      la.id,
      la.law_name AS lawName,
      la.law_category AS lawCategory,
      la.article_no AS articleNo,
      la.content,
      MATCH(la.content) AGAINST(? IN NATURAL LANGUAGE MODE) AS relevance
    FROM law_articles la
    WHERE MATCH(la.content) AGAINST(? IN NATURAL LANGUAGE MODE)
      AND la.is_valid = 1
    ORDER BY relevance DESC
    LIMIT ?
  `;

    const [rows] = await pool.query(sql, [keyword, keyword, limit]);
    return rows;
}

/**
 * 标记法规为失效
 * @param {number} id - 条文ID
 * @param {string} expiredDate - 失效日期
 * @returns {Promise<void>}
 */
async function markAsInvalid(id, expiredDate) {
    const sql = `
    UPDATE law_articles 
    SET is_valid = 0, expired_date = ?
    WHERE id = ?
  `;

    await pool.query(sql, [expiredDate, id]);
}

module.exports = {
    listLawArticles,
    getLawArticleById,
    createLawArticle,
    updateLawArticle,
    deleteLawArticle,
    batchImportLawArticles,
    getLawNames,
    getLawCategories,
    fullTextSearch,
    markAsInvalid
};
