// backend/controllers/jobAssignmentController.js
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/* ---------- helpers ---------- */

function todayYMDLocal() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function nextJobId() {
  const rows = await prisma.jobAssignment.findMany({ select: { id: true } });
  const max = rows.reduce((m, r) => {
    const mt = /^JOB(\d+)$/.exec(r.id || '');
    const n = mt ? parseInt(mt[1], 10) : 0;
    return n > m ? n : m;
  }, 0);
  return `JOB${String(max + 1).padStart(3, '0')}`;
}

function rangeOfDateLocal(ymd) {
  const base = ymd
    ? (() => {
        const [y, m, d] = ymd.split('-').map(Number);
        return new Date(y, (m || 1) - 1, d || 1);
      })()
    : new Date();

  const s = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, 0, 0, 0);
  const e = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 23, 59, 59, 999);
  return { start: s, end: e };
}

function dateOnly(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

// ตรวจว่ามีงานค้างของพนักงาน (ยังไม่ completed) ในวันเดียวกันอยู่หรือไม่
async function findOpenJobToday(employeeId, assignedDate) {
  const start = new Date(`${assignedDate}T00:00:00`);
  const end = new Date(`${assignedDate}T23:59:59.999`);
  return prisma.jobAssignment.findFirst({
    where: {
      employee_id: employeeId,
      assigned_date: { gte: start, lte: end },
      completed_at: null,
    },
    orderBy: [{ assigned_date: 'desc' }, { id: 'desc' }],
  });
}

/* ---------- CRUD / LIST ---------- */

// POST /api/job-assignments
export const create = async (req, res) => {
  try {
    const { employeeId, description, assignedDate, source } = req.body;

    // กันสร้างซ้อน
    const open = await findOpenJobToday(employeeId, assignedDate);
    if (open) {
      return res.status(409).json({
        error: 'พนักงานมีงานค้างอยู่แล้วในวันนี้ กรุณาจบงานเดิมก่อน',
        openId: open.id,
      });
    }

    const job = await prisma.jobAssignment.create({
      data: {
        employee_id: employeeId,
        job_description: description,
        assigned_date: new Date(`${assignedDate}T00:00:00`),
        source: source ?? 'MANUAL',
      },
    });

    res.json(job);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'สร้างงานไม่สำเร็จ' });
  }
};

// GET /api/job-assignments?employeeId=&from=&to=&q=&status=accepted|pending&includeCompleted=0|1
export const getAllJobAssignments = async (req, res) => {
  try {
    const { employeeId, from, to, q, status, includeCompleted } = req.query || {};

    const where = {};
    if (employeeId) where.employee_id = String(employeeId);
    if (q) where.job_description = { contains: String(q), mode: 'insensitive' };
    if (from || to) {
      where.assigned_date = {};
      if (from) where.assigned_date.gte = new Date(`${from}T00:00:00`);
      if (to) where.assigned_date.lte = new Date(`${to}T23:59:59.999`);
    }
    if (status) {
      const s = String(status).toLowerCase();
      if (s === 'accepted') where.accepted_at = { not: null };
      else if (s === 'pending') where.accepted_at = null;
    }
    // เริ่มต้นกรอง “ยังไม่เสร็จ” เว้นแต่ includeCompleted=1
    if (!includeCompleted || includeCompleted === '0') {
      where.completed_at = null;
    }

    const items = await prisma.jobAssignment.findMany({
      where,
      orderBy: [
        { assigned_date: 'desc' },
        { accepted_at: 'desc' },
        { id: 'desc' },
      ],
      include: {
        Employee: { select: { id: true, name: true, position: true } },
      },
    });

    res.json(items);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch job assignments' });
  }
};

// GET /api/job-assignments/:id
export const getJobAssignmentById = async (req, res) => {
  try {
    const { id } = req.params;
    const job = await prisma.jobAssignment.findUnique({
      where: { id },
      include: { Employee: { select: { id: true, name: true } } },
    });
    if (!job) return res.status(404).json({ error: 'Not found' });
    res.json(job);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch job assignment' });
  }
};

