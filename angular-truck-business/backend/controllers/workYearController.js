// backend/controllers/workYearController.js
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/**
 * GET /api/work-years
 * คืนรายการปีที่มีอยู่ พร้อม monthsCount (จะให้ 12 ไปก่อน
 * หรือจะนับจริงจากตารางสรุป/แหล่งอื่นภายหลังก็ได้)
 */
export const getYears = async (_req, res) => {
  try {
    const rows = await prisma.workYear.findMany({
      orderBy: { year: 'desc' },
    });

    // ถ้ายังไม่มีข้อมูลเลย อยาก bootstrap ให้มีปีปัจจุบันก็ทำที่นี่ได้
    // if (rows.length === 0) { ... }

    const result = rows.map(r => ({
      year: r.year,
      monthsCount: 12, // TODO: ถ้าจะนับจริง ค่อยเปลี่ยนมาคิวรี EmployeeMonthlySummary/Attendance
    }));
    res.json(result);
  } catch (err) {
    console.error('[getYears]', err);
    res.status(500).json({ error: 'Failed to fetch years' });
  }
};

/**
 * POST /api/work-years
 * body: { year?: number }
 * - ถ้าไม่ส่ง year จะใช้ปีปัจจุบัน
 * - ป้องกันซ้ำด้วย upsert
 */
export const addYear = async (req, res) => {
  try {
    const y = parseInt(req.body?.year ?? new Date().getFullYear(), 10);
    if (!y) return res.status(400).json({ error: 'year is required' });

    const created = await prisma.workYear.upsert({
      where: { year: y },
      create: { year: y },
      update: {}, // มีอยู่แล้วก็ไม่ต้องทำอะไร
    });

    res.status(201).json({ year: created.year, monthsCount: 12 });
  } catch (err) {
    console.error('[addYear]', err);
    res.status(500).json({ error: 'Failed to add year' });
  }
};

/**
 * DELETE /api/work-years/:year
 * (ออปชัน ใช้เมื่ออยากลบปี)
 */
export const deleteYear = async (req, res) => {
  try {
    const y = parseInt(req.params.year, 10);
    if (!y) return res.status(400).json({ error: 'year is required' });

    await prisma.workYear.delete({ where: { year: y } });
    res.json({ ok: true });
  } catch (err) {
    console.error('[deleteYear]', err);
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Year not found' });
    }
    res.status(500).json({ error: 'Failed to delete year' });
  }
};
