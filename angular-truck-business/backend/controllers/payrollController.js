// backend/controllers/payrollController.js
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/** ---------- helpers ---------- */
const toNum = (v) => Number(v ?? 0);
const calcNet = ({ base_salary, allowance = 0, overtime = 0, deduction = 0 }) =>
  toNum(base_salary) + toNum(allowance) + toNum(overtime) - toNum(deduction);

/** รวมเฉพาะรายการที่จ่ายแล้ว (PAID) ไปอัปเดตรวมของงวด */
async function recomputeRunTotal(runId) {
  const agg = await prisma.payrollItem.aggregate({
    _sum: { net_amount: true },
    where: { payroll_run_id: runId, status: 'PAID' }
  });
  const total = toNum(agg._sum.net_amount);
  await prisma.payrollRun.update({ where: { id: runId }, data: { total } });
  return total;
}

/** สร้าง InvoiceYear หากยังไม่มี (เพื่อให้สอดคล้องกับ createPayrollRun เดิมของคุณ) */
async function ensureInvoiceYear(year) {
  await prisma.invoiceYear.upsert({
    where: { year: Number(year) },
    update: {},
    create: { year: Number(year) }
  });
}

/** หา/สร้างงวดจากปี-เดือน โดยไม่พึ่ง unique composite (กันชนกันเองในระดับโค้ด) */
async function ensureRunByYearMonth(year, month, { title, note } = {}) {
  const y = Number(year), m = Number(month);
  if (!y || !m) throw new Error('year & month required');

  // พยายามหาอยู่ก่อน
  let run = await prisma.payrollRun.findFirst({ where: { year: y, month: m } });
  if (run) return run;

  // กันชนผ่าน try/catch เผื่อ race
  try {
    await ensureInvoiceYear(y);
    run = await prisma.payrollRun.create({
      data: {
        year: y,
        month: m,
        // ไม่บังคับ status เพราะสคีมาของคุณอาจเป็น ENUM จำกัดค่า
        title: title ?? null,
        note: note ?? null,
        // ไม่ตั้ง total ตอนสร้าง ปล่อยให้เป็นค่า default หรือ 0 ใน DB
      }
    });
    return run;
  } catch (e) {
    // ถ้าเจอ unique ที่ระดับ DB (กรณีคุณมี @@unique อยู่แล้ว) ก็ไปดึงกลับมา
    if (e?.code === 'P2002') {
      return await prisma.payrollRun.findFirst({ where: { year: y, month: m } });
    }
    throw e;
  }
}

/** ---------- Summary: /summary/by-month ---------- */
// GET /api/payroll/summary/by-month?year=2025&basis=paidAt|run
export async function getPayrollSummaryByMonth(req, res) {
  try {
    const year = Number(req.query.year);
    const basis = String(req.query.basis || 'paidAt'); // default: แสดง "จ่ายจริง"
    if (!year) return res.status(400).json({ message: 'year is required' });

    let rows = [];
    if (basis === 'run') {
      // รวมตามงวด (วางแผน) — sum net_amount ทุก item ในงวดของปีนั้น (ไม่ดูสถานะ)
      rows = await prisma.$queryRaw/*sql*/`
        SELECT pr.month AS m, COALESCE(SUM(pi.net_amount),0) AS total
        FROM PayrollRun pr
        JOIN PayrollItem pi ON pi.payroll_run_id = pr.id
        WHERE pr.year = ${year}
        GROUP BY pr.month
        ORDER BY pr.month
      `;
    } else {
      // รวมตามจ่ายจริง (paid_at) และสถานะ PAID
      rows = await prisma.$queryRaw/*sql*/`
        SELECT MONTH(pi.paid_at) AS m, COALESCE(SUM(pi.net_amount),0) AS total
        FROM PayrollItem pi
        WHERE pi.paid_at IS NOT NULL AND YEAR(pi.paid_at) = ${year} AND pi.status = 'PAID'
        GROUP BY MONTH(pi.paid_at)
        ORDER BY m
      `;
    }
    const totals = Array(12).fill(0);
    for (const r of rows) {
      const m = Number(r.m);
      const t = toNum(r.total);
      if (m >= 1 && m <= 12) totals[m - 1] = t;
    }
    return res.json({ year, totals });
  } catch (e) {
    console.error('getPayrollSummaryByMonth error:', e);
    return res.status(500).json({ message: 'failed', error: e.message });
  }
}

