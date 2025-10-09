// controllers/incomeYearController.js
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/** GET /api/income-years -> { years: number[] } */
export const listIncomeYears = async (_req, res) => {
  try {
    const rows = await prisma.incomeYear.findMany({
      select: { year: true },
      orderBy: { year: 'desc' },
    });
    res.json({ years: rows.map(r => Number(r.year)) });
  } catch (e) {
    console.error('listIncomeYears error:', e);
    res.status(500).json({ error: 'Failed to fetch income years' });
  }
};

/** POST /api/income-years  body: {year?: number}
 *  - ถ้า year ไม่มี -> ใช้ (ปีล่าสุดในตารางหรือปีปัจจุบัน) + 1
 *  - upsert กันซ้ำ
 */
export const createIncomeYear = async (req, res) => {
  try {
    let y = req.body?.year ? Number(req.body.year) : undefined;

    if (!y) {
      const latest = await prisma.incomeYear.findFirst({
        orderBy: { year: 'desc' },
        select: { year: true },
      });
      const base = latest?.year ?? new Date().getFullYear();
      y = Number(base) + 1;
    }

    const row = await prisma.incomeYear.upsert({
      where: { year: y },
      update: {},
      create: { year: y },
    });

    res.status(201).json(row);
  } catch (e) {
    console.error('createIncomeYear error:', e);
    res.status(500).json({ error: 'Failed to create income year' });
  }
};

/** POST /api/income-years/sync?basis=contractDate|dueDate|receivedAt
 *  เติมปีจากข้อมูลจริงในตาราง Income (ไม่ลบของเดิม)
 */
export const syncIncomeYears = async (req, res) => {
  try {
    const basis = String(req.query.basis || 'contractDate');
    const col =
      basis === 'dueDate'    ? 'dueDate' :
      basis === 'receivedAt' ? 'receivedAt' :
      'contractDate';

    // ดึงปีที่มีข้อมูลจริง
    const rows = await prisma.$queryRawUnsafe(
      `
      SELECT DISTINCT YEAR(${col}) AS year
      FROM Income
      WHERE ${col} IS NOT NULL
      ORDER BY year DESC
      `
    );

    // upsert ทุกปีที่พบ
    const ops = rows.map(r =>
      prisma.incomeYear.upsert({
        where: { year: Number(r.year) },
        update: {},
        create: { year: Number(r.year) },
      })
    );
    await prisma.$transaction(ops);

    res.json({ ok: true, basis: col, years: rows.map(r => Number(r.year)) });
  } catch (e) {
    console.error('syncIncomeYears error:', e);
    res.status(500).json({ error: 'Failed to sync income years' });
  }
};

/** POST /api/income-years/prune?basis=contractDate|dueDate|receivedAt
 *  ลบปีใน IncomeYear ที่ไม่มีข้อมูลจริงแล้ว (safe clean-up)
 */
export const pruneIncomeYears = async (req, res) => {
  try {
    const basis = String(req.query.basis || 'contractDate');
    const col =
      basis === 'dueDate'    ? 'dueDate' :
      basis === 'receivedAt' ? 'receivedAt' :
      'contractDate';

    const existing = await prisma.incomeYear.findMany({ select: { year: true } });
    const existingSet = new Set(existing.map(r => Number(r.year)));

    const rows = await prisma.$queryRawUnsafe(
      `
      SELECT DISTINCT YEAR(${col}) AS year
      FROM Income
      WHERE ${col} IS NOT NULL
      `
    );
    const presentSet = new Set(rows.map(r => Number(r.year)));

    const toDelete = [...existingSet].filter(y => !presentSet.has(y));
    if (toDelete.length === 0) return res.json({ ok: true, deleted: 0 });

    const ops = toDelete.map(y => prisma.incomeYear.delete({ where: { year: y } }));
    await prisma.$transaction(ops);

    res.json({ ok: true, deleted: toDelete.length, years: toDelete });
  } catch (e) {
    console.error('pruneIncomeYears error:', e);
    res.status(500).json({ error: 'Failed to prune income years' });
  }
};
