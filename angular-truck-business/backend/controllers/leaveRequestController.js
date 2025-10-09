// backend/controllers/leaveRequestController.js
import { PrismaClient } from '@prisma/client';
import { ymdUTC, normalizeYMDToUTC, monthRangeUTC } from '../utils/date.js';
import { recomputeAndUpsertEDS } from '../services/dayStatus.js';

const prisma = new PrismaClient();

/* ------------------------ LIST / READ ------------------------ */

// GET /api/leaves?employeeId=&year=&month=
export const getLeaves = async (req, res) => {
  try {
    const { employeeId, year, month } = req.query;

    const where = {};
    if (employeeId) where.employee_id = String(employeeId);

    if (year && month) {
      const y = Number(year);
      const m = Number(month);
      const { start, end } = monthRangeUTC(y, m);
      where.leave_date = { gte: start, lt: end };
    }

    const data = await prisma.leaveRequest.findMany({
      where,
      orderBy: [{ leave_date: 'desc' }],
      include: { Employee: true, Staff: true },
    });
    res.json(data);
  } catch (err) {
    console.error('[getLeaves]', err);
    res.status(500).json({ error: 'Failed to fetch leave requests' });
  }
};

// GET /api/leaves/:id
export const getLeaveById = async (req, res) => {
  const id = Number(req.params.id);
  try {
    const leave = await prisma.leaveRequest.findUnique({
      where: { leave_id: id },
      include: { Employee: true, Staff: true },
    });
    if (!leave) return res.status(404).json({ error: 'Leave not found' });
    res.json(leave);
  } catch (err) {
    console.error('[getLeaveById]', err);
    res.status(500).json({ error: 'Failed to fetch leave' });
  }
};

/* ------------------------ CREATE ------------------------ */

// POST /api/leaves
// body: { employee_id, leave_date(YYYY-MM-DD), leave_type, reason?, approved_by }
export const createLeave = async (req, res) => {
  try {
    const { employee_id, leave_date, leave_type, reason, approved_by } = req.body;
    if (!employee_id || !leave_date || !leave_type || !approved_by) {
      return res
        .status(400)
        .json({ error: 'employee_id, leave_date, leave_type, approved_by are required' });
    }

    const wd = normalizeYMDToUTC(leave_date);

    const leave = await prisma.leaveRequest.create({
      data: { employee_id, leave_date: wd, leave_type, reason, approved_by },
    });

    // ✅ ใช้ service กลางคำนวณ EDS ของวันนั้น
    await recomputeAndUpsertEDS(employee_id, ymdUTC(wd));

    return res.status(201).json(leave);
  } catch (err) {
    if (err?.code === 'P2002') {
      return res.status(409).json({ error: 'Leave for this date already exists' });
    }
    console.error('[createLeave]', err);
    return res.status(500).json({ error: 'Failed to create leave' });
  }
};

/* ------------------------ UPDATE ------------------------ */

// PUT /api/leaves/:id
// body: { employee_id?, leave_date?, leave_type?, reason?, approved_by? }
export const updateLeave = async (req, res) => {
  const id = Number(req.params.id);
  try {
    const before = await prisma.leaveRequest.findUnique({ where: { leave_id: id } });
    if (!before) return res.status(404).json({ error: 'Leave not found' });

    const { employee_id, leave_date, leave_type, reason, approved_by } = req.body;

    const updated = await prisma.leaveRequest.update({
      where: { leave_id: id },
      data: {
        ...(employee_id ? { employee_id } : {}),
        ...(leave_date ? { leave_date: normalizeYMDToUTC(leave_date) } : {}),
        ...(leave_type ? { leave_type } : {}),
        ...(reason !== undefined ? { reason } : {}),
        ...(approved_by ? { approved_by } : {}),
      },
    });

    // ✅ recompute ทั้ง "วันเก่า" และ "วันใหม่" (และพนักงานเดิม/ใหม่หากเปลี่ยน)
    await recomputeAndUpsertEDS(before.employee_id, ymdUTC(before.leave_date));
    await recomputeAndUpsertEDS(updated.employee_id, ymdUTC(updated.leave_date));

    return res.json(updated);
  } catch (err) {
    if (err?.code === 'P2002') {
      return res.status(409).json({ error: 'Leave for this date already exists' });
    }
    console.error('[updateLeave]', err);
    return res.status(500).json({ error: 'Failed to update leave' });
  }
};

/* ------------------------ DELETE ------------------------ */

// DELETE /api/leaves/:id
export const deleteLeave = async (req, res) => {
  const id = Number(req.params.id);
  try {
    const removed = await prisma.leaveRequest.delete({ where: { leave_id: id } });

    // ✅ หลังลบให้คำนวณสถานะของวันนั้นใหม่
    await recomputeAndUpsertEDS(removed.employee_id, ymdUTC(removed.leave_date));

    return res.json({ message: `Leave ${id} deleted` });
  } catch (err) {
    console.error('[deleteLeave]', err);
    return res.status(500).json({ error: 'Failed to delete leave' });
  }
};