/** ---------- List month ---------- */
// GET /api/payroll?year=2025&month=9
export async function listPayrollByMonth(req, res) {
  try {
    const year = Number(req.query.year);
    const month = Number(req.query.month);
    if (!year || !month) return res.status(400).json({ message: 'year & month required' });

    const run = await prisma.payrollRun.findFirst({
      where: { year, month },
      include: { items: { orderBy: { id: 'asc' } } }
    });

    if (!run) return res.json({ run: null, items: [] });

    // decorate items with employee info + numbers
    const empIds = run.items.map(i => i.employee_id).filter(Boolean);
    const emps = empIds.length
      ? await prisma.employee.findMany({
          where: { id: { in: empIds } },
          select: { id: true, name: true, position: true }
        })
      : [];
    const emap = new Map(emps.map(e => [e.id, e]));

    const items = run.items.map(it => ({
      ...it,
      base_salary: toNum(it.base_salary),
      allowance: toNum(it.allowance),
      overtime: toNum(it.overtime),
      deduction: toNum(it.deduction),
      net_amount: toNum(it.net_amount),
      employeeName: it.employee_id ? (emap.get(it.employee_id)?.name ?? '-') : '-',
      position: it.employee_id ? (emap.get(it.employee_id)?.position ?? '-') : '-'
    }));

    return res.json({ run, items });
  } catch (e) {
    console.error('listPayrollByMonth error:', e);
    return res.status(500).json({ message: 'failed', error: e.message });
  }
}

/** ---------- Run CRUD (เดิมของคุณ) ---------- */
// POST /api/payroll/runs { year, month, title?, note? }
export async function createPayrollRun(req, res) {
  try {
    const { year, month, title, note } = req.body || {};
    if (!year || !month) return res.status(400).json({ message: 'year & month required' });

    await ensureInvoiceYear(year);

    const run = await prisma.payrollRun.create({
      data: { year: Number(year), month: Number(month), title: title ?? null, note: note ?? null }
    });
    res.status(201).json(run);
  } catch (e) {
    if (e?.code === 'P2002') {
      return res.status(409).json({ message: 'งวดนี้ถูกสร้างไว้แล้ว' });
    }
    console.error('createPayrollRun error:', e);
    res.status(500).json({ message: 'failed', error: e.message });
  }
}

// PATCH /api/payroll/runs/:runId
export async function updatePayrollRun(req, res) {
  try {
    const runId = Number(req.params.runId);
    const { title, note, status } = req.body || {};
    const data = {};
    if (title !== undefined) data.title = title ?? null;
    if (note !== undefined) data.note = note ?? null;
    if (status !== undefined) data.status = status;

    const run = await prisma.payrollRun.update({ where: { id: runId }, data });
    res.json(run);
  } catch (e) {
    console.error('updatePayrollRun error:', e);
    res.status(500).json({ message: 'failed', error: e.message });
  }
}

// DELETE /api/payroll/runs/:runId
export async function deletePayrollRun(req, res) {
  try {
    const runId = Number(req.params.runId);
    await prisma.payrollItem.deleteMany({ where: { payroll_run_id: runId } });
    await prisma.payrollRun.delete({ where: { id: runId } });
    res.json({ ok: true });
  } catch (e) {
    console.error('deletePayrollRun error:', e);
    res.status(500).json({ message: 'failed', error: e.message });
  }
}

/** ---------- Item CRUD (เดิมของคุณ: อิง runId) ---------- */
// POST /api/payroll/runs/:runId/items
export async function createPayrollItem(req, res) {
  try {
    const runId = Number(req.params.runId);
    const { employee_id, base_salary, allowance = 0, overtime = 0, deduction = 0, note } = req.body || {};
    if (!employee_id || base_salary == null) {
      return res.status(400).json({ message: 'employee_id & base_salary required' });
    }
    const net = calcNet({ base_salary, allowance, overtime, deduction });

    const item = await prisma.payrollItem.create({
      data: {
        payroll_run_id: runId,
        employee_id,
        base_salary,
        allowance,
        overtime,
        deduction,
        net_amount: net,
        note: note ?? null
      }
    });

    // ไม่รวมใน total (ยัง UNPAID)
    res.status(201).json(item);
  } catch (e) {
    if (e?.code === 'P2002') {
      return res.status(409).json({ message: 'พนักงานคนนี้ถูกเพิ่มในงวดนี้แล้ว' });
    }
    console.error('createPayrollItem error:', e);
    res.status(500).json({ message: 'failed', error: e.message });
  }
}

// PATCH /api/payroll/items/:itemId
export async function updatePayrollItem(req, res) {
  try {
    const itemId = Number(req.params.itemId);
    const patch = req.body || {};
    const fields = ['base_salary', 'allowance', 'overtime', 'deduction', 'note', 'status', 'employee_id'];
    const data = {};
    for (const f of fields) if (patch[f] !== undefined) data[f] = patch[f];

    // ถ้ามีเลขยอด → คำนวณ net ใหม่
    if (['base_salary', 'allowance', 'overtime', 'deduction'].some(k => patch[k] !== undefined)) {
      const current = await prisma.payrollItem.findUnique({ where: { id: itemId } });
      const next = {
        base_salary: patch.base_salary ?? current.base_salary,
        allowance: patch.allowance ?? current.allowance,
        overtime: patch.overtime ?? current.overtime,
        deduction: patch.deduction ?? current.deduction
      };
      data.net_amount = calcNet(next);
    }

    const updated = await prisma.payrollItem.update({ where: { id: itemId }, data });

    // ถ้ามีผลกับ total (กรณีเป็น PAID) → อัปเดตรวม
    await recomputeRunTotal(updated.payroll_run_id);

    res.json(updated);
  } catch (e) {
    console.error('updatePayrollItem error:', e);
    res.status(500).json({ message: 'failed', error: e.message });
  }
}

