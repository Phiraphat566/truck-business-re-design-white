// backend/controllers/financeYearsController.js
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/** helper รวมเลขปีให้สะอาด */
function mergeYears(...lists) {
  const set = new Set();
  for (const list of lists) {
    for (const r of list || []) {
      const y = Number(r.year ?? r.y ?? r);
      if (y) set.add(y);
    }
  }
  return Array.from(set).sort((a, b) => a - b);
}

/**
 * GET /api/finance/years
 * รวมปีจาก: InvoiceYear + ปีเงินเข้าจริง (PaymentRecord ของ Income) + ปีจาก Invoice
 */
export const getFinanceYears = async (_req, res) => {
  try {
    const manualYears = await prisma.invoiceYear.findMany({ select: { year: true } });

    // ปีจาก "เงินเข้าจริง"
    const incomeYears = await prisma.$queryRaw/*sql*/`
      SELECT DISTINCT YEAR(payment_date) AS year
      FROM PaymentRecord
      WHERE income_id IS NOT NULL
      ORDER BY year
    `;

    // ปีจาก Invoice (ดูทั้ง contractDate, dueDate, paidAt)
    const invoiceYears = await prisma.$queryRaw/*sql*/`
      SELECT DISTINCT YEAR(contractDate) AS year FROM Invoice WHERE contractDate IS NOT NULL
      UNION
      SELECT DISTINCT YEAR(dueDate)      AS year FROM Invoice WHERE dueDate      IS NOT NULL
      UNION
      SELECT DISTINCT YEAR(paidAt)       AS year FROM Invoice WHERE paidAt       IS NOT NULL
      ORDER BY year
    `;

    const years = mergeYears(
      manualYears.map(r => ({ year: r.year })),
      incomeYears,
      invoiceYears
    );
    return res.json({ years });
  } catch (e) {
    console.error('getFinanceYears error:', e);
    return res.status(500).json({ error: 'Failed to get years' });
  }
};

/**
 * GET /api/finance/years/income
 * เฉพาะปีที่มี "เงินเข้าจริง" (PaymentRecord ของ Income)
 */
export const getIncomeYears = async (_req, res) => {
  try {
    const rows = await prisma.$queryRaw/*sql*/`
      SELECT DISTINCT YEAR(payment_date) AS year
      FROM PaymentRecord
      WHERE income_id IS NOT NULL
      ORDER BY year
    `;
    return res.json({ years: mergeYears(rows) });
  } catch (e) {
    console.error('getIncomeYears error:', e);
    return res.status(500).json({ error: 'Failed to get income years' });
  }
};

/**
 * GET /api/finance/years/invoice
 * รวมปีจาก InvoiceYear (+) ปีที่มีข้อมูลจริงใน Invoice
 */
export const getInvoiceYears = async (_req, res) => {
  try {
    const manual = await prisma.invoiceYear.findMany({ select: { year: true } });

    const actual = await prisma.$queryRaw/*sql*/`
      SELECT DISTINCT YEAR(contractDate) AS year FROM Invoice WHERE contractDate IS NOT NULL
      UNION
      SELECT DISTINCT YEAR(dueDate)      AS year FROM Invoice WHERE dueDate      IS NOT NULL
      UNION
      SELECT DISTINCT YEAR(paidAt)       AS year FROM Invoice WHERE paidAt       IS NOT NULL
      ORDER BY year
    `;

    const years = mergeYears(
      manual.map(r => ({ year: r.year })),
      actual
    );
    return res.json({ years });
  } catch (e) {
    console.error('getInvoiceYears error:', e);
    return res.status(500).json({ error: 'Failed to get invoice years' });
  }
};