// POST /api/job-assignments
export const createJobAssignment = async (req, res) => {
  try {
    const { employeeId, description, assignedDate, source, accepted_at } = req.body || {};
    if (!employeeId || !description || !assignedDate) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const newId = await nextJobId();
    const assignedAt = new Date(`${assignedDate}T00:00:00`);

    const created = await prisma.jobAssignment.create({
      data: {
        id: newId,
        employee_id: String(employeeId),
        job_description: String(description),
        assigned_date: assignedAt,
        ...(source ? { source: String(source) } : {}),
        ...(accepted_at ? { accepted_at: new Date(accepted_at) } : {}),
      },
    });
    res.status(201).json(created);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to create job assignment' });
  }
};

// PUT /api/job-assignments/:id
export const updateJobAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    const { employeeId, description, assignedDate, source, accepted_at } = req.body || {};
    const data = {};
    if (employeeId !== undefined) data.employee_id = String(employeeId);
    if (description !== undefined) data.job_description = String(description);
    if (assignedDate !== undefined) data.assigned_date = new Date(`${assignedDate}T00:00:00`);
    if (source !== undefined) data.source = String(source);
    if (accepted_at !== undefined) data.accepted_at = accepted_at ? new Date(accepted_at) : null;

    const updated = await prisma.jobAssignment.update({ where: { id }, data });
    res.json(updated);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Job assignment not found' });
    console.error(e);
    res.status(500).json({ error: 'Failed to update job assignment' });
  }
};

// DELETE /api/job-assignments/:id
export const deleteJobAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.jobAssignment.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Job assignment not found' });
    console.error(e);
    res.status(500).json({ error: 'Failed to delete job assignment' });
  }
};

/* ---------- APIs สำหรับหน้าพนักงาน/ไลน์ ---------- */

// GET /api/job-assignments/by-date?date=YYYY-MM-DD&includeCompleted=0|1
export const latestByDate = async (req, res) => {
  try {
    const { date, includeCompleted } = req.query || {};
    const ymd = date || todayYMDLocal();
    const start = new Date(`${ymd}T00:00:00`);
    const end = new Date(`${ymd}T23:59:59.999`);

    const where = { assigned_date: { gte: start, lte: end } };
    if (!includeCompleted || includeCompleted === '0') where.completed_at = null;

    const rows = await prisma.jobAssignment.findMany({
      where,
      orderBy: [
        { assigned_date: 'desc' },
        { accepted_at: 'desc' },
        { id: 'desc' },
      ],
      select: {
        id: true,
        employee_id: true,
        job_description: true,
        assigned_date: true,
        source: true,
        accepted_at: true,
        completed_at: true,
      },
    });

    // เลือกล่าสุดของแต่ละพนักงาน
    const pick = new Map();
    for (const r of rows) if (!pick.has(r.employee_id)) pick.set(r.employee_id, r);

    const result = Array.from(pick.entries()).map(([employee_id, assignment]) => {
      let status = 'FREE';
      if (assignment) {
        if (assignment.completed_at) status = 'FREE';
        else if (assignment.accepted_at) status = 'IN_PROGRESS';
        else status = 'PENDING';
      }
      return { employee_id, status, assignment };
    });

    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load today assignments' });
  }
};

// POST /api/job-assignments/accept
export const acceptLatestForEmployee = async (req, res) => {
  try {
    const employeeId = (req.body?.employeeId || '').toUpperCase();
    const date = req.body?.date || undefined; // ถ้าไม่ส่งมา จะใช้วันนี้ใน core

    const result = await acceptLatestForEmployeeCore(employeeId, date);

    if (!result.ok && result.error === 'NOT_FOUND') {
      return res.status(404).json({ error: 'ไม่พบนัดหมายงานของวันนี้' });
    }

    return res.json(result);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'รับงานไม่สำเร็จ' });
  }
};

// POST /api/job-assignments/:id/accept
export const acceptJobById = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await prisma.jobAssignment.update({
      where: { id },
      data: { accepted_at: new Date() },
    });
    res.json({ ok: true, updated });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Job not found' });
    console.error(e);
    res.status(500).json({ error: 'Accept failed' });
  }
};