// DELETE /api/payroll/items/:itemId
export async function deletePayrollItem(req, res) {
  try {
    const itemId = Number(req.params.itemId);
    const existed = await prisma.payrollItem.findUnique({ where: { id: itemId } });
    if (!existed) return res.status(404).json({ message: 'not found' });

    await prisma.payrollItem.delete({ where: { id: itemId } });
    await recomputeRunTotal(existed.payroll_run_id);
    res.json({ ok: true });
  } catch (e) {
    console.error('deletePayrollItem error:', e);
    res.status(500).json({ message: 'failed', error: e.message });
  }
}

/** ---------- Pay salary ---------- */
// POST /api/payroll/items/:itemId/pay  { paid_at?: 'YYYY-MM-DD' }
export async function payPayrollItem(req, res) {
  try {
    const itemId = Number(req.params.itemId);
    const paid_at = req.body?.paid_at ? new Date(req.body.paid_at) : new Date();

    const updated = await prisma.payrollItem.update({
      where: { id: itemId },
      data: { status: 'PAID', paid_at }
    });

    const total = await recomputeRunTotal(updated.payroll_run_id);
    res.json({ ok: true, run_total: total });
  } catch (e) {
    console.error('payPayrollItem error:', e);
    res.status(500).json({ message: 'failed', error: e.message });
  }
}

/** ===================================================================== */
/** =====================  เพิ่มตามที่ขอมาครับ  ======================== */
/** ===================================================================== */

/** 1) Ensure งวดเงินเดือนตามปี/เดือน (ถ้ายังไม่มีให้สร้าง)
 * POST /api/payroll/ensure-run  { year, month, title?, note? }
 * ตอบกลับ: { run }
 */
export async function ensurePayrollRunByYM(req, res) {
  try {
    const { year, month, title, note } = req.body || {};
    if (!year || !month) return res.status(400).json({ message: 'year/month จำเป็น' });

    await ensureInvoiceYear(year);
    const run = await ensureRunByYearMonth(year, month, { title, note });
    return res.json({ run });
  } catch (e) {
    console.error('ensurePayrollRunByYM error:', e);
    return res.status(500).json({ message: 'ensure payroll run failed', error: e.message });
  }
}

/** 2) เพิ่มรายการเงินเดือน โดยส่ง year/month (ถ้า run ไม่มีจะสร้างให้)
 * POST /api/payroll/items/by-ym
 * body: { year, month, employee_id, base_salary, allowance?, overtime?, deduction?, note? }
 * ตอบกลับ: { ok: true, itemId, run_id }
 */
export async function createPayrollItemByYM(req, res) {
  try {
    const { year, month, employee_id, base_salary, allowance = 0, overtime = 0, deduction = 0, note = null } = req.body || {};
    if (!year || !month || !employee_id || base_salary == null) {
      return res.status(400).json({ message: 'year, month, employee_id, base_salary จำเป็น' });
    }

    await ensureInvoiceYear(year);
    const run = await ensureRunByYearMonth(year, month);

    // กันซ้ำพนักงานในงวดเดียวกัน
    const existed = await prisma.payrollItem.findFirst({
      where: { payroll_run_id: run.id, employee_id: String(employee_id) }
    });
    if (existed) return res.status(400).json({ message: 'พนักงานคนนี้มีรายการในงวดแล้ว' });

    const net = calcNet({ base_salary, allowance, overtime, deduction });

    const item = await prisma.payrollItem.create({
      data: {
        payroll_run_id: run.id,
        employee_id: String(employee_id),
        base_salary: Number(base_salary),
        allowance: Number(allowance || 0),
        overtime: Number(overtime || 0),
        deduction: Number(deduction || 0),
        net_amount: net,
        status: 'UNPAID',       // ยังไม่นับใน run.total จนกว่าจะ pay
        note: note ?? null
      }
    });

    // เพื่อความสม่ำเสมอของยอดรวม (นับเฉพาะ PAID) ก็ยังสามารถ recompute ได้ ปลอดภัย
    await recomputeRunTotal(run.id);

    return res.status(201).json({ ok: true, itemId: item.id, run_id: run.id });
  } catch (e) {
    if (e?.code === 'P2002') {
      // เผื่อมี unique index (payroll_run_id, employee_id)
      return res.status(409).json({ message: 'พนักงานคนนี้ถูกเพิ่มในงวดนี้แล้ว' });
    }
    console.error('createPayrollItemByYM error:', e);
    return res.status(500).json({ message: 'create payroll item failed', error: e.message });
  }
}
