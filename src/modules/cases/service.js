// src/modules/cases/service.js
const { pool, withTransaction } = require('../../config/db');
const {
    validationError,
    notFound,
    conflict,
    dbError,
    forbidden,
} = require('../../utils/errors');

/**
 * 简单判断当前用户是否拥有某个权限编码
 */
function hasPermission(user, code) {
    if (!user || !Array.isArray(user.permissions)) return false;
    return user.permissions.includes(code);
}

function isNil(value) {
    return value === null || typeof value === 'undefined';
}

/**
 * 业务规则校验：
 * - deadlineDate >= receivedDate
 * - status = '已结' 时必须有 closedDate & resultItemId
 * - status = '移交' 时必须有 transferTarget & transferDate
 * - status = '存档' 时必须有 archiveLocation & archiveDate
 */
function validateCaseBusinessRules(caseData) {
    const {
        receivedDate,
        deadlineDate,
        status = '在办',
        closedDate,
        resultItemId,
        transferTarget,
        transferDate,
        archiveLocation,
        archiveDate,
    } = caseData;

    // 截止日期不得早于受案日期
    if (deadlineDate && receivedDate && deadlineDate < receivedDate) {
        throw validationError('办理截止日期不能早于受案日期', {
            fieldErrors: {
                deadlineDate: '截止日期不能早于受案日期',
            },
        });
    }

    // 已结案件必须有结案日期和处理结果
    if (status === '已结') {
        if (!closedDate || isNil(resultItemId)) {
            throw validationError('已结案件必须填写结案日期和结案结果', {
                fieldErrors: {
                    closedDate: !closedDate ? '结案日期必填' : undefined,
                    resultItemId: isNil(resultItemId) ? '处理结果必填' : undefined,
                },
            });
        }
    }

    // 移交案件必须有移交去向和时间
    if (status === '移交') {
        if (!transferTarget || !transferDate) {
            throw validationError('移交状态必须填写移交去向和移交时间', {
                fieldErrors: {
                    transferTarget: !transferTarget ? '移交去向必填' : undefined,
                    transferDate: !transferDate ? '移交时间必填' : undefined,
                },
            });
        }
    }

    // 存档案件必须有存档位置和日期
    if (status === '存档') {
        if (!archiveLocation || !archiveDate) {
            throw validationError('存档状态必须填写存档位置和存档日期', {
                fieldErrors: {
                    archiveLocation: !archiveLocation ? '存档位置必填' : undefined,
                    archiveDate: !archiveDate ? '存档日期必填' : undefined,
                },
            });
        }
    }
}

/**
 * 将 MySQL 异常转换为统一错误
 */
