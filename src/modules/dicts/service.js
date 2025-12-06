// src/modules/dicts/service.js
const { pool } = require('../../config/db');
const {
    conflict,
    notFound,
    dbError,
    validationError
} = require('../../utils/errors');
const logger = require('../../utils/logger');

/**
 * 将 dict_items 行映射为接口定义的字段
 * data.items[]
 *  - id
 *  - itemCode
 *  - itemName
 *  - sort
 *  - remark
 *  - enabled
 */
function mapItemRow(row) {
    const enabled =
        row.is_enabled === 1 ||
        row.is_enabled === true ||
        row.is_enabled === '1';

    return {
        id: row.id,
        itemCode: row.item_code,
        itemName: row.item_name,
        sort: row.sort_order,
        remark: row.remark,
        enabled
    };
}

/**
 * 获取单个分类的字典项
 *  - code: dict_categories.code
 *  - includeDisabled: 是否包含停用项
 *  对应接口：GET /api/dicts/:code :contentReference[oaicite:2]{index=2}
 */
async function getItemsByCategoryCode(code, includeDisabled = false) {
    if (!code) {
        throw validationError('分类编码 code 不能为空', {
            fieldErrors: { code: 'code 不能为空' }
        });
    }

    // 查分类
    const [catRows] = await pool.query(
        `
            SELECT id, code, name, remark
            FROM dict_categories
            WHERE code = ?
                LIMIT 1
        `,
        [code]
    );

    const category = catRows[0];

    // 分类不存在：这里按“返回空数组”处理，而不是 404，方便前端调用链简单。:contentReference[oaicite:3]{index=3}
    if (!category) {
        return [];
    }

    const params = [category.id];
    let itemSql = `
        SELECT
            id,
            category_id,
            item_code,
            item_name,
            sort_order,
            remark,
            is_enabled
        FROM dict_items
        WHERE category_id = ?
    `;

    if (!includeDisabled) {
        itemSql += ' AND is_enabled = 1';
    }

    itemSql += ' ORDER BY sort_order ASC, id ASC';

    const [itemRows] = await pool.query(itemSql, params);
    return itemRows.map(mapItemRow);
}

/**
 * 批量获取多个分类的字典项
 *  - codes: string[]
 * 返回结构：
 * {
 *   CASE_TYPE: [ ... ],
 *   KEYPOP_TYPE: [ ... ]
 * }
 * 对应接口：GET /api/dicts?codes=CASE_TYPE,KEYPOP_TYPE,... :contentReference[oaicite:4]{index=4}
 */
async function getItemsByCategoryCodes(codes, includeDisabled = false) {
    const cleanCodes = Array.isArray(codes)
        ? Array.from(new Set(codes.map((c) => (c || '').trim()).filter(Boolean)))
        : [];

    if (!cleanCodes.length) {
        throw validationError('参数 codes 不能为空', {
            fieldErrors: { codes: '至少需要一个分类编码' }
        });
    }

    // 先查所有分类
    const [catRows] = await pool.query(
        `
            SELECT id, code, name, remark
            FROM dict_categories
            WHERE code IN (?)
        `,
        [cleanCodes]
    );

    const categoryIdByCode = {};
    const codeByCategoryId = {};
    catRows.forEach((c) => {
        categoryIdByCode[c.code] = c.id;
        codeByCategoryId[c.id] = c.code;
    });

    const result = {};
    cleanCodes.forEach((code) => {
        result[code] = []; // 即使分类不存在，也返回空数组，避免前端判断 key 是否存在。
    });

    const categoryIds = Object.values(categoryIdByCode);
    if (!categoryIds.length) {
        return result;
    }

    let itemSql = `
        SELECT
            id,
            category_id,
            item_code,
            item_name,
            sort_order,
            remark,
            is_enabled
        FROM dict_items
        WHERE category_id IN (?)
    `;
    const params = [categoryIds];

    if (!includeDisabled) {
        itemSql += ' AND is_enabled = 1';
    }

    itemSql += ' ORDER BY category_id ASC, sort_order ASC, id ASC';

    const [itemRows] = await pool.query(itemSql, params);

    itemRows.forEach((row) => {
        const code = codeByCategoryId[row.category_id];
        if (!code) return;
        result[code].push(mapItemRow(row));
    });

    return result;
}

/**
 * 字典分类列表（管理用）
 *  - 支持 keyword 模糊搜索 code / name
 */
async function listCategories(query) {
    const { keyword } = query || {};
    const where = [];
    const params = [];

    if (keyword) {
        where.push('(code LIKE ? OR name LIKE ?)');
        const like = `%${keyword}%`;
        params.push(like, like);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const sql = `
        SELECT id, code, name, remark
        FROM dict_categories
                 ${whereSql}
        ORDER BY code ASC
    `;

    const [rows] = await pool.query(sql, params);

    return rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        remark: row.remark
    }));
}