// GET /api/job-assignments/employee/:employeeId/history?from=&to=
export const historyForEmployee = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { from, to } = req.query || {};
    if (!employeeId) return res.status(400).json({ error: 'employeeId required' });

    const where = { employee_id: String(employeeId) };
    if (from || to) {
      where.assigned_date = {};
      if (from) where.assigned_date.gte = new Date(`${from}T00:00:00`);
      if (to) where.assigned_date.lte = new Date(`${to}T23:59:59.999`);
    }

    const rows = await prisma.jobAssignment.findMany({
      where,
      orderBy: [{ assigned_date: 'desc' }, { accepted_at: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        employee_id: true,
        job_description: true,
        assigned_date: true,
        source: true,
        accepted_at: true,
        completed_at: true,
      },
    });

    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load job history' });
  }
};

/* ---------- ✅ ใหม่: ปิดงาน / ย้อนสถานะ ---------- */

// PATCH /api/job-assignments/:id/complete  (body: { note?, staffId? })
export const completeJobById = async (req, res) => {
  try {
    const { id } = req.params;
    const { note, staffId } = req.body || {};

    // 1) ปิดงานในตารางงาน
    const job = await prisma.jobAssignment.update({
      where: { id },
      data: {
        completed_at: new Date(),
        ...(note ? { completed_note: String(note) } : {}),
        ...(staffId ? { completed_by: Number(staffId) } : {}),
      },
    });

    // 2) บันทึก DayStatus ให้เป็น OFF_DUTY ของ "วันที่มอบหมาย" แบบปลอดภัย
    try {
      const workDate = dateOnly(new Date(job.assigned_date));

      const upd = await prisma.employeeDayStatus.updateMany({
        where: { employee_id: job.employee_id, work_date: workDate },
        data: { status: 'OFF_DUTY', source: 'MANUAL' },
      });

      if (upd.count === 0) {
        await prisma.employeeDayStatus.createMany({
          data: [
            {
              employee_id: job.employee_id,
              work_date: workDate,
              status: 'OFF_DUTY',
              source: 'MANUAL',
            },
          ],
          skipDuplicates: true,
        });
      }
    } catch (dsErr) {
      // log ไว้อย่างเดียว ไม่ให้ล้มการปิดงาน
      console.error('[completeJobById] write DayStatus failed:', dsErr);
    }

    return res.json({ ok: true, job });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Job not found' });
    console.error(e);
    return res.status(500).json({ error: 'Complete failed' });
  }
};

// ฟังก์ชัน core สำหรับรับงาน (ใช้ในไลน์)
export async function acceptLatestForEmployeeCore(employeeId, dateStr) {
  const { start, end } = rangeOfDateLocal(dateStr);

  // 1) ถ้ามีงานที่ "รับแล้วและยังไม่จบ" อยู่ในวันนี้ → ห้ามรับซ้ำ
  const inProgress = await prisma.jobAssignment.findFirst({
    where: {
      employee_id: employeeId,
      assigned_date: { gte: start, lte: end },
      accepted_at: { not: null },
      completed_at: null,
    },
    orderBy: { id: 'desc' },
  });
  if (inProgress) {
    return { ok: false, error: 'ALREADY_IN_PROGRESS', current: inProgress };
  }

  // 2) หา "งานที่ยังไม่รับ (pending) และยังไม่จบ" ล่าสุดของวันนี้
  const open = await prisma.jobAssignment.findFirst({
    where: {
      employee_id: employeeId,
      assigned_date: { gte: start, lte: end },
      accepted_at: null,
      completed_at: null,
    },
    orderBy: { id: 'desc' },
  });

  if (!open) return { ok: false, error: 'NOT_FOUND' };

  // 3) mark accept
  const updated = await prisma.jobAssignment.update({
    where: { id: open.id },
    data: { accepted_at: new Date() },
  });

  return { ok: true, updated };
}

// PATCH /api/job-assignments/:id/reopen
export const reopenJobById = async (req, res) => {
  try {
    const { id } = req.params;
    const job = await prisma.jobAssignment.update({
      where: { id },
      data: { completed_at: null, completed_note: null, completed_by: null },
    });
    return res.json({ ok: true, job });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Job not found' });
    console.error(e);
    return res.status(500).json({ error: 'Reopen failed' });
  }
};
