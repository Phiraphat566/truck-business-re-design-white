// backend/controllers/edsController.js
import { PrismaClient } from '@prisma/client';
import { normalizeYMDToUTC, ymdUTC } from '../utils/date.js';
import { recomputeAndUpsertEDS } from '../services/dayStatus.js';

const prisma = new PrismaClient();

// GET /api/employee-day-status?date=YYYY-MM-DD
export async function getDayStatuses(req, res) {
  try {
    const ymd = String(req.query.date || ymdUTC(new Date()));
    const wd  = normalizeYMDToUTC(ymd);

    const emps = await prisma.employee.findMany({ select: { id: true } });

    const existing = await prisma.employeeDayStatus.findMany({
      where: { work_date: wd },
      select: { employee_id: true, status: true },
    });
    const map = new Map(existing.map(r => [r.employee_id, r.status]));

    // self-heal คนที่ยังไม่มีแถว
    const missing = emps.filter(e => !map.has(e.id));
    await Promise.all(missing.map(e => recomputeAndUpsertEDS(e.id, ymd)));

    if (missing.length) {
      const filled = await prisma.employeeDayStatus.findMany({
        where: { work_date: wd, employee_id: { in: missing.map(m => m.id) } },
        select: { employee_id: true, status: true },
      });
      filled.forEach(r => map.set(r.employee_id, r.status));
    }

    const items = emps.map(e => ({
      employee_id: e.id,
      status: map.get(e.id) ?? 'NOT_CHECKED_IN',
    }));
    res.json(items);
  } catch (e) {
    console.error('[getDayStatuses]', e);
    res.status(500).json({ error: 'Failed to fetch day statuses' });
  }
}

// POST /api/employee-day-status/upsert   (ตั้งค่า MANUAL เช่น ABSENT)
export async function upsertManualStatus(req, res) {
  try {
    const { employeeId, date, status } = req.body;
    const wd = normalizeYMDToUTC(date);
    await prisma.employeeDayStatus.upsert({
      where: { employee_id_work_date: { employee_id: employeeId, work_date: wd } },
      create: { employee_id: employeeId, work_date: wd, status, source: 'MANUAL' },
      update: { status, source: 'MANUAL', updated_at: new Date(), arrival_detail: null },
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('[upsertManualStatus]', e);
    res.status(500).json({ error: 'Failed to upsert manual status' });
  }
}

// DELETE /api/employee-day-status/override   (ยกเลิก MANUAL แล้วคำนวณใหม่)
export async function clearManualOverride(req, res) {
  try {
    const { employeeId, date } = req.body;
    const wd = normalizeYMDToUTC(date);
    await prisma.employeeDayStatus.delete({
      where: { employee_id_work_date: { employee_id: employeeId, work_date: wd } },
    }).catch(() => {});
    await recomputeAndUpsertEDS(employeeId, date, { force: true });
    res.json({ ok: true });
  } catch (e) {
    console.error('[clearManualOverride]', e);
    res.status(500).json({ error: 'Failed to clear manual override' });
  }
}
