import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/** GET /api/invoice-years -> { years: number[] } */
export const listInvoiceYears = async (_req, res) => {
  try {
    const rows = await prisma.invoiceYear.findMany({
      select: { year: true },
      orderBy: { year: 'desc' },
    });
    res.json({ years: rows.map(r => Number(r.year)) });
  } catch (e) {
    console.error('listInvoiceYears error:', e);
    res.status(500).json({ error: 'Failed to fetch invoice years' });
  }
};

/** POST /api/invoice-years  body: {year?: number}
 * - ถ้า year ไม่มี -> ใช้ (ปีล่าสุดหรือปีปัจจุบัน) + 1
 * - upsert กันซ้ำ
 */
export const createInvoiceYear = async (req, res) => {
  try {
    let y = req.body?.year ? Number(req.body.year) : undefined;

    if (!y) {
      const latest = await prisma.invoiceYear.findFirst({
        orderBy: { year: 'desc' },
        select: { year: true },
      });
      const base = latest?.year ?? new Date().getFullYear();
      y = Number(base) + 1;
    }

    const row = await prisma.invoiceYear.upsert({
      where: { year: y },
      update: {},
      create: { year: y },
    });

    res.status(201).json(row);
  } catch (e) {
    console.error('createInvoiceYear error:', e);
    res.status(500).json({ error: 'Failed to create invoice year' });
  }
};

/** POST /api/invoice-years/sync?basis=contractDate|dueDate|paidAt
 * เติมปีจากข้อมูลจริงในตาราง Invoice (ไม่ลบของเดิม)
 */
export const syncInvoiceYears = async (req, res) => {
  try {
    const basis = String(req.query.basis || 'contractDate');
    const col =
      basis === 'dueDate' ? 'dueDate' :
      basis === 'paidAt'  ? 'paidAt'  :
      'contractDate';

    const rows = await prisma.$queryRawUnsafe(
      `
      SELECT DISTINCT YEAR(${col}) AS year
      FROM Invoice
      WHERE ${col} IS NOT NULL
      ORDER BY year DESC
      `
    );

    const ops = rows.map(r =>
      prisma.invoiceYear.upsert({
        where:  { year: Number(r.year) },
        update: {},
        create: { year: Number(r.year) },
      })
    );
    await prisma.$transaction(ops);

    res.json({ ok: true, basis: col, years: rows.map(r => Number(r.year)) });
  } catch (e) {
    console.error('syncInvoiceYears error:', e);
    res.status(500).json({ error: 'Failed to sync invoice years' });
  }
};

/** POST /api/invoice-years/prune?basis=contractDate|dueDate|paidAt
 * ลบปีใน InvoiceYear ที่ไม่มีข้อมูลจริงแล้ว (clean-up)
 */
export const pruneInvoiceYears = async (req, res) => {
  try {
    const basis = String(req.query.basis || 'contractDate');
    const col =
      basis === 'dueDate' ? 'dueDate' :
      basis === 'paidAt'  ? 'paidAt'  :
      'contractDate';

    const existing = await prisma.invoiceYear.findMany({ select: { year: true } });
    const existingSet = new Set(existing.map(r => Number(r.year)));

    const rows = await prisma.$queryRawUnsafe(
      `
      SELECT DISTINCT YEAR(${col}) AS year
      FROM Invoice
      WHERE ${col} IS NOT NULL
      `
    );
    const presentSet = new Set(rows.map(r => Number(r.year)));

    const toDelete = [...existingSet].filter(y => !presentSet.has(y));
    if (toDelete.length === 0) return res.json({ ok: true, deleted: 0 });

    const ops = toDelete.map(y => prisma.invoiceYear.delete({ where: { year: y } }));
    await prisma.$transaction(ops);

    res.json({ ok: true, deleted: toDelete.length, years: toDelete });
  } catch (e) {
    console.error('pruneInvoiceYears error:', e);
    res.status(500).json({ error: 'Failed to prune invoice years' });
  }
};