function handleCaseDbError(err) {
    if (err && err.code === 'ER_DUP_ENTRY') {
        // 案件编号唯一约束
        if (err.message && err.message.includes('uk_case_no')) {
            throw conflict('案件编号已存在', {
                fieldErrors: { caseNo: '案件编号已存在' },
            });
        }
        throw conflict('唯一约束冲突');
    }

    // MySQL 8.0+ CHECK 约束
    if (err && err.code === 'ER_CHECK_CONSTRAINT') {
        throw validationError('案件数据不符合业务规则', {
            raw: err.sqlMessage,
        });
    }

    // 外键约束错误
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
 * 列表查询：我的案件 / 全部案件
 */
async function listCases(query, currentUser) {
    const {
        keyword,
        caseTypeItemId,
        status,
        receivedFrom,
        receivedTo,
        mainOfficerId,
        scope = 'my',
        page = 1,
        pageSize = 20,
    } = query;

    const canViewAll = hasPermission(currentUser, 'case:view_all');
    const effectiveScope = scope === 'all' && canViewAll ? 'all' : 'my';

    const conditions = [];
    const params = [];

    if (keyword) {
        conditions.push('(cr.case_name LIKE ? OR cr.case_no LIKE ?)');
        const like = `%${keyword}%`;
        params.push(like, like);
    }

    if (caseTypeItemId) {
        conditions.push('cr.case_type_item_id = ?');
        params.push(caseTypeItemId);
    }

    if (status) {
        conditions.push('cr.status = ?');
        params.push(status);
    }

    if (receivedFrom) {
        conditions.push('cr.received_date >= ?');
        params.push(receivedFrom);
    }

    if (receivedTo) {
        conditions.push('cr.received_date <= ?');
        params.push(receivedTo);
    }

    // mainOfficerId 仅管理员可用（具有 case:view_all）
    if (mainOfficerId && canViewAll) {
        conditions.push('cr.main_officer_id = ?');
        params.push(mainOfficerId);
    }

    // "我的案件"：主办民警或案件参与民警
    if (effectiveScope === 'my') {
        conditions.push(
            '(cr.main_officer_id = ? OR EXISTS (SELECT 1 FROM case_officers co WHERE co.case_id = cr.id AND co.officer_id = ?))'
        );
        params.push(currentUser.id, currentUser.id);
    }

    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const baseFromSql = `
    FROM case_records cr
    LEFT JOIN dict_items caseType ON caseType.id = cr.case_type_item_id
    LEFT JOIN dict_items resultItem ON resultItem.id = cr.result_item_id
    LEFT JOIN police_officers mainOfficer ON mainOfficer.id = cr.main_officer_id
    ${whereSql}
  `;

    // 总数
    const countSql = `SELECT COUNT(*) AS total ${baseFromSql}`;
    const [countRows] = await pool.query(countSql, params);
    const total = countRows[0]?.total || 0;

    const offset = (page - 1) * pageSize;

    // 列表
    const listSql = `
    SELECT
      cr.id AS id,
      cr.case_no AS caseNo,
      cr.case_name AS caseName,
      cr.case_type_item_id AS caseTypeItemId,
      caseType.item_name AS caseTypeName,
      cr.main_officer_id AS mainOfficerId,
      mainOfficer.name AS mainOfficerName,
      cr.received_date AS receivedDate,
      cr.deadline_date AS deadlineDate,
      cr.closed_date AS closedDate,
      cr.status AS status,
      cr.result_item_id AS resultItemId,
      resultItem.item_name AS resultName
    ${baseFromSql}
    ORDER BY
      FIELD(cr.status, '在办','移交','存档','已结'),
      cr.deadline_date IS NULL,
      cr.deadline_date ASC,
      cr.id DESC
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
 * 获取案件详情（主表 + 办案民警 + 涉及人员）
 * 权限：案件参与者或具有 case:view_all
 */
async function getCaseDetail(id, currentUser) {
    const caseSql = `
    SELECT
      cr.id AS id,
      cr.case_no AS caseNo,
      cr.case_name AS caseName,
      cr.case_type_item_id AS caseTypeItemId,
      cr.main_officer_id AS mainOfficerId,
      cr.received_date AS receivedDate,
      cr.deadline_date AS deadlineDate,
      cr.closed_date AS closedDate,
      cr.result_item_id AS resultItemId,
      cr.description AS description,
      cr.status AS status,
      cr.transfer_target AS transferTarget,
      cr.transfer_receiver AS transferReceiver,
      cr.transfer_date AS transferDate,
      cr.transfer_return_date AS transferReturnDate,
      cr.transfer_note AS transferNote,
      cr.archive_location AS archiveLocation,
      cr.archive_date AS archiveDate,
      cr.created_at AS createdAt,
      cr.updated_at AS updatedAt,
      caseType.item_name AS caseTypeName,
      resultItem.item_name AS resultName,
      mainOfficer.name AS mainOfficerName
    FROM case_records cr
    LEFT JOIN dict_items caseType ON caseType.id = cr.case_type_item_id
    LEFT JOIN dict_items resultItem ON resultItem.id = cr.result_item_id
    LEFT JOIN police_officers mainOfficer ON mainOfficer.id = cr.main_officer_id
    WHERE cr.id = ?
  `;

    const [caseRows] = await pool.query(caseSql, [id]);

    if (!caseRows.length) {
        throw notFound('案件不存在');
    }

    const caseRow = caseRows[0];

    const canViewAll = hasPermission(currentUser, 'case:view_all');

    if (!canViewAll) {
        const isMain = caseRow.mainOfficerId === currentUser.id;

        let isParticipant = isMain;
        if (!isParticipant) {
            const [coRows] = await pool.query(
                'SELECT 1 FROM case_officers WHERE case_id = ? AND officer_id = ? LIMIT 1',
                [id, currentUser.id]
            );
            isParticipant = coRows.length > 0;
        }

        if (!isParticipant) {
            throw forbidden('无权查看该案件');
        }
    }

    const officersSql = `
    SELECT
      co.id AS id,
      co.officer_id AS officerId,
      o.name AS officerName,
      co.role AS role,
      co.remark AS remark
    FROM case_officers co
    LEFT JOIN police_officers o ON o.id = co.officer_id
    WHERE co.case_id = ?
    ORDER BY co.id ASC
  `;

    const personsSql = `
    SELECT
      cp.id AS id,
      cp.name AS name,
      cp.id_no AS idNo,
      cp.contact AS contact,
      cp.role_item_id AS roleItemId,
      cp.remark AS remark
    FROM case_persons cp
    WHERE cp.case_id = ?
    ORDER BY cp.id ASC
  `;

    const [officersRows] = await pool.query(officersSql, [id]);
    const [personsRows] = await pool.query(personsSql, [id]);

    return {
        case: caseRow,
        officers: officersRows,
        persons: personsRows,
    };
}

/**
 * 创建案件（主表 + 办案民警 + 涉及人员），必须使用事务
 */
async function createCase(data, currentUser) {
    const {
        caseNo,
        caseName,
        caseTypeItemId,
        mainOfficerId,
        receivedDate,
        deadlineDate,
        description,
        status,
        resultItemId,
        transferTarget,
        transferReceiver,
        transferDate,
        transferReturnDate,
        transferNote,
        archiveLocation,
        archiveDate,
        closedDate,
        officers = [],
        persons = [],
    } = data;

    // 先做业务规则校验（状态/日期等）
    const caseForCheck = {
        receivedDate,
        deadlineDate,
        status: status || '在办',
        closedDate,
        resultItemId,
        transferTarget,
        transferDate,
        archiveLocation,
        archiveDate,
    };
    validateCaseBusinessRules(caseForCheck);

    try {
        // 先手动检查案件编号是否重复，避免直接撞 UNIQUE
        if (caseNo) {
            const [existsRows] = await pool.query(
                'SELECT id FROM case_records WHERE case_no = ? LIMIT 1',
                [caseNo]
            );
            if (existsRows.length > 0) {
                throw conflict('案件编号已存在', {
                    fieldErrors: { caseNo: '案件编号已存在' },
                });
            }
        }

        const caseId = await withTransaction(async (conn) => {
            const insertCaseSql = `
        INSERT INTO case_records (
          case_no,
          case_name,
          case_type_item_id,
          main_officer_id,
          received_date,
          deadline_date,
          description,
          status,
          result_item_id,
          transfer_target,
          transfer_receiver,
          transfer_date,
          transfer_return_date,
          transfer_note,
          archive_location,
          archive_date,
          closed_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

            const [result] = await conn.query(insertCaseSql, [
                caseNo,
                caseName,
                caseTypeItemId,
                mainOfficerId,
                receivedDate,
                deadlineDate || null,
                description || null,
                status || '在办',
                resultItemId || null,
                transferTarget || null,
                transferReceiver || null,
                transferDate || null,
                transferReturnDate || null,
                transferNote || null,
                archiveLocation || null,
                archiveDate || null,
                closedDate || null,
            ]);

            const newCaseId = result.insertId;

            // 插入案件参与民警
            const officersList = Array.isArray(officers) ? officers : [];
            let hasMainInOfficers = false;

            for (const officer of officersList) {
                if (officer.officerId === mainOfficerId) {
                    hasMainInOfficers = true;
                }
                await conn.query(
                    `
          INSERT INTO case_officers (case_id, officer_id, role, remark)
          VALUES (?, ?, ?, ?)
        `,
                    [
                        newCaseId,
                        officer.officerId,
                        officer.role || null,
                        officer.remark || null,
                    ]
                );
            }

            // 确保主办民警一定出现在参与民警列表中
            if (!hasMainInOfficers) {
                await conn.query(
                    `
          INSERT INTO case_officers (case_id, officer_id, role, remark)
          VALUES (?, ?, ?, ?)
        `,
                    [newCaseId, mainOfficerId, '主办', null]
                );
            }

            // 插入案件涉及人员
            const personsList = Array.isArray(persons) ? persons : [];
            for (const person of personsList) {
                await conn.query(
                    `
          INSERT INTO case_persons (
            case_id,
            name,
            id_no,
            contact,
            role_item_id,
            remark
          ) VALUES (?, ?, ?, ?, ?, ?)
        `,
                    [
                        newCaseId,
                        person.name,
                        person.idNo || null,
                        person.contact || null,
                        person.roleItemId,
                        person.remark || null,
                    ]
                );
            }

            return newCaseId;
        });

        return { id: caseId };
    } catch (err) {
        if (err && err.isAppError) {
            throw err;
        }
        handleCaseDbError(err);
    }
}

