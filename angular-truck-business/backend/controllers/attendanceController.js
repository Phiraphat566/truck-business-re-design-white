// backend/controllers/attendanceController.js
import { PrismaClient } from '@prisma/client';
import {
  ymdUTC,
  normalizeYMDToUTC,
  monthRangeUTC,
  hhmmFromDB,
  empDayKey,
} from '../utils/date.js';
import { recomputeAndUpsertEDS } from '../services/dayStatus.js';

const prisma = new PrismaClient();

/** gen id: ATT001, ATT002, ... (อ่านทั้งหมดแล้วหาค่าสูงสุดแบบปลอดภัย) */
async function genAttendanceId() {
  const rows = await prisma.attendance.findMany({ select: { id: true } });
  const max = rows.reduce((m, r) => {
    const mch = /^ATT(\d+)$/.exec(String(r.id || ''));
    return Math.max(m, mch ? parseInt(mch[1], 10) : 0);
  }, 0);
  return `ATT${String(max + 1).padStart(3, '0')}`;
}

/* ------------------------- BASIC CRUD ------------------------- */

// GET /api/attendance
export const getAllAttendance = async (_req, res) => {
  try {
    const records = await prisma.attendance.findMany({
      orderBy: [{ employee_id: 'asc' }, { work_date: 'desc' }],
    });
    res.json(records);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch attendance' });
  }
};

// GET /api/attendance/:id   (id = Prisma field `id`)
export const getAttendanceById = async (req, res) => {
  const { id } = req.params;
  try {
    const record = await prisma.attendance.findUnique({ where: { id } });
    if (!record) return res.status(404).json({ error: 'Attendance not found' });
    res.json(record);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch attendance' });
  }
};

// POST /api/attendance   (เช็กอิน)
export const createAttendance = async (req, res) => {
  try {
    const { employeeId, workDate, checkIn, checkOut, status } = req.body;
    if (!employeeId || !workDate || !checkIn || !status) {
      return res
        .status(400)
        .json({ error: 'employeeId, workDate, checkIn, status are required' });
    }

    const id = await genAttendanceId();
    const work_date = normalizeYMDToUTC(workDate);
    const check_in = new Date(checkIn);
    const check_out = checkOut ? new Date(checkOut) : null;

    // กันซ้ำรายวัน
    const exists = await prisma.attendance.findFirst({
      where: { employee_id: String(employeeId), work_date },
      select: { id: true },
    });
    if (exists)
      return res
        .status(409)
        .json({ error: 'This employee already has attendance for this date' });

    const created = await prisma.attendance.create({
      data: {
        id, // <- ใช้ฟิลด์ Prisma ชื่อ id (แมปไปคอลัมน์ attendance_id ใน DB)
        employee_id: String(employeeId),
        work_date,
        check_in,
        check_out,
        status,
      },
    });

    // อัปเดต EDS เพื่อให้จุดสถานะหน้า Employee เปลี่ยนทันที
    await recomputeAndUpsertEDS(String(employeeId), ymdUTC(work_date));

    return res.status(201).json(created);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to create attendance' });
  }
};

// PUT /api/attendance/:id
export const updateAttendance = async (req, res) => {
  const { id } = req.params;
  const { employeeId, workDate, checkIn, checkOut, status } = req.body;

  try {
    const before = await prisma.attendance.findUnique({ where: { id } });
    if (!before)
      return res.status(404).json({ error: 'Attendance record not found' });

    const updated = await prisma.attendance.update({
      where: { id },
      data: {
        ...(employeeId ? { employee_id: String(employeeId) } : {}),
        ...(workDate ? { work_date: normalizeYMDToUTC(workDate) } : {}),
        ...(checkIn ? { check_in: new Date(checkIn) } : {}),
        ...(checkOut !== undefined
          ? { check_out: checkOut ? new Date(checkOut) : null }
          : {}),
        ...(status ? { status } : {}),
      },
    });

    await recomputeAndUpsertEDS(updated.employee_id, ymdUTC(updated.work_date));

    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to update attendance' });
  }
};

