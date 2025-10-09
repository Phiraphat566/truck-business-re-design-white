// backend/controllers/invoiceController.js
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/**
 * Helper: รวมยอดที่จ่ายแล้วของ invoice
 */
async function sumPaid(invoiceId) {
  const agg = await prisma.paymentRecord.aggregate({
    _sum: { amount: true },
    where: { invoice_id: invoiceId },
  });
  return Number(agg._sum.amount ?? 0);
}

function deriveStatus(inv, paidAmount, now = new Date()) {
  const total = Number(inv.amount);
  const remaining = Math.max(total - paidAmount, 0);

  if (remaining <= 0) return 'PAID';                     // จ่ายครบ
  if (inv.dueDate && new Date(inv.dueDate) < now) return 'OVERDUE'; // เกินกำหนดและยังเหลือ
  if (paidAmount > 0) return 'PARTIAL';                  // จ่ายบางส่วน ยังไม่เกินกำหนด
  return 'PENDING';                                      // ยังไม่จ่าย และยังไม่เกินกำหนด
}


async function recalcInvoiceStatus(invoiceId) {
  // ดึงหัวบิล (จำนวนเงิน + dueDate)
  const head = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { amount: true, dueDate: true },
  });
  if (!head) {
    return { status: 'PENDING', paidAmount: 0, remaining: 0, paidAt: null };
  }

  // รวมยอดที่จ่ายไปแล้ว
  const agg = await prisma.paymentRecord.aggregate({
    _sum: { amount: true },
    where: { invoice_id: invoiceId },
  });
  const paidAmount = Number(agg._sum.amount ?? 0);

  // คำนวณสถานะ
  const status = deriveStatus(head, paidAmount);

  // paidAt = วันที่ชำระล่าสุด ถ้าจ่ายครบ
  let paidAt = null;
  if (status === 'PAID') {
    const last = await prisma.paymentRecord.findFirst({
      where: { invoice_id: invoiceId },
      orderBy: { payment_date: 'desc' },
      select: { payment_date: true },
    });
    paidAt = last?.payment_date ?? new Date();
  }

  // อัปเดตหัวบิล
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { status, paidAt },
  });

  const total = Number(head.amount);
  const remaining = Math.max(total - paidAmount, 0);
  return { status, paidAmount, remaining, paidAt };
}


/**
 * สร้าง Invoice
 * body: { invoiceNo, customerName, contractDate, dueDate, amount, description }
 */
export const createInvoice = async (req, res) => {
  try {
    const { invoiceNo, customerName, contractDate, dueDate, amount, description } = req.body;

    if (!invoiceNo) return res.status(400).json({ message: 'invoiceNo is required' });

    const a = Number(amount);
    if (!Number.isFinite(a) || a <= 0) {
      return res.status(400).json({ message: 'amount must be a number > 0' });
    }

    const cDate = new Date(contractDate);
    if (isNaN(cDate.getTime())) {
      return res.status(400).json({ message: 'contractDate is invalid' });
    }

    let dDate = null;
    if (dueDate != null && dueDate !== '') {
      const tmp = new Date(dueDate);
      if (isNaN(tmp.getTime())) {
        return res.status(400).json({ message: 'dueDate is invalid' });
      }
      dDate = tmp;
    }

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNo,
        customerName,
        contractDate: cDate,
        dueDate: dDate,
        amount: a,
        description: description ?? null,
      },
    });

    res.status(201).json(invoice);
  } catch (err) {
    console.error('createInvoice error:', err);
    res.status(400).json({ message: 'Cannot create invoice', error: err.message });
  }
};


export const refreshInvoiceStatuses = async (req, res) => {
  try {
    const now = new Date();

    const invoices = await prisma.invoice.findMany({
      select: { id: true, amount: true, dueDate: true }
    });

    const sums = await prisma.paymentRecord.groupBy({
      by: ['invoice_id'],
      _sum: { amount: true },
      where: { invoice_id: { in: invoices.map(i => i.id) } },
    });
    const paidMap = new Map(sums.map(s => [s.invoice_id, Number(s._sum.amount || 0)]));

    const ops = invoices.map(inv => {
      const total = Number(inv.amount);
      const paid  = paidMap.get(inv.id) || 0;
      const remaining = Math.max(total - paid, 0);

      let status = 'PENDING';
      let paidAt = null;

      if (remaining <= 0) {
        status = 'PAID';
        paidAt = now;
      } else if (inv.dueDate && new Date(inv.dueDate) < now) {
        status = 'OVERDUE';
      } else if (paid > 0) {
        status = 'PARTIAL';
      }

      return prisma.invoice.update({ where: { id: inv.id }, data: { status, paidAt } });
    });

    await prisma.$transaction(ops);
    res.json({ ok: true, updated: ops.length });
  } catch (e) {
    console.error('refreshInvoiceStatuses error:', e);
    res.status(500).json({ message: 'refresh failed', error: e.message });
  }
};