/**
 * 更新案件（支持部分字段），如更新 officers/persons，使用“先删后插”的方式
 */
async function updateCase(id, data, currentUser) {
    try {
        // 查询当前案件
        const [caseRows] = await pool.query(
            `
      SELECT
        id,
        case_no AS caseNo,
        case_name AS caseName,
        case_type_item_id AS caseTypeItemId,
        main_officer_id AS mainOfficerId,
        received_date AS receivedDate,
        deadline_date AS deadlineDate,
        closed_date AS closedDate,
        result_item_id AS resultItemId,
        description AS description,
        status AS status,
        transfer_target AS transferTarget,
        transfer_receiver AS transferReceiver,
        transfer_date AS transferDate,
        transfer_return_date AS transferReturnDate,
        transfer_note AS transferNote,
        archive_location AS archiveLocation,
        archive_date AS archiveDate
      FROM case_records
      WHERE id = ?
    `,
            [id]
        );

        if (!caseRows.length) {
            throw notFound('案件不存在');
        }

        const existingCase = caseRows[0];

        // 权限：主办民警 或 具有 case:view_all（可视为管理员）
        const isMain = existingCase.mainOfficerId === currentUser.id;
        const isAdmin = hasPermission(currentUser, 'case:view_all');

        if (!isMain && !isAdmin) {
            throw forbidden('无权修改该案件');
        }

        // 如果要修改案件编号，需要检查唯一
        if (data.caseNo && data.caseNo !== existingCase.caseNo) {
            const [existsRows] = await pool.query(
                'SELECT id FROM case_records WHERE case_no = ? AND id <> ? LIMIT 1',
                [data.caseNo, id]
            );
            if (existsRows.length > 0) {
                throw conflict('案件编号已存在', {
                    fieldErrors: { caseNo: '案件编号已存在' },
                });
            }
        }

        // 合并后的案件状态，用于业务规则校验
        const mergedCase = {
            ...existingCase,
            ...data,
        };

        validateCaseBusinessRules(mergedCase);

        await withTransaction(async (conn) => {
            // 更新主表
            const updateSql = `
        UPDATE case_records
        SET
          case_no = ?,
          case_name = ?,
          case_type_item_id = ?,
          main_officer_id = ?,
          received_date = ?,
          deadline_date = ?,
          description = ?,
          status = ?,
          result_item_id = ?,
          transfer_target = ?,
          transfer_receiver = ?,
          transfer_date = ?,
          transfer_return_date = ?,
          transfer_note = ?,
          archive_location = ?,
          archive_date = ?,
          closed_date = ?
        WHERE id = ?
      `;

            await conn.query(updateSql, [
                mergedCase.caseNo,
                mergedCase.caseName,
                mergedCase.caseTypeItemId,
                mergedCase.mainOfficerId,
                mergedCase.receivedDate,
                mergedCase.deadlineDate || null,
                mergedCase.description || null,
                mergedCase.status || '在办',
                mergedCase.resultItemId || null,
                mergedCase.transferTarget || null,
                mergedCase.transferReceiver || null,
                mergedCase.transferDate || null,
                mergedCase.transferReturnDate || null,
                mergedCase.transferNote || null,
                mergedCase.archiveLocation || null,
                mergedCase.archiveDate || null,
                mergedCase.closedDate || null,
                id,
            ]);

            // 如有传入 officers 字段，则按“先删后插”重新维护
            if (typeof data.officers !== 'undefined') {
                await conn.query('DELETE FROM case_officers WHERE case_id = ?', [id]);

                const officersList = Array.isArray(data.officers) ? data.officers : [];
                let hasMainInOfficers = false;

                for (const officer of officersList) {
                    if (officer.officerId === mergedCase.mainOfficerId) {
                        hasMainInOfficers = true;
                    }
                    await conn.query(
                        `
            INSERT INTO case_officers (case_id, officer_id, role, remark)
            VALUES (?, ?, ?, ?)
          `,
                        [
                            id,
                            officer.officerId,
                            officer.role || null,
                            officer.remark || null,
                        ]
                    );
                }

                if (!hasMainInOfficers) {
                    await conn.query(
                        `
            INSERT INTO case_officers (case_id, officer_id, role, remark)
            VALUES (?, ?, ?, ?)
          `,
                        [id, mergedCase.mainOfficerId, '主办', null]
                    );
                }
            }

            // 如有传入 persons 字段，则按“先删后插”重新维护
            if (typeof data.persons !== 'undefined') {
                await conn.query('DELETE FROM case_persons WHERE case_id = ?', [id]);

                const personsList = Array.isArray(data.persons) ? data.persons : [];
                for (const person of personsList) {
                    await conn.query(
                        `
            INSERT INTO case_persons (
              case_id,
              name,
              id_no,
              contact,
              role_item_id,
              remark
            ) VALUES (?, ?, ?, ?, ?, ?)
          `,
                        [
                            id,
                            person.name,
                            person.idNo || null,
                            person.contact || null,
                            person.roleItemId,
                            person.remark || null,
                        ]
                    );
                }
            }
        });

        return { id };
    } catch (err) {
        if (err && err.isAppError) throw err;
        handleCaseDbError(err);
    }
}