/**
 * 创建字典分类
 */
async function createCategory(data) {
    const { code, name, remark } = data;

    // 先查唯一性，避免撞 UNIQUE :contentReference[oaicite:5]{index=5}
    const [existsRows] = await pool.query(
        `
            SELECT id
            FROM dict_categories
            WHERE code = ?
                LIMIT 1
        `,
        [code]
    );
    if (existsRows.length) {
        throw conflict('分类编码已存在');
    }

    try {
        const [res] = await pool.query(
            `
                INSERT INTO dict_categories
                    (code, name, remark)
                VALUES (?, ?, ?)
            `,
            [code, name, remark || null]
        );

        return {
            id: res.insertId,
            code,
            name,
            remark: remark || null
        };
    } catch (err) {
        if (err && err.code === 'ER_DUP_ENTRY') {
            throw conflict('分类编码已存在');
        }
        logger.error('[dicts] createCategory error', { err });
        throw dbError('创建字典分类失败');
    }
}

/**
 * 更新字典分类
 */
async function updateCategory(id, data) {
    const [rows] = await pool.query(
        `
            SELECT id, code, name, remark
            FROM dict_categories
            WHERE id = ?
                LIMIT 1
        `,
        [id]
    );
    const existing = rows[0];
    if (!existing) {
        throw notFound('字典分类不存在');
    }

    const newCode =
        data.code !== undefined ? data.code : existing.code;
    const newName =
        data.name !== undefined ? data.name : existing.name;
    const newRemark =
        data.remark !== undefined ? data.remark : existing.remark;

    // 若修改了 code，需检查唯一性
    if (newCode !== existing.code) {
        const [existsRows] = await pool.query(
            `
                SELECT id
                FROM dict_categories
                WHERE code = ? AND id <> ?
                    LIMIT 1
            `,
            [newCode, id]
        );
        if (existsRows.length) {
            throw conflict('分类编码已存在');
        }
    }

    try {
        await pool.query(
            `
                UPDATE dict_categories
                SET code = ?, name = ?, remark = ?, updated_at = NOW()
                WHERE id = ?
            `,
            [newCode, newName, newRemark || null, id]
        );

        return {
            id,
            code: newCode,
            name: newName,
            remark: newRemark || null
        };
    } catch (err) {
        if (err && err.code === 'ER_DUP_ENTRY') {
            throw conflict('分类编码已存在');
        }
        logger.error('[dicts] updateCategory error', { err });
        throw dbError('更新字典分类失败');
    }
}

/**
 * 删除字典分类
 *  - DB 通过 ON DELETE CASCADE 自动删除所属 dict_items :contentReference[oaicite:6]{index=6}
 */
async function deleteCategory(id) {
    const [rows] = await pool.query(
        `
            SELECT id
            FROM dict_categories
            WHERE id = ?
                LIMIT 1
        `,
        [id]
    );
    if (!rows.length) {
        throw notFound('字典分类不存在');
    }

    await pool.query(
        `
            DELETE FROM dict_categories
            WHERE id = ?
        `,
        [id]
    );

    logger.warn('[dicts] deleteCategory %d (cascade items)', id);
    return true;
}

/**
 * 列出某分类下的字典项（管理用）
 */
async function listItemsByCategoryId(categoryId, includeDisabled = true) {
    // 确保分类存在
    const [catRows] = await pool.query(
        `
            SELECT id, code, name
            FROM dict_categories
            WHERE id = ?
                LIMIT 1
        `,
        [categoryId]
    );
    const category = catRows[0];
    if (!category) {
        throw validationError('所属分类不存在', {
            fieldErrors: { categoryId: '分类不存在' }
        });
    }

    let sql = `
        SELECT
            id,
            category_id,
            item_code,
            item_name,
            sort_order,
            remark,
            is_enabled
        FROM dict_items
        WHERE category_id = ?
    `;
    const params = [categoryId];

    if (!includeDisabled) {
        sql += ' AND is_enabled = 1';
    }

    sql += ' ORDER BY sort_order ASC, id ASC';

    const [rows] = await pool.query(sql, params);
    return rows.map(mapItemRow);
}

/**
 * 创建字典项
 */