// DELETE /api/attendance/:id
export const deleteAttendance = async (req, res) => {
  const { id } = req.params;
  try {
    const deleted = await prisma.attendance.delete({ where: { id } });

    const ymd = ymdUTC(new Date(deleted.work_date));
    await recomputeAndUpsertEDS(deleted.employee_id, ymd);

    res.json({ message: `Attendance ${id} deleted` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete attendance' });
  }
};

/* ------------------- SUMMARY / HISTORY ------------------- */

// GET /api/attendance/years
export async function getYears(_req, res) {
  try {
    const att = await prisma.attendance.findMany({ select: { work_date: true } });
    const eds = await prisma.employeeDayStatus.findMany({
      select: { work_date: true },
    });

    const years = new Set();
    att.forEach(
      (r) => r.work_date && years.add(new Date(r.work_date).getUTCFullYear())
    );
    eds.forEach(
      (r) => r.work_date && years.add(new Date(r.work_date).getUTCFullYear())
    );

    if (years.size === 0) years.add(new Date().getUTCFullYear());

    const result = [...years]
      .sort((a, b) => b - a)
      .map((y) => ({ year: y, monthsCount: 12 }));

    res.json(result);
  } catch (err) {
    console.error('[getYears]', err);
    res.status(500).json({ error: 'Failed to fetch years' });
  }
}

// GET /api/attendance/summary?year=YYYY&month=M
export async function getMonthSummary(req, res) {
  try {
    const year = Number(req.query.year);
    const month = Number(req.query.month); // 1..12
    if (
      !Number.isInteger(year) ||
      year < 1970 ||
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12
    ) {
      return res.status(400).json({ error: 'Invalid year or month' });
    }

    const { start, end } = monthRangeUTC(year, month);

    // 1) รายชื่อพนักงาน
    const employees = await prisma.employee.findMany({
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
    });

    // กริดว่าง
    const buildEmptyGrid = () => {
      const days = [];
      const daysInMonth = new Date(year, month, 0).getDate();
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = new Date(Date.UTC(year, month - 1, d))
          .toISOString()
          .slice(0, 10);
        days.push({
          date: dateStr,
          rows: employees.map((e) => ({
            employee_id: e.id,
            employee_name: e.name,
          })),
        });
      }
      return days;
    };

    // 2) อ่านจาก EmployeeDayStatus ก่อน
    const eds = await prisma.employeeDayStatus.findMany({
      where: { work_date: { gte: start, lt: end } },
      select: { employee_id: true, work_date: true, status: true },
    });

    if (eds.length > 0) {
      const byKey = new Map();
      for (const r of eds) {
        const ymd = ymdUTC(r.work_date);
        byKey.set(empDayKey(r.employee_id, ymd), r.status);
      }

      const days = buildEmptyGrid();
      let ontime = 0,
        late = 0,
        absent = 0;

      const toUi = (st) => {
        if (st === 'WORKING' || st === 'OFF_DUTY') return 'ON_TIME';
        if (st === 'ON_LEAVE') return 'LEAVE';
        return 'ABSENT';
      };

      for (const day of days) {
        for (const row of day.rows) {
          const stRaw = byKey.get(empDayKey(row.employee_id, day.date));
          if (!stRaw) continue;

          row.status = toUi(stRaw);
          if (row.status === 'LEAVE') row.note = 'ลา';

          if (row.status === 'ON_TIME') ontime++;
          else if (row.status === 'LATE') late++;
          else absent++;
        }
      }

      const total = ontime + late + absent || 1;
      const pct = (n) => Math.round((n * 100) / total);

      return res.json({
        headStats: {
          people: employees.length,
          ontimePct: pct(ontime),
          latePct: pct(late),
          absentPct: pct(absent),
        },
        days,
      });
    }

    // ---------- fallback: Attendance/Leave ----------
    const attendance = await prisma.attendance.findMany({
      where: { work_date: { gte: start, lt: end } },
      select: {
        employee_id: true,
        work_date: true,
        check_in: true,
        check_out: true,
        status: true,
      },
    });

    const leaves = await prisma.leaveRequest.findMany({
      where: { leave_date: { gte: start, lt: end } },
      select: { employee_id: true, leave_date: true, leave_type: true, reason: true },
    });

    if (attendance.length === 0 && leaves.length === 0) {
      return res.json({
        headStats: {
          people: employees.length,
          ontimePct: 0,
          latePct: 0,
          absentPct: 0,
        },
        days: buildEmptyGrid(),
      });
    }

    const attMap = new Map();
    for (const r of attendance) {
      const ymd = ymdUTC(r.work_date);
      attMap.set(empDayKey(r.employee_id, ymd), r);
    }

    const leaveMap = new Map();
    for (const r of leaves) {
      const ymd = ymdUTC(r.leave_date);
      leaveMap.set(
        empDayKey(r.employee_id, ymd),
        r.reason || r.leave_type || 'ลา'
      );
    }

    const days = buildEmptyGrid();
    let ontime = 0,
      late = 0,
      absent = 0;

    for (const day of days) {
      for (const row of day.rows) {
        const key = empDayKey(row.employee_id, day.date);
        const rec = attMap.get(key);
        const lv = leaveMap.get(key);

        if (rec) {
          row.check_in = hhmmFromDB(rec.check_in);
          row.check_out = rec.check_out ? hhmmFromDB(rec.check_out) : '-';
          row.status = rec.status; // 'ON_TIME' | 'LATE'
          row.note = '';
          row.status === 'ON_TIME' ? ontime++ : late++;
        } else if (lv) {
          row.status = 'LEAVE';
          row.note = lv;
          absent++;
        } else {
          row.status = 'ABSENT';
          row.note = '';
          absent++;
        }
      }
    }

    const total = ontime + late + absent || 1;
    const pct = (n) => Math.round((n * 100) / total);

    return res.json({
      headStats: {
        people: employees.length,
        ontimePct: pct(ontime),
        latePct: pct(late),
        absentPct: pct(absent),
      },
      days,
    });
  } catch (err) {
    console.error('[getMonthSummary]', err);
    res.status(500).json({ error: 'Failed to build monthly summary' });
  }
}

// GET /api/attendance/employee-history?empId=EMP001&year=2025&month=1
export async function getEmployeeHistory(req, res) {
  try {
    const empId = String(req.query.empId || '');
    const year = Number(req.query.year);
    const month = Number(req.query.month);
    if (!empId || !Number.isInteger(year) || !Number.isInteger(month)) {
      return res.status(400).json({ error: 'empId, year and month are required' });
    }

    const employee = await prisma.employee.findUnique({
      where: { id: empId },
      select: { id: true, name: true },
    });
    if (!employee) return res.status(404).json({ error: 'Employee not found' });

    const { start, end } = monthRangeUTC(year, month);

    // 1) พยายามอ่านจาก EmployeeDayStatus ก่อน
    const eds = await prisma.employeeDayStatus.findMany({
      where: { employee_id: empId, work_date: { gte: start, lt: end } },
      select: { work_date: true, status: true },
    });

    if (eds.length > 0) {
      const dayStatus = new Map();
      for (const r of eds) {
        const d = new Date(r.work_date).getUTCDate();
        dayStatus.set(d, r.status);
      }

      // ดึงเวลาเข้าเฉพาะวันที่ทำงาน
      const presentDays = [...dayStatus.entries()]
        .filter(([, st]) => st === 'WORKING' || st === 'OFF_DUTY')
        .map(([d]) => d);

      let timeInByDay = new Map();
      if (presentDays.length) {
        const workDates = presentDays.map((d) =>
          normalizeYMDToUTC(
            `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
          )
        );
        const att = await prisma.attendance.findMany({
          where: { employee_id: empId, work_date: { in: workDates } },
          select: { work_date: true, check_in: true },
        });
        timeInByDay = new Map(
          att.map((a) => [
            new Date(a.work_date).getUTCDate(),
            hhmmFromDB(a.check_in),
          ])
        );
      }

      // map เป็น UI-Status ที่แยก LEAVE
      const toUiStatus = (st) => {
        if (st === 'WORKING' || st === 'OFF_DUTY') return 'ON_TIME';
        if (st === 'ON_LEAVE') return 'LEAVE';
        return 'ABSENT';
      };

      const daysInMonth = new Date(year, month, 0).getDate();
      const result = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const stRaw = dayStatus.get(d);
        if (!stRaw) {
          result.push({ day: d });
          continue;
        }
        const ui = toUiStatus(stRaw);
        result.push({
          day: d,
          status: ui,
          timeIn: ui === 'ON_TIME' ? timeInByDay.get(d) || undefined : undefined,
        });
      }

      return res.json({ employee, days: result });
    }

    // 2) fallback: Attendance/Leave
    const att = await prisma.attendance.findMany({
      where: { employee_id: empId, work_date: { gte: start, lt: end } },
      select: { work_date: true, check_in: true, status: true },
    });

    const leaves = await prisma.leaveRequest.findMany({
      where: { employee_id: empId, leave_date: { gte: start, lt: end } },
      select: { leave_date: true, leave_type: true, reason: true },
    });

    if (att.length === 0 && leaves.length === 0) {
      return res.json({ employee, days: [] });
    }

    const byDay = new Map();
    for (const r of att) {
      const day = new Date(r.work_date).getUTCDate();
      byDay.set(day, { status: r.status, timeIn: hhmmFromDB(r.check_in) });
    }

    const leaveDays = new Map();
    for (const l of leaves) {
      const day = new Date(l.leave_date).getUTCDate();
      leaveDays.set(day, { status: 'LEAVE', note: l.reason || l.leave_type });
    }

    const daysInMonth = new Date(year, month, 0).getDate();
    const result = [];
    for (let d = 1; d <= daysInMonth; d++) {
      if (byDay.has(d)) result.push({ day: d, ...byDay.get(d) });
      else if (leaveDays.has(d)) result.push({ day: d, ...leaveDays.get(d) });
      else result.push({ day: d });
    }

    return res.json({ employee, days: result });
  } catch (err) {
    console.error('[getEmployeeHistory]', err);
    res.status(500).json({ error: 'Failed to fetch employee history' });
  }
}

// POST /api/attendance/check-out
export const checkOutByEmployeeAndDate = async (req, res) => {
  try {
    const { employeeId, workDate, checkOut } = req.body;
    if (!employeeId || !workDate || !checkOut) {
      return res
        .status(400)
        .json({ error: 'employeeId, workDate, checkOut are required' });
    }

    const wd = normalizeYMDToUTC(workDate);

    const rec = await prisma.attendance.findFirst({
      where: { employee_id: String(employeeId), work_date: wd },
      select: { id: true },
    });
    if (!rec) {
      return res
        .status(404)
        .json({ error: 'ไม่พบข้อมูล Check-in ของวันนั้น (ต้องเช็กอินก่อน)' });
    }

    const updated = await prisma.attendance.update({
      where: { id: rec.id },
      data: { check_out: new Date(checkOut) },
    });

    await recomputeAndUpsertEDS(String(employeeId), ymdUTC(wd));

    return res.json(updated);
  } catch (err) {
    console.error('[checkOutByEmployeeAndDate]', err);
    return res.status(500).json({ error: 'Failed to check-out' });
  }
};


// --- FOR DASHBOARD: GET /api/dashboard/attendance?start=YYYY-MM-DD&end=YYYY-MM-DD[&countAbsentWhenNoData=1]
export async function getDashboardAttendance(req, res) {
  try {
    const startYmd = String(req.query.start || '');
    const endYmd   = String(req.query.end   || '');
    if (!startYmd || !endYmd) {
      return res.status(400).json({ error: 'start & end are required (YYYY-MM-DD)' });
    }

    // ถ้าใส่ countAbsentWhenNoData=1 จะนับ "วันว่าง" เป็นขาด (พฤติกรรมเดิม)
    // ค่าเริ่มต้นไม่ใส่ -> วันว่างไม่นับเป็นขาด
    const countAbsentWhenNoData =
      String(req.query.countAbsentWhenNoData || '0') === '1';

    // แปลงเป็น UTC และทำให้ end เป็น exclusive (+1 วัน)
    const start = normalizeYMDToUTC(startYmd);
    const endEx = normalizeYMDToUTC(endYmd);
    endEx.setUTCDate(endEx.getUTCDate() + 1);

    // จำนวนพนักงานทั้งหมด (ใช้เป็น working ของแต่ละวัน)
    const employees = await prisma.employee.findMany({ select: { id: true } });
    const working = employees.length;

    // โหลดเช็คอิน/ลาในช่วง
    const [attRows, leaveRows] = await Promise.all([
      prisma.attendance.findMany({
        where: { work_date: { gte: start, lt: endEx } },
        select: { employee_id: true, work_date: true, status: true }, // 'ON_TIME' | 'LATE'
      }),
      prisma.leaveRequest.findMany({
        where: { leave_date: { gte: start, lt: endEx } },
        select: { employee_id: true, leave_date: true },
      }),
    ]);

    // รวมเป็นรายวัน (กันซ้ำต่อคนต่อวัน)
    const seenAtt = new Set();   // empId@YYYY-MM-DD สำหรับ Attendance
    const seenLv  = new Set();   // empId@YYYY-MM-DD สำหรับ Leave
    const byDay   = new Map();   // ymd -> { onTime, late, leave }

    const accOf = (ymd) => {
      const o = byDay.get(ymd) || { onTime: 0, late: 0, leave: 0 };
      if (!byDay.has(ymd)) byDay.set(ymd, o);
      return o;
    };

    for (const r of attRows) {
      const ymd = ymdUTC(r.work_date);
      const ek  = empDayKey(r.employee_id, ymd);
      if (seenAtt.has(ek)) continue; // กันซ้ำ
      seenAtt.add(ek);
      const o = accOf(ymd);
      if (r.status === 'LATE') o.late++;
      else o.onTime++; // ถือว่าเป็น "ตรงเวลา" ถ้าไม่ใช่ LATE
    }

    for (const r of leaveRows) {
      const ymd = ymdUTC(r.leave_date);
      const ek  = empDayKey(r.employee_id, ymd);
      if (seenAtt.has(ek)) continue; // มีเช็คอินแล้ว ไม่นับเป็นลา
      if (seenLv.has(ek)) continue;  // กันซ้ำใบลา
      seenLv.add(ek);
      const o = accOf(ymd);
      o.leave++;
    }

    // สร้างผลลัพธ์ครบทุกวันในช่วง
    const days = [];
    for (let d = new Date(start); d < endEx; d.setUTCDate(d.getUTCDate() + 1)) {
      const ymd = ymdUTC(d);
      const o   = byDay.get(ymd) || { onTime: 0, late: 0, leave: 0 };
      const present   = o.onTime + o.late;
      const hasAny    = (present + o.leave) > 0; // วันนั้นมีข้อมูลเข้า/ลาไหม?
      const absent    = (hasAny || countAbsentWhenNoData)
        ? Math.max(0, working - present - o.leave)
        : 0;

      days.push({
        date: ymd,
        working,
        present,
        onTime: o.onTime,
        late:   o.late,
        leave:  o.leave,
        absent,
      });
    }

    return res.json({ totalEmployees: working, days });
  } catch (e) {
    console.error('[getDashboardAttendance]', e);
    res.status(500).json({ error: 'Failed to build dashboard attendance' });
  }
}

