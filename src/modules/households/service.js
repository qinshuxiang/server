// src/modules/households/service.js
const { pool } = require('../../config/db');
const {
    validationError,
    notFound,
    conflict,
    dbError,
} = require('../../utils/errors');

function normalizeIsRentalToNumber(value) {
    if (value === true || value === 1 || value === '1') return 1;
    if (value === false || value === 0 || value === '0') return 0;
    return null;
}

function normalizeIsRentalToBoolean(value) {
    return value === true || value === 1 || value === '1';
}

async function ensureHouseUnique({ communityId, buildingNo, unitNo, roomNo, excludeId }) {
    if (!communityId || !buildingNo || !unitNo || !roomNo) return;

    let sql = `
    SELECT id
    FROM community_households
    WHERE community_id = ?
      AND building_no = ?
      AND unit_no = ?
      AND room_no = ?
  `;
    const params = [communityId, buildingNo, unitNo, roomNo];

    if (excludeId) {
        sql += ' AND id <> ?';
        params.push(excludeId);
    }

    sql += ' LIMIT 1';

    const [rows] = await pool.query(sql, params);
    if (rows.length > 0) {
        throw conflict('同一社区内相同楼栋/单元/房号的房屋已存在');
    }
}

function handleHouseholdDbError(err) {
    if (err && err.code === 'ER_DUP_ENTRY') {
        // 针对可能存在的联合唯一约束（社区 + 楼栋 + 单元 + 房号）
        throw conflict('同一社区内相同楼栋/单元/房号的房屋已存在');
    }

    if (
        err &&
        (err.code === 'ER_NO_REFERENCED_ROW_2' ||
            err.code === 'ER_ROW_IS_REFERENCED_2')
    ) {
        throw validationError('关联数据不存在或仍被引用，操作失败');
    }

    throw dbError(err);
}

/**
 * 房屋列表
 */
async function listHouseholds(query) {
    const {
        communityId,
        policeOfficerId,
        isRental,
        houseTypeItemId,
        keyword,
        page = 1,
        pageSize = 20,
    } = query;

    const conditions = [];
    const params = [];

    if (communityId) {
        conditions.push('h.community_id = ?');
        params.push(communityId);
    }

    if (policeOfficerId) {
        conditions.push('h.police_officer_id = ?');
        params.push(policeOfficerId);
    }

    if (typeof isRental !== 'undefined' && isRental !== null) {
        const val = normalizeIsRentalToNumber(isRental);
        if (val === 0 || val === 1) {
            conditions.push('h.is_rental = ?');
            params.push(val);
        }
    }

    if (houseTypeItemId) {
        conditions.push('h.house_type_id = ?');
        params.push(houseTypeItemId);
    }

    if (keyword) {
        conditions.push(
            '(h.address LIKE ? OR h.householder_name LIKE ?)'
        );
        const like = `%${keyword}%`;
        params.push(like, like);
    }

    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countSql = `
    SELECT COUNT(*) AS total
    FROM community_households h
    ${whereSql}
  `;
    const [countRows] = await pool.query(countSql, params);
    const total = countRows[0]?.total || 0;

    const offset = (page - 1) * pageSize;

    const listSql = `
    SELECT
      h.id AS id,
      h.community_id AS communityId,
      c.community_name AS communityName,
      h.police_officer_id AS policeOfficerId,
      po.name AS policeOfficerName,
      h.address AS address,
      h.building_no AS buildingNo,
      h.unit_no AS unitNo,
      h.room_no AS roomNo,
      h.house_type_id AS houseTypeItemId,
      di.item_name AS houseTypeName,
      IF(h.is_rental = 1, TRUE, FALSE) AS isRental,
      h.householder_name AS householderName,
      h.householder_phone AS householderPhone,
      h.remark AS remark
    FROM community_households h
    LEFT JOIN communities c ON c.id = h.community_id
    LEFT JOIN police_officers po ON po.id = h.police_officer_id
    LEFT JOIN dict_items di ON di.id = h.house_type_id
    ${whereSql}
    ORDER BY
      h.community_id ASC,
      h.building_no ASC,
      h.unit_no ASC,
      h.room_no ASC,
      h.id ASC
    LIMIT ? OFFSET ?
  `;

    const listParams = params.slice();
    listParams.push(pageSize, offset);

    const [rows] = await pool.query(listSql, listParams);

    return {
        items: rows,
        total,
        page,
        pageSize,
    };
}

