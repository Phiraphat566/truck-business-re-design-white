// controllers/incomeController.js
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const prisma = new PrismaClient();

/* =========================================
 * Upload config (เหมือนเดิม)
 * =======================================*/
const UPLOAD_DIR = 'uploads/contracts';

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureUploadDir();
    cb(null, UPLOAD_DIR + '/');
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now();
    cb(null, `income_${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

// อนุญาตเฉพาะรูป และจำกัด ~5MB
function fileFilter(_req, file, cb) {
  const ok = /image\/(png|jpe?g|webp|gif)/i.test(file.mimetype);
  if (!ok) return cb(new Error('Only image files are allowed (png,jpg,jpeg,webp,gif)'));
  cb(null, true);
}

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

/* =========================================
 * Helpers
 * =======================================*/
const parseAmount = (val) => {
  if (val === undefined || val === null || val === '') return undefined;
  const num = Number(val);
  if (Number.isNaN(num)) return undefined;
  return Number(num.toFixed(2));
};

const parseISODate = (val) => {
  if (!val) return undefined;
  const d = new Date(val);
  if (isNaN(d.getTime())) return undefined;
  return d;
};

const removeFileIfExists = (p) => {
  if (!p) return;
  try {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch (e) {
    console.warn('Remove file failed:', p, e?.message);
  }
};

/* =========================================
 * Core calculators for Income (เหมือน Invoice)
 * =======================================*/
async function sumPaidIncome(incomeId) {
  const agg = await prisma.paymentRecord.aggregate({
    _sum: { amount: true },
    where: { income_id: incomeId },
  });
  return Number(agg._sum.amount ?? 0);
}

function deriveIncomeStatus(head, paidAmount, now = new Date()) {
  const total = Number(head.amount);
  const remaining = Math.max(total - paidAmount, 0);
  if (remaining <= 0) return 'PAID'; // รับครบ
  if (head.dueDate && new Date(head.dueDate) < now) return 'OVERDUE';
  if (paidAmount > 0) return 'PARTIAL';
  return 'PENDING';
}

async function recomputeIncomeStatus(incomeId) {
  const head = await prisma.income.findUnique({
    where: { id: incomeId },
    select: { amount: true, dueDate: true },
  });
  if (!head) return { status: 'PENDING', paidAmount: 0, remaining: Number(head?.amount ?? 0) };

  const paidAmount = await sumPaidIncome(incomeId);
  const status = deriveIncomeStatus(head, paidAmount);

  // receivedAt = งวดล่าสุดเมื่อสถานะเป็น PAID
  let receivedAt = null;
  if (status === 'PAID') {
    const last = await prisma.paymentRecord.findFirst({
      where: { income_id: incomeId },
      orderBy: { payment_date: 'desc' },
      select: { payment_date: true },
    });
    receivedAt = last?.payment_date ?? new Date();
  }

  await prisma.income.update({
    where: { id: incomeId },
    data: { status, receivedAt },
  });

  const total = Number(head.amount);
  const remaining = Math.max(total - paidAmount, 0);
  return { status, paidAmount, remaining, receivedAt };
}

/* =========================================
 * Endpoints
 * =======================================*/

/**
 * สร้าง Income (หัวเอกสารเงินเข้า)
 * body: { receiptNo, customerName?, contractDate, dueDate?, amount, description?, category? }
 * multipart/form-data: file (รูปแนบ)
 */
export const createIncome = async (req, res) => {
  const {
    receiptNo,
    customerName,
    contractDate,
    dueDate,
    amount,
    description,
    category,
  } = req.body;

  const contract_image_path = req.file ? `${UPLOAD_DIR}/${req.file.filename}` : null;

  try {
    if (!receiptNo) {
      removeFileIfExists(contract_image_path);
      return res.status(400).json({ message: 'receiptNo is required' });
    }
    const parsedAmount = parseAmount(amount);
    if (parsedAmount === undefined || parsedAmount <= 0) {
      removeFileIfExists(contract_image_path);
      return res.status(400).json({ message: 'amount is required and must be > 0' });
    }
    const cDate = parseISODate(contractDate);
    if (!cDate) {
      removeFileIfExists(contract_image_path);
      return res.status(400).json({ message: 'contractDate is required (ISO date)' });
    }
    const dDate = parseISODate(dueDate);

    const income = await prisma.income.create({
      data: {
        receiptNo,
        customerName: customerName ?? null,
        contractDate: cDate,
        dueDate: dDate ?? null,
        amount: parsedAmount,
        description: description ?? null,
        category: category ?? null,
        contract_image_path,
        // status = PENDING (default)
      },
    });

    res.status(201).json(income);
  } catch (error) {
    console.error('createIncome error:', error);
    removeFileIfExists(contract_image_path);
    res.status(400).json({ message: 'Cannot create income', error: error.message });
  }
};

/**
 * ดึง Income + งวดชำระทั้งหมด
 * GET /api/income/:id
 */
export const getIncomeById = async (req, res) => {
  try {
    const id = Number(req.params.id);

    const income = await prisma.income.findUnique({
      where: { id },
      include: { payments: { orderBy: { payment_date: 'asc' } } },
    });
    if (!income) return res.status(404).json({ message: 'Income not found' });

    const paidAmount = income.payments.reduce((s, x) => s + Number(x.amount), 0);
    const remaining = Math.max(Number(income.amount) - paidAmount, 0);
    const computedStatus = deriveIncomeStatus(income, paidAmount);

    res.json({ ...income, paidAmount, remaining, status: computedStatus });
  } catch (error) {
    console.error('getIncomeById error:', error);
    res.status(400).json({ message: 'Cannot get income', error: error.message });
  }
};

/**
 * อัปเดต Income (กันเคสยอดใหม่ < ยอดที่รับไปแล้ว)
 */
export const updateIncome = async (req, res) => {
  const { id } = req.params;
  const {
    receiptNo,
    customerName,
    contractDate,
    dueDate,
    amount,
    description,
    category,
  } = req.body;
  const newFilePath = req.file ? `${UPLOAD_DIR}/${req.file.filename}` : null;

  try {
    const current = await prisma.income.findUnique({ where: { id: Number(id) } });
    if (!current) {
      removeFileIfExists(newFilePath);
      return res.status(404).json({ message: 'Income not found' });
    }

    const data = {};
    if (receiptNo !== undefined)    data.receiptNo = receiptNo;
    if (customerName !== undefined) data.customerName = customerName;
    if (contractDate !== undefined) data.contractDate = parseISODate(contractDate);
    if (dueDate !== undefined)      data.dueDate = parseISODate(dueDate);
    if (description !== undefined)  data.description = description ?? null;
    if (category !== undefined)     data.category = category ?? null;
    if (newFilePath)                data.contract_image_path = newFilePath;
    if (amount !== undefined) {
      const parsed = parseAmount(amount);
      if (parsed === undefined || parsed <= 0) {
        removeFileIfExists(newFilePath);
        return res.status(400).json({ message: 'amount must be > 0' });
      }
      // ป้องกันยอดใหม่ < ยอดที่รับไปแล้ว
      const paid = await sumPaidIncome(Number(id));
      if (paid > parsed) {
        removeFileIfExists(newFilePath);
        return res.status(400).json({
          message: `ยอดที่รับไปแล้ว (${paid}) มากกว่ายอดใหม่ (${parsed})`,
        });
      }
      data.amount = parsed;
    }

    // อัปเดต
    await prisma.income.update({ where: { id: Number(id) }, data });

    // ลบไฟล์เก่าถ้าอัปโหลดใหม่สำเร็จ
    if (newFilePath && current.contract_image_path && current.contract_image_path !== newFilePath) {
      removeFileIfExists(current.contract_image_path);
    }

    // คำนวณสถานะล่าสุด
    const stats = await recomputeIncomeStatus(Number(id));

    // ส่งข้อมูลล่าสุดกลับ (แนบ payments)
    const fresh = await prisma.income.findUnique({
      where: { id: Number(id) },
      include: { payments: { orderBy: { payment_date: 'asc' } } },
    });

    res.json({
      ...fresh,
      paidAmount: stats.paidAmount,
      remaining: stats.remaining,
      status: stats.status,
    });
  } catch (error) {
    console.error('updateIncome error:', error);
    removeFileIfExists(newFilePath);
    res.status(400).json({ message: 'Cannot update income', error: error.message });
  }
};

/**
 * ลบ Income (จะ cascade ลบงวดใน PaymentRecord ตาม relation), ลบไฟล์แนบด้วย
 */
export const deleteIncome = async (req, res) => {
  const { id } = req.params;
  try {
    const current = await prisma.income.findUnique({ where: { id: Number(id) } });
    if (!current) return res.status(404).json({ message: 'Income not found' });

    await prisma.income.delete({ where: { id: Number(id) } });
    if (current.contract_image_path) removeFileIfExists(current.contract_image_path);

    res.json({ ok: true });
  } catch (error) {
    console.error('deleteIncome error:', error);
    res.status(400).json({ message: 'Cannot delete income', error: error.message });
  }
};

/**
 * ดึงรายการ Income (รองรับ filter) — เหมือน listInvoices
 * query: year, month (1-12), status (PENDING|OVERDUE|PAID|PARTIAL), q, basis (contractDate|dueDate|receivedAt)
 */
export const listIncomes = async (req, res) => {
  try {
    const { year, month, status, q, basis } = req.query;

    const dateCol =
      basis === 'dueDate'    ? 'dueDate' :
      basis === 'receivedAt' ? 'receivedAt' :
      'contractDate';

    const where = {};
    // ปี/เดือน
    if (year) {
      const y = Number(year);
      if (month) {
        const m = Number(month);
        const start = new Date(Date.UTC(y, m - 1, 1));
        const end   = new Date(Date.UTC(y, m, 1));
        Object.assign(where, { [dateCol]: { gte: start, lt: end } });
      } else {
        const start = new Date(Date.UTC(y, 0, 1));
        const end   = new Date(Date.UTC(y + 1, 0, 1));
        Object.assign(where, { [dateCol]: { gte: start, lt: end } });
      }
    }
    // คำค้น
    if (q) {
      where.OR = [
        { receiptNo:    { contains: q } },
        { customerName: { contains: q } },
        { description:  { contains: q } },
        { category:     { contains: q } },
      ];
    }

    const incomes = await prisma.income.findMany({
      where,
      orderBy: [{ [dateCol]: 'desc' }, { id: 'desc' }],
    });

    if (incomes.length === 0) return res.json([]);

    // ดึงยอดรวมที่รับแล้วของแต่ละหัวครั้งเดียว
    const sums = await prisma.paymentRecord.groupBy({
      by: ['income_id'],
      _sum: { amount: true },
      where: { income_id: { in: incomes.map(i => i.id) } },
    });
    const paidMap = new Map(sums.map(s => [s.income_id, Number(s._sum.amount || 0)]));

    const now = new Date();
    const data = incomes.map(head => {
      const paidAmount = paidMap.get(head.id) || 0;
      const total = Number(head.amount);
      const remaining = Math.max(total - paidAmount, 0);
      const computedStatus = deriveIncomeStatus(head, paidAmount, now);
      return { ...head, status: computedStatus, paidAmount, remaining };
    });

    // กรองสถานะจากที่คำนวณใหม่ถ้าส่งมา
    const filtered = status ? data.filter(d => d.status === status) : data;

    res.json(filtered);
  } catch (error) {
    console.error('listIncomes error:', error);
    res.status(400).json({ message: 'Cannot list incomes', error: error.message });
  }
};

/**
 * เพิ่มงวด “เงินเข้า” ให้ Income
 * POST /api/income/:id/payments  body: { amount, paidAt?, description?, category? }
 */
export const createIncomePayment = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { amount, paidAt, description, category } = req.body;

    const add = parseAmount(amount);
    if (!add || add <= 0) {
      return res.status(400).json({ message: 'amount ต้องมากกว่า 0' });
    }

    const income = await prisma.income.findUnique({ where: { id } });
    if (!income) return res.status(404).json({ message: 'Income not found' });

    const paid = await sumPaidIncome(id);
    const total = Number(income.amount);

    if (paid + add > total) {
      return res.status(400).json({ message: 'ยอดรวมหลังรับเกินยอดหัว Income' });
    }

    await prisma.paymentRecord.create({
      data: {
        income_id: id, // สำคัญ: ใช้ income_id เท่านั้น (ห้าม invoice_id)
        payment_date: paidAt ? new Date(paidAt) : new Date(),
        amount: add,
        description: description ?? 'รับเงินงวด',
        category: category ?? 'INCOME',
      },
    });

    const stats = await recomputeIncomeStatus(id);
    res.json({ ok: true, paidAmount: stats.paidAmount, remaining: stats.remaining, status: stats.status });
  } catch (error) {
    console.error('createIncomePayment error:', error);
    res.status(400).json({ message: 'Cannot create income payment', error: error.message });
  }
};

/**
 * ดูประวัติงวดเงินเข้า
 * GET /api/income/:id/payments
 */
export const listIncomePayments = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const payments = await prisma.paymentRecord.findMany({
      where: { income_id: id },
      orderBy: { payment_date: 'asc' },
      select: { id: true, payment_date: true, amount: true, description: true, category: true },
    });
    res.json(payments);
  } catch (error) {
    console.error('listIncomePayments error:', error);
    res.status(400).json({ message: 'Cannot list income payments', error: error.message });
  }
};

/**
 * (ออปชัน) รีเฟรชสถานะทั้งหมดของ Income (คล้าย refreshInvoiceStatuses)
 * GET /api/income/refresh-status
 */
export const refreshIncomeStatuses = async (_req, res) => {
  try {
    const now = new Date();

    const heads = await prisma.income.findMany({
      select: { id: true, amount: true, dueDate: true },
    });

    if (heads.length === 0) return res.json({ ok: true, updated: 0 });

    const sums = await prisma.paymentRecord.groupBy({
      by: ['income_id'],
      _sum: { amount: true },
      where: { income_id: { in: heads.map(h => h.id) } },
    });
    const paidMap = new Map(sums.map(s => [s.income_id, Number(s._sum.amount || 0)]));

    const ops = heads.map(h => {
      const total = Number(h.amount);
      const paid = paidMap.get(h.id) || 0;
      const remaining = Math.max(total - paid, 0);

      let status = 'PENDING';
      let receivedAt = null;

      if (remaining <= 0) {
        status = 'PAID';
        receivedAt = now;
      } else if (h.dueDate && new Date(h.dueDate) < now) {
        status = 'OVERDUE';
      } else if (paid > 0) {
        status = 'PARTIAL';
      }

      return prisma.income.update({ where: { id: h.id }, data: { status, receivedAt } });
    });

    await prisma.$transaction(ops);
    res.json({ ok: true, updated: ops.length });
  } catch (error) {
    console.error('refreshIncomeStatuses error:', error);
    res.status(500).json({ message: 'refresh failed', error: error.message });
  }
};

/**
 * สรุปยอดรวมของแต่ละเดือน (เหมือน invoice summary)
 * GET /api/income/summary/by-month?year=2025&basis=contractDate|dueDate|receivedAt
 */
export const getIncomeSummaryByMonth = async (req, res) => {
  try {
    const year = Number(req.query.year);
    const basis = req.query.basis || 'contractDate';
    if (!year) return res.status(400).json({ message: 'year is required' });

    const col = basis === 'dueDate' ? 'dueDate'
              : basis === 'receivedAt' ? 'receivedAt'
              : 'contractDate';

    const rows = await prisma.$queryRawUnsafe(
      `
      SELECT MONTH(${col}) AS m, COALESCE(SUM(amount),0) AS total
      FROM Income
      WHERE ${col} IS NOT NULL AND YEAR(${col}) = ?
      GROUP BY m
      ORDER BY m
      `,
      year
    );

    const totals = Array(12).fill(0);
    for (const r of rows) {
      const m = Number(r.m);
      const t = Number(r.total);
      if (m >= 1 && m <= 12) totals[m - 1] = t;
    }

    res.json({ year, totals });
  } catch (error) {
    console.error('getIncomeSummaryByMonth error:', error);
    res.status(500).json({ message: 'Cannot get income summary', error: error.message });
  }
};