/**
 * 删除案件：
 * - 通常只允许删除状态为“草稿”或误录的案件，这里保守处理为：仅在状态为 "在办" 时允许删除
 *   （如以后增加草稿状态，可在此扩展）
 */
async function deleteCase(id, currentUser) {
    try {
        const [rows] = await pool.query(
            `
      SELECT
        id,
        main_officer_id AS mainOfficerId,
        status
      FROM case_records
      WHERE id = ?
    `,
            [id]
        );

        if (!rows.length) {
            throw notFound('案件不存在');
        }

        const record = rows[0];

        const isMain = record.mainOfficerId === currentUser.id;
        const isAdmin = hasPermission(currentUser, 'case:view_all');

        if (!isMain && !isAdmin) {
            throw forbidden('无权删除该案件');
        }

        // 仅允许删除状态为在办的案件（防止误删历史案件）
        if (record.status !== '在办') {
            throw validationError('仅允许删除状态为“在办”的案件', {
                fieldErrors: {
                    status: '仅允许删除状态为“在办”的案件',
                },
            });
        }

        await withTransaction(async (conn) => {
            // 若外键设置 ON DELETE CASCADE，这里删除主表即可自动删除 case_officers / case_persons
            await conn.query('DELETE FROM case_records WHERE id = ?', [id]);
        });

        return { id };
    } catch (err) {
        if (err && err.isAppError) throw err;
        handleCaseDbError(err);
    }
}

module.exports = {
    listCases,
    getCaseDetail,
    createCase,
    updateCase,
    deleteCase,
};
