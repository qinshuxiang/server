'use strict';

const { pool } = require('../../config/db'); // ✅ 改成解构 pool :contentReference[oaicite:2]{index=2}

async function getTodayOverview(currentUser) {
    const officerId = currentUser && currentUser.id;
    if (!officerId) {
        throw new Error('当前登录用户缺少 id，无法统计个人相关数据');
    }

    const sqlMyCasesTotalInProgress = `
        SELECT COUNT(*) AS count
        FROM case_records cr
        WHERE cr.status = '在办'
          AND (
            cr.main_officer_id = ?
           OR EXISTS (
            SELECT 1
            FROM case_officers co
            WHERE co.case_id = cr.id
          AND co.officer_id = ?
            )
            )
    `;

    const sqlMyCasesNearDeadline = `
        SELECT COUNT(*) AS count
        FROM case_records cr
        WHERE cr.status = '在办'
          AND cr.deadline_date IS NOT NULL
          AND cr.deadline_date <= DATE_ADD(CURDATE(), INTERVAL 3 DAY)
          AND (
            cr.main_officer_id = ?
           OR EXISTS (
            SELECT 1
            FROM case_officers co
            WHERE co.case_id = cr.id
          AND co.officer_id = ?
            )
            )
    `;

    const sqlKeypopToVisitToday = `
        SELECT COUNT(*) AS count
        FROM key_populations kp
        WHERE kp.is_key_population = 1
          AND kp.control_officer_id = ?
          AND kp.next_visit_date = CURDATE()
    `;

    const sqlKeypopOverdue = `
        SELECT COUNT(*) AS count
        FROM key_populations kp
        WHERE kp.is_key_population = 1
          AND kp.control_officer_id = ?
          AND kp.next_visit_date IS NOT NULL
          AND kp.next_visit_date < CURDATE()
    `;

    // 规则说明：
    // - 未巡查场所：从未产生巡查记录的九小场所
    // - 隐患未整改场所：存在 has_hidden_danger=1 且 rectified_date 仍为 NULL 的巡查记录的场所 :contentReference[oaicite:3]{index=3}
    const sqlNineSmallNeverInspected = `
        SELECT COUNT(*) AS count
        FROM nine_small_places p
            LEFT JOIN nine_small_inspections i ON i.place_id = p.id
        WHERE i.id IS NULL
    `;

    const sqlNineSmallUnrectified = `
        SELECT COUNT(DISTINCT i.place_id) AS count
        FROM nine_small_inspections i
        WHERE i.has_hidden_danger = 1
          AND i.rectified_date IS NULL
    `;

    const sqlDailyLogToday = `
        SELECT COUNT(*) AS count
        FROM daily_logs dl
        WHERE dl.officer_id = ?
          AND dl.log_date = CURDATE()
    `;

    try {
        const [
            [myCasesTotalRows],
            [myCasesNearDeadlineRows],
            [keypopTodayRows],
            [keypopOverdueRows],
            [nineNeverInspectedRows],
            [nineUnrectifiedRows],
            [dailyLogRows],
        ] = await Promise.all([
            pool.query(sqlMyCasesTotalInProgress, [officerId, officerId]),
            pool.query(sqlMyCasesNearDeadline, [officerId, officerId]),
            pool.query(sqlKeypopToVisitToday, [officerId]),
            pool.query(sqlKeypopOverdue, [officerId]),
            pool.query(sqlNineSmallNeverInspected),
            pool.query(sqlNineSmallUnrectified),
            pool.query(sqlDailyLogToday, [officerId]),
        ]);

        const totalInProgress = myCasesTotalRows[0]?.count
            ? Number(myCasesTotalRows[0].count)
            : 0;
        const nearDeadline = myCasesNearDeadlineRows[0]?.count
            ? Number(myCasesNearDeadlineRows[0].count)
            : 0;

        const toVisitToday = keypopTodayRows[0]?.count
            ? Number(keypopTodayRows[0].count)
            : 0;
        const overdue = keypopOverdueRows[0]?.count
            ? Number(keypopOverdueRows[0].count)
            : 0;

        const neverInspected = nineNeverInspectedRows[0]?.count
            ? Number(nineNeverInspectedRows[0].count)
            : 0;
        const unrectified = nineUnrectifiedRows[0]?.count
            ? Number(nineUnrectifiedRows[0].count)
            : 0;
        const needInspection = neverInspected + unrectified;

        const todayLogCount = dailyLogRows[0]?.count
            ? Number(dailyLogRows[0].count)
            : 0;
        const hasTodayLog = todayLogCount > 0;

        return {
            myCases: {
                totalInProgress,
                nearDeadline,
            },
            keyPopulations: {
                toVisitToday,
                overdue,
            },
            nineSmall: {
                needInspection,
            },
            dailyLog: {
                hasTodayLog,
            },
        };
    } catch (err) {
        // 交给全局错误处理中间件统一处理
        throw err;
    }
}

module.exports = {
    getTodayOverview,
};
