// backend/controllers/financeMonthlySummaryController.js
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/** คืนอาเรย์ 12 ช่อง [Jan..Dec] */
function mk12() { return Array(12).fill(0); }
const toNum = (v) => Number(v ?? 0);

/** helper: เติมผลรวมลงอาเรย์เดือน */
function fillTotals(rows) {
  const arr = mk12();
  for (const r of rows || []) {
    const m = Number(r.m);
    const t = toNum(r.total);
    if (m >= 1 && m <= 12) arr[m - 1] = t;
  }
  return arr;
}
const add12 = (a, b) => a.map((v, i) => Number((v + (b[i] || 0)).toFixed(2)));
const sub12 = (a, b) => a.map((v, i) => Number((v - (b[i] || 0)).toFixed(2)));

/** ตรวจ basis ให้ปลอดภัย (ป้องกัน SQL injection) — เก็บไว้ใช้ในส่วน compat */
function pickIncomeBasis(b) {
  // default เป็น receivedAt ให้ตรงกับที่หน้าเว็บเรียก
  return b === 'contractDate' ? 'contractDate'
       : b === 'dueDate'      ? 'dueDate'
       : 'receivedAt';
}
function pickInvoiceBasis(b) {
  return b === 'contractDate' ? 'contractDate'
       : b === 'paidAt'       ? 'paidAt'
       : 'dueDate';
}

/**
 * GET /api/finance/summary/monthly?year=2025
 * query เสริม:
 *   - income_basis=receivedAt|contractDate|dueDate (default: receivedAt)  -> ใช้ในส่วน compat
 *   - invoice_basis=dueDate|contractDate|paidAt    (default: dueDate)     -> ใช้ในส่วน compat
 *
 * ส่งกลับ (ที่หน้า Angular ใช้จริง):
 *   { year, incomes:number[12], expenses:number[12], breakdown:{invoice,fuel,truck,payroll}, ...compat }
 */
export const getFinanceMonthlySummary = async (req, res) => {
  try {
    const year = Number(req.query.year);
    if (!year) return res.status(400).json({ message: 'year is required' });

    const income_basis  = pickIncomeBasis(String(req.query.income_basis || 'receivedAt'));
    const invoice_basis = pickInvoiceBasis(String(req.query.invoice_basis || 'dueDate'));

    // ---------- สรุปแบบ "หัวเอกสาร" (เก็บไว้ใน payload เพื่อความเข้ากันได้) ----------
    const [incomeHeadRows, invoiceHeadRows] = await Promise.all([
      prisma.$queryRawUnsafe(
        `SELECT MONTH(${income_basis}) AS m, COALESCE(SUM(amount),0) AS total
         FROM Income
         WHERE ${income_basis} IS NOT NULL AND YEAR(${income_basis}) = ?
         GROUP BY m ORDER BY m`, year
      ),
      prisma.$queryRawUnsafe(
        `SELECT MONTH(${invoice_basis}) AS m, COALESCE(SUM(amount),0) AS total
         FROM Invoice
         WHERE ${invoice_basis} IS NOT NULL AND YEAR(${invoice_basis}) = ?
         GROUP BY m ORDER BY m`, year
      ),
    ]);
    const incomeByHeadTotals  = fillTotals(incomeHeadRows);
    const invoiceByHeadTotals = fillTotals(invoiceHeadRows);

    // ---------- สรุปแบบ "กระแสเงินสดจริง" ----------
    const [
      incomeCashRows,     // เงินรับจริง (รับเข้า)
      invoiceCashRows,    // เงินจ่ายจริง (ชำระบิล)
      fuelRows,           // ค่าน้ำมัน
      truckRows,          // ค่าใช้จ่ายรถอื่น ๆ
      payrollRows,        // เงินเดือนที่จ่ายแล้ว
    ] = await Promise.all([
      prisma.$queryRawUnsafe(
        `SELECT MONTH(payment_date) AS m, COALESCE(SUM(amount),0) AS total
         FROM PaymentRecord
         WHERE income_id IS NOT NULL AND YEAR(payment_date) = ?
         GROUP BY m ORDER BY m`, year
      ),
      prisma.$queryRawUnsafe(
        `SELECT MONTH(payment_date) AS m, COALESCE(SUM(amount),0) AS total
         FROM PaymentRecord
         WHERE invoice_id IS NOT NULL AND YEAR(payment_date) = ?
         GROUP BY m ORDER BY m`, year
      ),
      prisma.$queryRawUnsafe(
        `SELECT MONTH(fuel_date) AS m, COALESCE(SUM(cost),0) AS total
         FROM FuelLog
         WHERE YEAR(fuel_date) = ?
         GROUP BY m ORDER BY m`, year
      ),
      prisma.$queryRawUnsafe(
        `SELECT MONTH(expense_date) AS m, COALESCE(SUM(amount),0) AS total
         FROM TruckExpense
         WHERE YEAR(expense_date) = ?
         GROUP BY m ORDER BY m`, year
      ),
      prisma.$queryRawUnsafe(
        `SELECT MONTH(paid_at) AS m, COALESCE(SUM(net_amount),0) AS total
         FROM PayrollItem
         WHERE paid_at IS NOT NULL AND status='PAID' AND YEAR(paid_at) = ?
         GROUP BY m ORDER BY m`, year
      ),
    ]);

    const incomeByCashTotals   = fillTotals(incomeCashRows);
    const invoiceByCashTotals  = fillTotals(invoiceCashRows);
    const fuel                 = fillTotals(fuelRows);
    const truck                = fillTotals(truckRows);
    const payroll              = fillTotals(payrollRows);

    // ====== ค่าหลักที่หน้าเว็บใช้ ======
    // รายรับ = เงินรับจริงรายเดือน
    const incomes  = incomeByCashTotals;
    // รายจ่าย = จ่ายบิลจริง + ค่าน้ำมัน + ค่าใช้จ่ายรถ + เงินเดือนที่จ่ายแล้ว
    const expenses = add12(add12(add12(invoiceByCashTotals, fuel), truck), payroll);
    // กระแสเงินสดสุทธิ
    const netCash  = sub12(incomeByCashTotals, expenses);

    return res.json({
      year,
      incomes,
      expenses,
      breakdown: { invoice: invoiceByCashTotals, fuel, truck, payroll },

      // ====== payload เดิมเพื่อความเข้ากันได้ ======
      income:  { byHead: { basis: income_basis,  totals: incomeByHeadTotals }, byCash: { totals: incomeByCashTotals } },
      invoice: { byHead: { basis: invoice_basis, totals: invoiceByHeadTotals }, byCash: { totals: invoiceByCashTotals } },
      netCash,
    });
  } catch (e) {
    console.error('getFinanceMonthlySummary error:', e);
    res.status(500).json({ message: 'Cannot get monthly finance summary' });
  }
};