async function createItem(data) {
    const {
        categoryId,
        itemCode,
        itemName,
        sort,
        remark,
        enabled
    } = data;

    // 分类存在性
    const [catRows] = await pool.query(
        `
    SELECT id
    FROM dict_categories
    WHERE id = ?
    LIMIT 1
  `,
        [categoryId]
    );
    if (!catRows.length) {
        throw validationError('所属分类不存在', {
            fieldErrors: { categoryId: '分类不存在' }
        });
    }

    // 唯一性：同一分类下 item_code 唯一 :contentReference[oaicite:7]{index=7}
    const [existsRows] = await pool.query(
        `
    SELECT id
    FROM dict_items
    WHERE category_id = ? AND item_code = ?
    LIMIT 1
  `,
        [categoryId, itemCode]
    );
    if (existsRows.length) {
        throw conflict('该分类下字典项编码已存在');
    }

    const isEnabledVal =
        typeof enabled === 'boolean' ? (enabled ? 1 : 0) : 1;
    const sortVal =
        typeof sort === 'number' && Number.isFinite(sort)
            ? sort
            : 0;

    try {
        const [res] = await pool.query(
            `
      INSERT INTO dict_items
      (category_id, item_code, item_name, sort_order, remark, is_enabled)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
            [
                categoryId,
                itemCode,
                itemName,
                sortVal,
                remark || null,
                isEnabledVal
            ]
        );

        return mapItemRow({
            id: res.insertId,
            category_id: categoryId,
            item_code: itemCode,
            item_name: itemName,
            sort_order: sortVal,
            remark: remark || null,
            is_enabled: isEnabledVal
        });
    } catch (err) {
        if (err && err.code === 'ER_DUP_ENTRY') {
            throw conflict('该分类下字典项编码已存在');
        }
        logger.error('[dicts] createItem error', { err });
        throw dbError('创建字典项失败');
    }
}

/**
 * 更新字典项
 */
async function updateItem(id, data) {
    const [rows] = await pool.query(
        `
    SELECT
      id,
      category_id,
      item_code,
      item_name,
      sort_order,
      remark,
      is_enabled
    FROM dict_items
    WHERE id = ?
    LIMIT 1
  `,
        [id]
    );
    const existing = rows[0];
    if (!existing) {
        throw notFound('字典项不存在');
    }

    const newCategoryId =
        data.categoryId !== undefined
            ? data.categoryId
            : existing.category_id;
    const newItemCode =
        data.itemCode !== undefined
            ? data.itemCode
            : existing.item_code;
    const newItemName =
        data.itemName !== undefined
            ? data.itemName
            : existing.item_name;
    const newSort =
        data.sort !== undefined ? data.sort : existing.sort_order;
    const newRemark =
        data.remark !== undefined ? data.remark : existing.remark;
    const newEnabled =
        typeof data.enabled === 'boolean'
            ? data.enabled
            : existing.is_enabled === 1 ||
            existing.is_enabled === true ||
            existing.is_enabled === '1';

    // 分类存在性
    const [catRows] = await pool.query(
        `
    SELECT id
    FROM dict_categories
    WHERE id = ?
    LIMIT 1
  `,
        [newCategoryId]
    );
    if (!catRows.length) {
        throw validationError('所属分类不存在', {
            fieldErrors: { categoryId: '分类不存在' }
        });
    }

    // 若 (categoryId, itemCode) 发生变化，检查联合唯一
    if (
        newCategoryId !== existing.category_id ||
        newItemCode !== existing.item_code
    ) {
        const [existsRows] = await pool.query(
            `
      SELECT id
      FROM dict_items
      WHERE category_id = ? AND item_code = ? AND id <> ?
      LIMIT 1
    `,
            [newCategoryId, newItemCode, id]
        );
        if (existsRows.length) {
            throw conflict('该分类下字典项编码已存在');
        }
    }

    const isEnabledVal = newEnabled ? 1 : 0;
    const sortVal =
        typeof newSort === 'number' && Number.isFinite(newSort)
            ? newSort
            : 0;

    try {
        await pool.query(
            `
      UPDATE dict_items
      SET
        category_id = ?,
        item_code = ?,
        item_name = ?,
        sort_order = ?,
        remark = ?,
        is_enabled = ?,
        updated_at = NOW()
      WHERE id = ?
    `,
            [
                newCategoryId,
                newItemCode,
                newItemName,
                sortVal,
                newRemark || null,
                isEnabledVal,
                id
            ]
        );

        return mapItemRow({
            id,
            category_id: newCategoryId,
            item_code: newItemCode,
            item_name: newItemName,
            sort_order: sortVal,
            remark: newRemark || null,
            is_enabled: isEnabledVal
        });
    } catch (err) {
        if (err && err.code === 'ER_DUP_ENTRY') {
            throw conflict('该分类下字典项编码已存在');
        }
        logger.error('[dicts] updateItem error', { err });
        throw dbError('更新字典项失败');
    }
}

/**
 * 删除字典项（允许物理删除）
 */
async function deleteItem(id) {
    const [rows] = await pool.query(
        `
    SELECT id
    FROM dict_items
    WHERE id = ?
    LIMIT 1
  `,
        [id]
    );
    if (!rows.length) {
        throw notFound('字典项不存在');
    }

    await pool.query(
        `
    DELETE FROM dict_items
    WHERE id = ?
  `,
        [id]
    );

    logger.warn('[dicts] deleteItem %d', id);
    return true;
}

module.exports = {
    getItemsByCategoryCode,
    getItemsByCategoryCodes,
    listCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    listItemsByCategoryId,
    createItem,
    updateItem,
    deleteItem
};
