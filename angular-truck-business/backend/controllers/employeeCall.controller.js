// controllers/employeeCall.controller.js
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/* -------------------------- helpers -------------------------- */
// gen RUNNING id: JOB001, JOB002, ...
async function nextJobId(db = prisma) {
  const rows = await db.jobAssignment.findMany({ select: { id: true } });
  const max = rows.reduce((m, r) => {
    const mt = /^JOB(\d+)$/.exec(r.id || '');
    const n = mt ? parseInt(mt[1], 10) : 0;
    return n > m ? n : m;
  }, 0);
  return `JOB${String(max + 1).padStart(3, '0')}`;
}

/* --------------------------- list ---------------------------- */
/** GET /api/employee-calls  (list + filter) */
export const listEmployeeCalls = async (req, res) => {
  try {
    const { employeeId, q, from, to, page = 1, pageSize = 20 } = req.query;
    const where = {};

    if (employeeId) where.employee_id = String(employeeId);
    if (q) where.message = { contains: String(q), mode: 'insensitive' };
    if (from || to) {
      where.call_date = {};
      if (from) where.call_date.gte = new Date(`${from}T00:00:00`);
      if (to)   where.call_date.lte = new Date(`${to}T23:59:59.999`);
    }

    const skip = (Number(page) - 1) * Number(pageSize);
    const [items, total] = await Promise.all([
      prisma.employeeCall.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: Number(pageSize),
        include: { Employee: { select: { id: true, name: true, position: true } } },
      }),
      prisma.employeeCall.count({ where }),
    ]);

    res.json({ items, total, page: Number(page), pageSize: Number(pageSize) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch employee calls' });
  }
};

/* ---------------------------- get ---------------------------- */
/** GET /api/employee-calls/:id */
export const getEmployeeCall = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const item = await prisma.employeeCall.findUnique({
      where: { id },
      include: { Employee: { select: { id: true, name: true } } },
    });
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch' });
  }
};

/* -------------------------- create --------------------------- */
/**
 * POST /api/employee-calls
 * body: { employeeId, callDate(YYYY-MM-DD), message, source? }
 * สร้าง EmployeeCall และผูก JobAssignment อัตโนมัติ (source ค่าเริ่มต้น 'LINE')
 */
export const createEmployeeCall = async (req, res) => {
  try {
    const { employeeId, callDate, message, source } = req.body || {};
    if (!employeeId || !callDate || !message) {
      return res.status(400).json({ error: 'employeeId/callDate/message จำเป็น' });
    }

    const assignedDate = new Date(`${callDate}T00:00:00`);

    const result = await prisma.$transaction(async (tx) => {
      // 1) บันทึก Call
      const callRow = await tx.employeeCall.create({
        data: {
          employee_id: String(employeeId),
          call_date: assignedDate,
          message: String(message),
        },
      });

      // 2) บันทึก JobAssignment (หนึ่งงานใหม่ ตาม call นี้)
      const newId = await nextJobId(tx);
      const jobRow = await tx.jobAssignment.create({
        data: {
          id: newId,
          employee_id: String(employeeId),
          job_description: String(message), // ใช้ข้อความ call เป็นรายละเอียดงาน
          assigned_date: assignedDate,
          source: String(source || 'LINE'), // เริ่มต้นถือว่าเกิดจากแชท
          // accepted_at: null // ไม่ต้องใส่ก็ได้ ค่าดีฟอลต์เป็น NULL
        },
      });

      return { call: callRow, assignment: jobRow };
    });

    res.status(201).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Create failed' });
  }
};

/* --------------------------- update -------------------------- */
/** PUT /api/employee-calls/:id */
export const updateEmployeeCall = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { employeeId, callDate, message } = req.body || {};

    const data = {};
    if (employeeId !== undefined) data.employee_id = String(employeeId);
    if (callDate !== undefined) data.call_date = new Date(`${callDate}T00:00:00`);
    if (typeof message === 'string') data.message = message;

    const updated = await prisma.employeeCall.update({ where: { id }, data });
    res.json(updated);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Not found' });
    console.error(err);
    res.status(500).json({ error: 'Update failed' });
  }
};

/* --------------------------- delete -------------------------- */
/** DELETE /api/employee-calls/:id */
export const deleteEmployeeCall = async (req, res) => {
  try {
    const id = Number(req.params.id);
    await prisma.employeeCall.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Not found' });
    console.error(err);
    res.status(500).json({ error: 'Delete failed' });
  }
};
// controllers/workYearController.js