/**
 * ดึงรายการ Invoice (รองรับ filter)
 * query: year, month (1-12), status (PENDING|OVERDUE|PAID|PARTIAL), q
 * เกณฑ์เดือน: อิง contractDate
 * -> แนบ paidAmount/remaining ให้ทุกใบ
 */
export const listInvoices = async (req, res) => {
  try {
    const { year, month, status, q, basis } = req.query;

    // ใช้ฟิลด์วันที่ตาม basis
    const dateCol =
      basis === 'dueDate' ? 'dueDate' :
      basis === 'paidAt'  ? 'paidAt'  :
      'contractDate';

    // เงื่อนไขค้นหา (จงใจ "ไม่" ใส่ where.status เพราะเราจะคัดกรองจากสถานะคำนวณใหม่ทีหลัง)
    const where = {};

    // ช่วงปี/เดือน
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

    // ค้นหาตามข้อความ
    if (q) {
      where.OR = [
        { invoiceNo:    { contains: q } },
        { customerName: { contains: q } },
        { description:  { contains: q } },
      ];
    }

    const invoices = await prisma.invoice.findMany({
      where,
      orderBy: [{ [dateCol]: 'desc' }, { id: 'desc' }],
    });

    if (invoices.length === 0) {
      return res.json([]);
    }

    // ดึงยอดรวมที่จ่ายแล้วของแต่ละบิลครั้งเดียว
    const sums = await prisma.paymentRecord.groupBy({
      by: ['invoice_id'],
      _sum: { amount: true },
      where: { invoice_id: { in: invoices.map(i => i.id) } },
    });
    const paidMap = new Map(sums.map(s => [s.invoice_id, Number(s._sum.amount || 0)]));

    // helper คำนวณสถานะตามยอดชำระ + วันครบกำหนด
    const now = new Date();
    const computeStatus = (inv, paidAmount) => {
      const total = Number(inv.amount);
      const remaining = Math.max(total - paidAmount, 0);
      if (remaining <= 0) return 'PAID';
      if (inv.dueDate && new Date(inv.dueDate) < now) return 'OVERDUE';
      if (paidAmount > 0) return 'PARTIAL';
      return 'PENDING';
    };

    // ตกแต่งข้อมูลก่อนส่งกลับ
    let data = invoices.map(inv => {
      const paidAmount = paidMap.get(inv.id) || 0;
      const total = Number(inv.amount);
      const remaining = Math.max(total - paidAmount, 0);
      const computedStatus = computeStatus(inv, paidAmount);

      return {
        ...inv,
        status: computedStatus,   // ใช้สถานะที่คำนวณใหม่
        paidAmount,
        remaining,
      };
    });

    // ถ้ามี query ?status=... ให้กรองจากสถานะที่คำนวณใหม่
    if (status) {
      data = data.filter(d => d.status === status);
    }

    res.json(data);
  } catch (err) {
    console.error('listInvoices error:', err);
    res.status(400).json({ message: 'Cannot list invoices', error: err.message });
  }
};


/**
 * ดึง Invoice รายตัว + ประวัติงวดจ่าย
 */
// backend/controllers/invoiceController.js
export const getInvoiceById = async (req, res) => {
  try {
    const id = Number(req.params.id);

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { payments: { orderBy: { payment_date: 'asc' } } },
    });
    if (!invoice) return res.status(404).json({ message: 'Not found' });

    const paidAmount = invoice.payments.reduce((s, x) => s + Number(x.amount), 0);
    const remaining  = Math.max(Number(invoice.amount) - paidAmount, 0);
    const computedStatus = deriveStatus(invoice, paidAmount);

    res.json({ ...invoice, paidAmount, remaining, status: computedStatus });
  } catch (err) {
    console.error('getInvoiceById error:', err);
    res.status(400).json({ message: 'Cannot get invoice', error: err.message });
  }
};

/**
 * อัปเดต Invoice
 */
