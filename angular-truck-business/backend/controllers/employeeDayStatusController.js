// backend/controllers/employeeDayStatusController.js
import { PrismaClient, DayStatus, DaySource } from '@prisma/client';
const prisma = new PrismaClient();

/* -------------------------------- utils -------------------------------- */

function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** ทำให้เป็น 00:00:00Z ของวันนั้น (ใช้เป็นกุญแจวันที่แบบ UTC) */
function normalizeWorkDate(ymd) {
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** ช่วง [start, end) ของวัน (UTC) */
function dayRangeUTC(ymd) {
  const start = normalizeWorkDate(ymd);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

/** ช่วงเดือน [start, end) ของปี/เดือนที่รับมา (UTC) */
function monthRangeUTC(year, month) {
  // month = 1..12
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
}

const ALLOWED = ['NOT_CHECKED_IN', 'WORKING', 'OFF_DUTY', 'ON_LEAVE', 'ABSENT'];

/* --------- แก่นหลัก: คำนวณสถานะของพนักงานในวันหนึ่งจากใบลา/attendance --------- */
async function computeStatusFor(empId, ymd) {
  const { start, end } = dayRangeUTC(ymd);

  // 1) มีใบลา -> ON_LEAVE
  const leave = await prisma.leaveRequest.findFirst({
    where: { employee_id: empId, leave_date: { gte: start, lt: end } },
    select: { leave_id: true },
  });
  if (leave) return { status: DayStatus.ON_LEAVE, source: DaySource.LEAVE };

  // 2) มี attendance -> WORKING / OFF_DUTY
  const att = await prisma.attendance.findFirst({
    where: { employee_id: empId, work_date: { gte: start, lt: end } },
    orderBy: { check_in: 'desc' },
    select: { check_out: true },
  });
  if (att) {
    return {
      status: att.check_out ? DayStatus.OFF_DUTY : DayStatus.WORKING,
      source: DaySource.ATTENDANCE,
    };
  }

  // 3) ถ้าไม่มีข้อมูลอะไรเลย
  return { status: DayStatus.NOT_CHECKED_IN, source: DaySource.SYSTEM };
}

/* ---------- GET /api/employee-day-status?date=YYYY-MM-DD[&materialize=1] ---------- */
/* คืน { employee_id, status } ครบทุกพนักงาน; ถ้าไม่มี EDS จะคำนวณสดจากใบลา/attendance ให้
   ถ้าใส่ materialize=1 จะ upsert ลงตาราง EmployeeDayStatus ให้ด้วย */
export async function listByDate(req, res) {
  try {
    const ymd = String(req.query.date || todayYmd());
    const materialize = String(req.query.materialize || '') === '1';
    const wd = normalizeWorkDate(ymd);

    // รายชื่อพนักงานทั้งหมด
    const employees = await prisma.employee.findMany({
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    const result = [];
    for (const e of employees) {
      // ถ้ามี EDS อยู่แล้ว -> ใช้เลย
      const eds = await prisma.employeeDayStatus.findUnique({
        where: { employee_id_work_date: { employee_id: e.id, work_date: wd } },
        select: { status: true, source: true },
      });

      if (eds) {
        result.push({ employee_id: e.id, status: eds.status });
        continue;
      }

      // ไม่มี -> คำนวณจาก leave/attendance
      const { status, source } = await computeStatusFor(e.id, ymd);
      result.push({ employee_id: e.id, status });

      // ถ้าต้องการ materialize ก็ upsert ลง DB
      if (materialize) {
        await prisma.employeeDayStatus.upsert({
          where: { employee_id_work_date: { employee_id: e.id, work_date: wd } },
          create: { employee_id: e.id, work_date: wd, status, source },
          update: { status, source },
        });
      }
    }

    return res.json(result);
  } catch (err) {
    console.error('[listByDate]', err);
    return res.status(500).json({ error: 'Failed to fetch day statuses' });
  }
}

/* ---------- GET /api/employee-day-status/:employeeId?date=YYYY-MM-DD ---------- */
export async function getOne(req, res) {
  try {
    const employeeId = req.params.employeeId;
    const ymd = String(req.query.date || todayYmd());
    const wd = normalizeWorkDate(ymd);

    let row = await prisma.employeeDayStatus.findUnique({
      where: { employee_id_work_date: { employee_id: employeeId, work_date: wd } },
      select: { employee_id: true, work_date: true, status: true },
    });

    // ถ้าไม่มี แถมคำนวณให้ (ไม่ materialize)
    if (!row) {
      const { status } = await computeStatusFor(employeeId, ymd);
      return res.json({ employee_id: employeeId, work_date: wd, status });
    }

    return res.json(row);
  } catch (err) {
    console.error('[getOne]', err);
    return res.status(500).json({ error: 'Failed to fetch day status' });
  }
}

/* ---------- POST /api/employee-day-status/upsert ---------- */
/* body: { employeeId, date(YYYY-MM-DD), status, source? }
   ใช้มาร์คสถานะ manual (เช่น ขาดงาน/ลา) */
export async function upsert(req, res) {
  try {
    const { employeeId, date, status, source } = req.body;
    if (!employeeId || !status)
      return res.status(400).json({ error: 'employeeId and status are required' });
    if (!ALLOWED.includes(status))
      return res
        .status(400)
        .json({ error: `status must be one of ${ALLOWED.join(', ')}` });

    const ymd = date || todayYmd();
    const wd = normalizeWorkDate(ymd);

    const row = await prisma.employeeDayStatus.upsert({
      where: { employee_id_work_date: { employee_id: employeeId, work_date: wd } },
      update: { status, source: source || DaySource.MANUAL },
      create: {
        employee_id: employeeId,
        work_date: wd,
        status,
        source: source || DaySource.MANUAL,
      },
      select: { employee_id: true, work_date: true, status: true, updated_at: true },
    });
    return res.json(row);
  } catch (err) {
    console.error('[upsert]', err);
    return res.status(500).json({ error: 'Upsert day status failed' });
  }
}

/* ------------------------- OPTIONAL UTIL ENDPOINTS ------------------------- */
/* ทางเลือก: ใช้สำหรับรีบิลด์/เติม EDS ทั้งเดือนให้ “ครบ” เวลาอยากให้ summary ไปพึ่ง EDS ได้เต็มๆ
   - POST /api/employee-day-status/materialize-month  body: { year: 2025, month: 8 }
*/
export async function materializeMonth(req, res) {
  try {
    const year = Number(req.body?.year);
    const month = Number(req.body?.month); // 1..12
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return res.status(400).json({ error: 'year and month(1-12) are required' });
    }

    const { start, end } = monthRangeUTC(year, month);
    const daysInMonth = new Date(year, month, 0).getDate();
    const employees = await prisma.employee.findMany({ select: { id: true } });

    for (let d = 1; d <= daysInMonth; d++) {
      const ymd = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const wd = normalizeWorkDate(ymd);
      for (const e of employees) {
        const { status, source } = await computeStatusFor(e.id, ymd);
        await prisma.employeeDayStatus.upsert({
          where: { employee_id_work_date: { employee_id: e.id, work_date: wd } },
          create: { employee_id: e.id, work_date: wd, status, source },
          update: { status, source },
        });
      }
    }

    const count = await prisma.employeeDayStatus.count({
      where: { work_date: { gte: start, lt: end } },
    });

    return res.json({ ok: true, materialized: count });
  } catch (err) {
    console.error('[materializeMonth]', err);
    return res.status(500).json({ error: 'Failed to materialize month' });
  }
}