/**
 * 新增房屋
 */
async function createHousehold(data) {
    const {
        communityId,
        policeOfficerId,
        address,
        buildingNo,
        unitNo,
        roomNo,
        houseTypeItemId,
        isRental = false,
        householderName,
        householderPhone,
        remark,
    } = data;

    try {
        await ensureHouseUnique({
            communityId,
            buildingNo,
            unitNo,
            roomNo,
        });

        const insertSql = `
      INSERT INTO community_households (
        community_id,
        police_officer_id,
        address,
        building_no,
        unit_no,
        room_no,
        house_type_id,
        is_rental,
        householder_name,
        householder_phone,
        remark
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

        const rentalNum = normalizeIsRentalToNumber(isRental) ?? 0;

        const [result] = await pool.query(insertSql, [
            communityId,
            policeOfficerId || null,
            address,
            buildingNo || null,
            unitNo || null,
            roomNo || null,
            houseTypeItemId || null,
            rentalNum,
            householderName || null,
            householderPhone || null,
            remark || null,
        ]);

        return {
            id: result.insertId,
            communityId,
            policeOfficerId: policeOfficerId || null,
            address,
            buildingNo: buildingNo || null,
            unitNo: unitNo || null,
            roomNo: roomNo || null,
            houseTypeItemId: houseTypeItemId || null,
            isRental: !!rentalNum,
            householderName: householderName || null,
            householderPhone: householderPhone || null,
            remark: remark || null,
        };
    } catch (err) {
        if (err && err.isAppError) throw err;
        handleHouseholdDbError(err);
    }
}

/**
 * 更新房屋（部分字段更新）
 */
async function updateHousehold(id, data) {
    try {
        const [rows] = await pool.query(
            `
      SELECT
        id,
        community_id AS communityId,
        police_officer_id AS policeOfficerId,
        address,
        building_no AS buildingNo,
        unit_no AS unitNo,
        room_no AS roomNo,
        house_type_id AS houseTypeItemId,
        is_rental AS isRental,
        householder_name AS householderName,
        householder_phone AS householderPhone,
        remark
      FROM community_households
      WHERE id = ?
    `,
            [id]
        );

        if (!rows.length) {
            throw notFound('房屋不存在');
        }

        const existing = rows[0];
        const merged = {
            ...existing,
            isRental: normalizeIsRentalToBoolean(existing.isRental),
            ...data,
        };

        await ensureHouseUnique({
            communityId: merged.communityId,
            buildingNo: merged.buildingNo,
            unitNo: merged.unitNo,
            roomNo: merged.roomNo,
            excludeId: id,
        });

        const rentalNum =
            normalizeIsRentalToNumber(merged.isRental) ??
            normalizeIsRentalToNumber(existing.isRental) ??
            0;

        const updateSql = `
      UPDATE community_households
      SET
        community_id = ?,
        police_officer_id = ?,
        address = ?,
        building_no = ?,
        unit_no = ?,
        room_no = ?,
        house_type_id = ?,
        is_rental = ?,
        householder_name = ?,
        householder_phone = ?,
        remark = ?
      WHERE id = ?
    `;

        await pool.query(updateSql, [
            merged.communityId,
            merged.policeOfficerId || null,
            merged.address,
            merged.buildingNo || null,
            merged.unitNo || null,
            merged.roomNo || null,
            merged.houseTypeItemId || null,
            rentalNum,
            merged.householderName || null,
            merged.householderPhone || null,
            merged.remark || null,
            id,
        ]);

        return {
            id,
            communityId: merged.communityId,
            policeOfficerId: merged.policeOfficerId || null,
            address: merged.address,
            buildingNo: merged.buildingNo || null,
            unitNo: merged.unitNo || null,
            roomNo: merged.roomNo || null,
            houseTypeItemId: merged.houseTypeItemId || null,
            isRental: !!rentalNum,
            householderName: merged.householderName || null,
            householderPhone: merged.householderPhone || null,
            remark: merged.remark || null,
        };
    } catch (err) {
        if (err && err.isAppError) throw err;
        handleHouseholdDbError(err);
    }
}

module.exports = {
    listHouseholds,
    createHousehold,
    updateHousehold,
};
