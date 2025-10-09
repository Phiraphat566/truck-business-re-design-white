// backend/controllers/travelCostController.js
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const toNum = v => (v == null ? null : Number(v));
const parseDate = (val) => {
  if (val === undefined || val === null || val === '') return null;
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** GET /api/travel-costs */
export const getAllTravelCosts = async (_req, res) => {
  try {
    const rows = await prisma.travelCost.findMany({
      orderBy: [{ effective_from: 'desc' }, { min_km: 'asc' }, { id: 'asc' }],
    });
    res.json(rows.map(r => ({
      ...r,
      price_per_round: Number(r.price_per_round),
    })));
  } catch (e) {
    console.error('getAllTravelCosts error:', e);
    res.status(500).json({ error: 'Failed to fetch travel costs' });
  }
};

/** GET /api/travel-costs/:id */
export const getTravelCostById = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const r = await prisma.travelCost.findUnique({ where: { id } });
    if (!r) return res.status(404).json({ error: 'Travel cost not found' });
    res.json({ ...r, price_per_round: Number(r.price_per_round) });
  } catch (e) {
    console.error('getTravelCostById error:', e);
    res.status(500).json({ error: 'Failed to fetch travel cost' });
  }
};

/** POST /api/travel-costs
 * body: { min_km, max_km?, price_per_round, effective_from, effective_to?, is_active?, note? }
 */
export const createTravelCost = async (req, res) => {
  try {
    let {
      min_km,
      max_km = null,
      price_per_round,
      effective_from,
      effective_to = null,
      is_active = true,
      note = null,
    } = req.body || {};

    min_km = Number(min_km);
    max_km = (max_km === '' || max_km === null || max_km === undefined) ? null : Number(max_km);
    price_per_round = Number(price_per_round);
    const from = parseDate(effective_from);
    const to = parseDate(effective_to);

    if (!Number.isFinite(min_km) || min_km < 0) {
      return res.status(400).json({ error: 'min_km must be a non-negative number' });
    }
    if (max_km !== null && (!Number.isFinite(max_km) || max_km <= min_km)) {
      return res.status(400).json({ error: 'max_km must be > min_km or null' });
    }
    if (!Number.isFinite(price_per_round) || price_per_round <= 0) {
      return res.status(400).json({ error: 'price_per_round must be > 0' });
    }
    if (!from) return res.status(400).json({ error: 'effective_from is required (YYYY-MM-DD)' });
    if (to && to < from) {
      return res.status(400).json({ error: 'effective_to must be >= effective_from' });
    }

    const created = await prisma.travelCost.create({
      data: {
        min_km,
        max_km,
        price_per_round,
        effective_from: from,
        effective_to: to,
        is_active: Boolean(is_active),
        note: note ?? null,
      },
    });

    res.status(201).json({ ...created, price_per_round: Number(created.price_per_round) });
  } catch (e) {
    console.error('createTravelCost error:', e);
    res.status(500).json({ error: 'Failed to create travel cost' });
  }
};

/** PATCH /api/travel-costs/:id
 * body: ส่งมาเฉพาะฟิลด์ที่อยากแก้
 */
export const updateTravelCost = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const current = await prisma.travelCost.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ error: 'Travel cost not found' });

    const patch = req.body || {};

    const merged = {
      min_km: patch.min_km !== undefined ? Number(patch.min_km) : current.min_km,
      max_km:
        patch.max_km !== undefined
          ? (patch.max_km === '' || patch.max_km === null ? null : Number(patch.max_km))
          : current.max_km,
      price_per_round:
        patch.price_per_round !== undefined ? Number(patch.price_per_round) : Number(current.price_per_round),
      effective_from:
        patch.effective_from !== undefined ? parseDate(patch.effective_from) : current.effective_from,
      effective_to:
        patch.effective_to !== undefined ? parseDate(patch.effective_to) : current.effective_to,
      is_active:
        patch.is_active !== undefined ? Boolean(patch.is_active) : current.is_active,
      note: patch.note !== undefined ? (patch.note ?? null) : current.note,
    };

    // validate
    if (!Number.isFinite(merged.min_km) || merged.min_km < 0) {
      return res.status(400).json({ error: 'min_km must be a non-negative number' });
    }
    if (merged.max_km !== null && (!Number.isFinite(merged.max_km) || merged.max_km <= merged.min_km)) {
      return res.status(400).json({ error: 'max_km must be > min_km or null' });
    }
    if (!Number.isFinite(merged.price_per_round) || merged.price_per_round <= 0) {
      return res.status(400).json({ error: 'price_per_round must be > 0' });
    }
    if (!merged.effective_from) {
      return res.status(400).json({ error: 'effective_from is required and must be a valid date' });
    }
    if (merged.effective_to && merged.effective_to < merged.effective_from) {
      return res.status(400).json({ error: 'effective_to must be >= effective_from' });
    }

    const updated = await prisma.travelCost.update({
      where: { id },
      data: merged,
    });

    res.json({ ...updated, price_per_round: Number(updated.price_per_round) });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Travel cost not found' });
    console.error('updateTravelCost error:', e);
    res.status(500).json({ error: 'Failed to update travel cost' });
  }
};

/** DELETE /api/travel-costs/:id */
export const deleteTravelCost = async (req, res) => {
  try {
    const id = Number(req.params.id);
    await prisma.travelCost.delete({ where: { id } });
    res.json({ message: 'Deleted successfully' });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Travel cost not found' });
    console.error('deleteTravelCost error:', e);
    res.status(500).json({ error: 'Failed to delete travel cost' });
  }
};

/** (ออปชัน) GET /api/travel-costs/calc?distance=42&at=2025-03-15
 * เลือกกติกาที่ active ตรงช่วงระยะทาง และมีผล ณ วันที่ระบุ
 */
export const calcTravelPrice = async (req, res) => {
  try {
    const distance = Number(req.query.distance);
    const at = parseDate(req.query.at) ?? new Date();

    if (!Number.isFinite(distance) || distance < 0) {
      return res.status(400).json({ error: 'distance must be a non-negative number' });
    }

    if (distance >= 30) {
  return res.json({ rejected: true, price_per_round: 0, message: 'ระยะ ≥ 30 กม. ไม่รับงาน' });
}


    // NOTE: ต้องใช้ AND ครอบ OR ทั้งสองชุด (max_km และ effective_to)
    // ห้ามใส่ OR ซ้ำระดับเดียวกัน เพราะ key จะทับกัน
    const rule = await prisma.travelCost.findFirst({
      where: {
        is_active: true,
        min_km: { lte: distance },
        effective_from: { lte: at },
        AND: [
          { OR: [{ max_km: null }, { max_km: { gte: distance } }] },
          { OR: [{ effective_to: null }, { effective_to: { gte: at } }] },
        ],
      },
      orderBy: [{ effective_from: 'desc' }, { min_km: 'desc' }, { id: 'desc' }],
    });

    if (!rule) {
      return res.status(404).json({ error: 'No pricing rule matches this distance/date' });
    }

    res.json({
      distance,
      at,
      rule: {
        id: rule.id,
        min_km: rule.min_km,
        max_km: rule.max_km,
        price_per_round: Number(rule.price_per_round),
        effective_from: rule.effective_from,
        effective_to: rule.effective_to,
      },
      price_per_round: Number(rule.price_per_round),
    });
  } catch (e) {
    console.error('calcTravelPrice error:', e);
    res.status(500).json({ error: 'Failed to calculate price' });
  }
};
