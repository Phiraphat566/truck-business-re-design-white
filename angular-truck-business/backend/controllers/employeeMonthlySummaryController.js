// backend/controllers/employeeMonthlySummaryController.js
import { PrismaClient } from '@prisma/client';
import { monthRangeUTC } from '../utils/date.js';

const prisma = new PrismaClient();

/** เลือกฟิลด์พนักงานที่อยากติดมาด้วยเวลา include */
const employeeSelect = {
  id: true,
  name: true,
  position: true,
  phone: true,
  profileImagePath: true, // ชื่อตรงกับ prisma ของคุณ
};

/** GET /api/monthly-summaries
 *  รองรับ query: ?year=2025&month=1&employeeId=EMP001
 */
export const getAllMonthlySummaries = async (req, res) => {
  try {
    const year = req.query.year ? Number(req.query.year) : undefined;
    const month = req.query.month ? Number(req.query.month) : undefined;
    const employeeId = req.query.employeeId || undefined;

    const where = {};
    if (year) where.year = year;
    if (month) where.month = month;
    if (employeeId) where.employee_id = employeeId;

    const summaries = await prisma.employeeMonthlySummary.findMany({
      where,
      include: { Employee: { select: employeeSelect } },
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { employee_id: 'asc' }],
    });

    res.json(summaries);
  } catch (err) {
    console.error('[getAllMonthlySummaries]', err);
    res.status(500).json({ error: 'Failed to fetch monthly summaries' });
  }
};

/** GET /api/monthly-summaries/:id */
export const getMonthlySummaryById = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const summary = await prisma.employeeMonthlySummary.findUnique({
      where: { id },
      include: { Employee: { select: employeeSelect } },
    });
    if (!summary) return res.status(404).json({ error: 'Monthly summary not found' });
    res.json(summary);
  } catch (err) {
    console.error('[getMonthlySummaryById]', err);
    res.status(500).json({ error: 'Failed to fetch monthly summary' });
  }
};

/** POST /api/monthly-summaries
 *  body ต้องมี: employee_id, year, month
 *  ฟิลด์ตัวเลขอื่น ๆ ใส่ได้ตามต้องการ (ถ้าไม่ส่งจะ default ตามสคีมา)
 */
export const createMonthlySummary = async (req, res) => {
  try {
    const {
      employee_id,
      year,
      month,
      planned_days = 0,
      present_days = 0,
      late_days = 0,
      absent_days = 0,
      leave_days = 0,
      work_hours = null,
      on_time_rate = null,
    } = req.body;

    if (!employee_id || !year || !month) {
      return res.status(400).json({ error: 'employee_id, year, and month are required' });
    }

    const created = await prisma.employeeMonthlySummary.create({
      data: {
        employee_id: String(employee_id),
        year: Number(year),
        month: Number(month),
        planned_days: Number(planned_days),
        present_days: Number(present_days),
        late_days: Number(late_days),
        absent_days: Number(absent_days),
        leave_days: Number(leave_days),
        // Prisma Decimal รองรับ number ได้
        work_hours: work_hours !== null && work_hours !== undefined ? Number(work_hours) : null,
        on_time_rate: on_time_rate !== null && on_time_rate !== undefined ? Number(on_time_rate) : null,
      },
    });

    res.status(201).json(created);
  } catch (err) {
    console.error('[createMonthlySummary]', err);
    res.status(500).json({ error: 'Failed to create monthly summary' });
  }
};