export const updateInvoice = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const {
      invoiceNo,
      customerName,
      contractDate,
      dueDate,
      amount,
      description,
      // ไม่รับ status จากภายนอก เพื่อให้ระบบคำนวณเองหลังแก้ไข
    } = req.body;

    const data = {};
    if (invoiceNo !== undefined)    data.invoiceNo = invoiceNo;
    if (customerName !== undefined) data.customerName = customerName;
    if (contractDate !== undefined) data.contractDate = new Date(contractDate);
    if (dueDate !== undefined)      data.dueDate = new Date(dueDate);
    if (amount !== undefined)       data.amount = Number(amount);
    if (description !== undefined)  data.description = description;

    // กันเคส: ยอดใหม่ < ยอดที่ชำระไปแล้ว
    if (data.amount !== undefined) {
      const paid = await sumPaid(id);
      if (paid > data.amount) {
        return res.status(400).json({
          message: `ยอดที่ชำระไปแล้ว (${paid}) มากกว่ายอดใหม่ (${data.amount})`,
        });
      }
    }

    // อัปเดตฟิลด์
    await prisma.invoice.update({ where: { id }, data });

    // คำนวณสถานะจากยอดชำระ + dueDate แล้วอัปเดตลงบิล
    const stats = await recalcInvoiceStatus(id);

    // ส่งข้อมูลล่าสุดกลับ (แนบ payments + ตัวเลขสรุป)
    const fresh = await prisma.invoice.findUnique({
      where: { id },
      include: { payments: { orderBy: { payment_date: 'asc' } } },
    });

    res.json({
      ...fresh,
      paidAmount: stats.paidAmount,
      remaining: stats.remaining,
      status: stats.status,
    });
  } catch (err) {
    console.error('updateInvoice error:', err);
    res.status(400).json({ message: 'Cannot update invoice', error: err.message });
  }
};


/**
 * เปลี่ยนสถานะเฉพาะ (PATCH /:id/status)
 * body: { status, paidAt? }
 */
export const updateInvoiceStatus = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status, paidAt } = req.body;

    const updated = await prisma.invoice.update({
      where: { id },
      data: {
        status,
        paidAt: paidAt ? new Date(paidAt) : null,
      },
      include: { payments: true },
    });

    res.json(updated);
  } catch (err) {
    console.error('updateInvoiceStatus error:', err);
    res.status(400).json({ message: 'Cannot update invoice status', error: err.message });
  }
};

/**
 * (ใหม่) บันทึก "งวดชำระ" ของใบแจ้งหนี้
 * POST /api/invoices/:id/payments
 * body: { amount, paidAt?, description? }
 */
export const createInvoicePayment = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { amount, paidAt, description } = req.body;

    const add = Number(amount);
    if (!Number.isFinite(add) || add <= 0) {
      return res.status(400).json({ message: 'amount ต้องมากกว่า 0' });
    }

    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

    const paid = await sumPaid(id);
    const total = Number(invoice.amount);
    if (paid + add > total) {
      return res.status(400).json({ message: 'ยอดรวมหลังชำระเกินยอดใบแจ้งหนี้' });
    }

    await prisma.paymentRecord.create({
      data: {
        invoice_id: id,
        payment_date: paidAt ? new Date(paidAt) : new Date(),
        amount: add,
        description: description ?? 'จ่ายงวดบิล',
        category: 'BILL',
      },
    });

    const stats = await recalcInvoiceStatus(id); // ← ให้ helper สรุปสถานะ + paidAt ล่าสุด
    return res.json({ ok: true, ...stats });
  } catch (err) {
    console.error('createInvoicePayment error:', err);
    res.status(400).json({ message: 'Cannot create payment', error: err.message });
  }
};


/**
 * (ใหม่) ดูประวัติงวดชำระ
 * GET /api/invoices/:id/payments
 */
export const listInvoicePayments = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const payments = await prisma.paymentRecord.findMany({
      where: { invoice_id: id },
      orderBy: { payment_date: 'asc' },
      select: { id: true, payment_date: true, amount: true, description: true },
    });
    res.json(payments);
  } catch (err) {
    res.status(400).json({ message: 'Cannot list payments', error: err.message });
  }
};





/**
 * ลบ Invoice (Income จะถูก set null ตาม onDelete: SetNull)
 */
export const deleteInvoice = async (req, res) => {
  try {
    const id = Number(req.params.id);

    const existing = await prisma.invoice.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'Not found' });

    await prisma.invoice.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    console.error('deleteInvoice error:', err);
    res.status(400).json({ message: 'Cannot delete invoice', error: err.message });
  }
};


// สรุปยอดรวมของแต่ละเดือน
export const getInvoiceSummaryByMonth = async (req, res) => {
  try {
    const year = Number(req.query.year);
    const basis = req.query.basis || 'dueDate'; // 'dueDate' | 'contractDate' | 'paidAt'
    if (!year) return res.status(400).json({ message: 'year is required' });

    const col = basis === 'contractDate' ? 'contractDate'
              : basis === 'paidAt'       ? 'paidAt'
              : 'dueDate';

    const rows = await prisma.$queryRawUnsafe(
      `
      SELECT MONTH(${col}) AS m, COALESCE(SUM(amount),0) AS total
      FROM Invoice
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
  } catch (err) {
    console.error('getInvoiceSummaryByMonth error:', err);
    res.status(500).json({ message: 'Cannot get invoice summary', error: err.message });
  }
};