// คำนวณสรุปรายเดือนจาก EDS (ไม่แตะตาราง summary เว้นแต่ส่ง upsert=1)
export const computeMonthlyFromEDS = async (req, res) => {
  try {
    const year = Number(req.query.year);
    const month = Number(req.query.month); // 1..12
    const employeeId = req.query.employeeId ? String(req.query.employeeId) : undefined;
    const doUpsert = req.query.upsert === '1' || req.query.upsert === 'true';

    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return res.status(400).json({ error: 'year และ month ต้องระบุให้ถูกต้อง' });
    }

    const { start, end } = monthRangeUTC(year, month);

    // รายชื่อพนักงาน (จำกัดเฉพาะคนที่ขอ ถ้ามี)
    const employees = await prisma.employee.findMany({
      where: employeeId ? { id: employeeId } : undefined,
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
    });
    if (employees.length === 0) return res.json([]);

    // ดึง EDS ของเดือนนี้ + arrival_detail
    const eds = await prisma.employeeDayStatus.findMany({
      where: {
        work_date: { gte: start, lt: end },
        ...(employeeId ? { employee_id: employeeId } : {}),
      },
      select: {
        employee_id: true,
        work_date: true,
        status: true,           // WORKING | OFF_DUTY | ON_LEAVE | ABSENT | NOT_CHECKED_IN
        arrival_detail: true,   // ON_TIME | LATE | null
      },
    });

    // เตรียม accumulator ต่อพนักงาน
    const accByEmp = new Map(
      employees.map(e => [e.id, {
        employee_id: e.id,
        year,
        month,
        planned_days: 0,
        present_days: 0,
        late_days: 0,
        absent_days: 0,
        leave_days: 0,
        work_hours: null,
        on_time_rate: 0,
      }])
    );

    for (const r of eds) {
      const acc = accByEmp.get(r.employee_id);
      if (!acc) continue;

      if (r.status === 'WORKING' || r.status === 'OFF_DUTY') {
        acc.present_days += 1;
        if (r.arrival_detail === 'LATE') acc.late_days += 1;
      } else if (r.status === 'ON_LEAVE') {
        acc.leave_days += 1;
      } else if (r.status === 'ABSENT') {
        acc.absent_days += 1;
      }
    }

    // planned_days = วันที่มีแผน/มีผลลัพธ์ (present + leave + absent)
    for (const r of accByEmp.values()) {
      r.planned_days = r.present_days + r.leave_days + r.absent_days;
      const denom = r.present_days;
      const ontime = r.present_days - r.late_days;
      r.on_time_rate = denom > 0 ? Number(((ontime * 100) / denom).toFixed(2)) : 0;
    }

    const result = Array.from(accByEmp.values());

    // ถ้าส่ง upsert=1 จะเขียนทับลงตาราง EmployeeMonthlySummary ด้วย
    if (doUpsert) {
      await prisma.$transaction(result.map(r =>
        prisma.employeeMonthlySummary.upsert({
          where: { employee_id_year_month: { employee_id: r.employee_id, year: r.year, month: r.month } },
          create: r,
          update: {
            planned_days: r.planned_days,
            present_days: r.present_days,
            late_days: r.late_days,
            absent_days: r.absent_days,
            leave_days: r.leave_days,
            on_time_rate: r.on_time_rate,
            work_hours: r.work_hours,
          },
        })
      ));
    }

    return res.json(result);
  } catch (err) {
    console.error('[computeMonthlyFromEDS]', err);
    return res.status(500).json({ error: 'Failed to compute monthly summary' });
  }
};



/** PUT /api/monthly-summaries/:id
 *  อนุญาตอัปเดตแบบ partial (ใส่มาเฉพาะที่อยากแก้)
 */
export const updateMonthlySummary = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const {
      planned_days,
      present_days,
      late_days,
      absent_days,
      leave_days,
      work_hours,
      on_time_rate,
      year,
      month,
      employee_id,
    } = req.body;

    // เตรียม data เฉพาะคีย์ที่ส่งมา
    const data = {};
    if (employee_id !== undefined) data.employee_id = String(employee_id);
    if (year !== undefined)        data.year = Number(year);
    if (month !== undefined)       data.month = Number(month);
    if (planned_days !== undefined) data.planned_days = Number(planned_days);
    if (present_days !== undefined) data.present_days = Number(present_days);
    if (late_days !== undefined)    data.late_days = Number(late_days);
    if (absent_days !== undefined)  data.absent_days = Number(absent_days);
    if (leave_days !== undefined)   data.leave_days = Number(leave_days);
    if (work_hours !== undefined)   data.work_hours = work_hours === null ? null : Number(work_hours);
    if (on_time_rate !== undefined) data.on_time_rate = on_time_rate === null ? null : Number(on_time_rate);

    const updated = await prisma.employeeMonthlySummary.update({
      where: { id },
      data,
    });

    res.json(updated);
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Monthly summary not found' });
    }
    console.error('[updateMonthlySummary]', err);
    res.status(500).json({ error: 'Failed to update monthly summary' });
  }
};

/** DELETE /api/monthly-summaries/:id */
export const deleteMonthlySummary = async (req, res) => {
  try {
    const id = Number(req.params.id);
    await prisma.employeeMonthlySummary.delete({ where: { id } });
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Monthly summary not found' });
    }
    console.error('[deleteMonthlySummary]', err);
    res.status(500).json({ error: 'Failed to delete monthly summary' });
  }
};

/** GET /api/monthly-summaries/year/:year */
export const employeeMonthlySummaryByYear = async (req, res) => {
  try {
    const year = Number(req.params.year);

    const summaries = await prisma.employeeMonthlySummary.findMany({
      where: { year },
      orderBy: [{ month: 'asc' }, { employee_id: 'asc' }],
      include: { Employee: { select: employeeSelect } },
    });

    res.json(summaries);
  } catch (err) {
    console.error('[employeeMonthlySummaryByYear]', err);
    res.status(500).json({ error: 'Failed to fetch monthly summaries for year' });
  }

};

