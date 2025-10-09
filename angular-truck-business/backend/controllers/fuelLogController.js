import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();


const toNum = (v, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};
const parseISO = (d) => {
  if (d == null || d === '') return null;
  const t = new Date(d);
  return isNaN(t.getTime()) ? null : t;
};


/** helper แปลง Decimal/number/null -> number|null */
const num = (v) => (v == null ? null : Number(v));

/** คำนวณสรุปของรถ: ระยะรวม + ประสิทธิภาพ (กม./ลิตร) แล้วอัปเดตที่ตาราง Truck */
async function recomputeTruckStats(truckId) {
  // ใช้ aggregate บน DB ให้เร็วและแม่น
  const [distAgg, fuelAgg] = await Promise.all([
    prisma.truckDistanceLog.aggregate({
      where: { truck_id: truckId },
      _sum: { distance_km: true },
    }),
    prisma.fuelLog.aggregate({
      where: { truck_id: truckId },
      _sum: { liters: true, cost: true },
    }),
  ]);

  const totalDistance = num(distAgg._sum.distance_km) ?? 0;
  const totalLiters   = num(fuelAgg._sum.liters) ?? 0;

  const efficiency =
    totalLiters > 0 && totalDistance > 0
      ? Number((totalDistance / totalLiters).toFixed(2))
      : null;

  await prisma.truck.update({
    where: { id: truckId },
    data: {
      total_distance: totalDistance,
      fuel_efficiency_km_per_liter: efficiency,
    },
  });

  return { totalDistance, totalLiters, efficiency };
}

// GET /api/fuel-logs?truck_id=xxx
export const listFuelLogs = async (req, res) => {
  try {
    const { truck_id } = req.query;
    const where = truck_id ? { truck_id } : {};
    const rows = await prisma.fuelLog.findMany({
      where,
      orderBy: [{ fuel_date: 'desc' }, { round_number: 'desc' }, { id: 'desc' }],
    });
    const data = rows.map((r) => ({
      id: r.id,
      truck_id: r.truck_id,
      fuel_date: r.fuel_date,         // Date object -> Angular แสดงได้
      round_number: r.round_number,
      liters: Number(r.liters),
      cost: Number(r.cost),
      price_per_liter: num(r.price_per_liter),
    }));
    res.json(data);
  } catch (e) {
    console.error('listFuelLogs error:', e);
    res.status(500).json({ message: 'Cannot list fuel logs' });
  }
};

// POST /api/fuel-logs
// body: { truck_id, fuel_date(YYYY-MM-DD), round_number, liters, price_per_liter?, cost }
export const createFuelLog = async (req, res) => {
  try {
    const { truck_id, fuel_date, round_number, liters, cost, price_per_liter } = req.body;
    if (!truck_id) return res.status(400).json({ message: 'truck_id is required' });

    const fDate = parseISO(fuel_date);
    if (!fDate) return res.status(400).json({ message: 'fuel_date is required (ISO)' });

    const L = toNum(liters, 0);
    const C = toNum(cost, 0);
    if (L < 0 || C < 0) return res.status(400).json({ message: 'liters/cost must be >= 0' });

    let ppl = price_per_liter == null ? null : toNum(price_per_liter);
    if ((ppl == null || !Number.isFinite(ppl)) && L > 0) {
      ppl = Number((C / L).toFixed(2));
    }

    const created = await prisma.fuelLog.create({
      data: {
        truck_id,
        fuel_date: fDate,
        round_number: toNum(round_number, 1),
        liters: L,
        cost: C,
        price_per_liter: ppl,
      },
    });

    await recomputeTruckStats(truck_id);

    res.status(201).json({
      ...created,
      liters: Number(created.liters),
      cost: Number(created.cost),
      price_per_liter: num(created.price_per_liter),
    });
  } catch (e) {
    console.error('createFuelLog error:', e);
    if (e.code === 'P2002') {
      return res.status(409).json({ message: 'รายการซ้ำ (truck_id, วันที่, รอบ)' });
    }
    res.status(400).json({ message: 'Cannot create fuel log' });
  }
};


// PATCH /api/fuel-logs/:id
export const updateFuelLog = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const current = await prisma.fuelLog.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ message: 'Fuel log not found' });

    const { truck_id, fuel_date, round_number, liters, cost, price_per_liter } = req.body;
    const data = {};

    if (truck_id !== undefined) data.truck_id = truck_id;
    if (fuel_date !== undefined) {
      const d = parseISO(fuel_date);
      if (!d) return res.status(400).json({ message: 'fuel_date is invalid' });
      data.fuel_date = d;
    }
    if (round_number !== undefined) data.round_number = toNum(round_number, 1);
    if (liters !== undefined) {
      const L = toNum(liters);
      if (L < 0) return res.status(400).json({ message: 'liters must be >= 0' });
      data.liters = L;
    }
    if (cost !== undefined) {
      const C = toNum(cost);
      if (C < 0) return res.status(400).json({ message: 'cost must be >= 0' });
      data.cost = C;
    }
    if (price_per_liter !== undefined) {
      data.price_per_liter = price_per_liter == null ? null : toNum(price_per_liter);
    }

    // auto-calc ppl ถ้าไม่ส่งมา แต่มี L/C ครบ
    const L = data.liters ?? Number(current.liters);
    const C = data.cost ?? Number(current.cost);
    if ((data.price_per_liter == null || !Number.isFinite(data.price_per_liter)) && L > 0) {
      data.price_per_liter = Number((C / L).toFixed(2));
    }

    const updated = await prisma.fuelLog.update({ where: { id }, data });
    await recomputeTruckStats(updated.truck_id);

    res.json({
      ...updated,
      liters: Number(updated.liters),
      cost: Number(updated.cost),
      price_per_liter: num(updated.price_per_liter),
    });
  } catch (e) {
    console.error('updateFuelLog error:', e);
    if (e.code === 'P2002') {
      return res.status(409).json({ message: 'รายการซ้ำ (truck_id, วันที่, รอบ)' });
    }
    res.status(500).json({ message: 'Cannot update fuel log' });
  }
};

// DELETE /api/fuel-logs/:id
export const deleteFuelLog = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const current = await prisma.fuelLog.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ message: 'Fuel log not found' });

    await prisma.fuelLog.delete({ where: { id } });
    await recomputeTruckStats(current.truck_id);

    res.json({ ok: true });
  } catch (e) {
    console.error('deleteFuelLog error:', e);
    res.status(500).json({ message: 'Cannot delete fuel log' });
  }
};


// GET /api/distance-logs?truck_id=...&year=2025&month=1
export const listDistanceLogs = async (req, res) => {
  try {
    const { truck_id, year, month } = req.query;
    const where = {};
    if (truck_id) where.truck_id = String(truck_id);

    if (year) {
      const y = Number(year);
      const m = month ? Number(month) : null;
      const start = new Date(Date.UTC(y, (m ? m - 1 : 0), 1));
      const end   = new Date(Date.UTC(y, (m ? m : 12), 1));
      where.log_date = { gte: start, lt: end };
    }

    const rows = await prisma.truckDistanceLog.findMany({
      where,
      orderBy: [{ log_date: 'desc' }, { id: 'desc' }],
    });

    res.json(rows.map(r => ({
      ...r,
      distance_km: Number(r.distance_km),
    })));
  } catch (e) {
    console.error('listDistanceLogs error:', e);
    res.status(500).json({ message: 'Cannot list distance logs' });
  }
};

// POST /api/distance-logs  { truck_id, log_date, distance_km, note? }
export const createDistanceLog = async (req, res) => {
  try {
    const { truck_id, log_date, distance_km, note } = req.body;
    if (!truck_id) return res.status(400).json({ message: 'truck_id is required' });

    const d = parseISO(log_date);
    if (!d) return res.status(400).json({ message: 'log_date is required (ISO)' });

    const dist = toNum(distance_km, 0);
    if (dist < 0) return res.status(400).json({ message: 'distance_km must be >= 0' });

    const created = await prisma.truckDistanceLog.create({
      data: {
        truck_id,
        log_date: d,
        distance_km: dist,
        note: note ?? null,
      },
    });

    await recomputeTruckStats(truck_id);

    res.status(201).json({ ...created, distance_km: Number(created.distance_km) });
  } catch (e) {
    console.error('createDistanceLog error:', e);
    res.status(400).json({ message: 'Cannot create distance log' });
  }
};

// PATCH /api/distance-logs/:id
export const updateDistanceLog = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const current = await prisma.truckDistanceLog.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ message: 'Distance log not found' });

    const { truck_id, log_date, distance_km, note } = req.body;
    const data = {};
    if (truck_id !== undefined) data.truck_id = truck_id;
    if (log_date !== undefined) {
      const d = parseISO(log_date);
      if (!d) return res.status(400).json({ message: 'log_date is invalid' });
      data.log_date = d;
    }
    if (distance_km !== undefined) {
      const dist = toNum(distance_km);
      if (dist < 0) return res.status(400).json({ message: 'distance_km must be >= 0' });
      data.distance_km = dist;
    }
    if (note !== undefined) data.note = note ?? null;

    const updated = await prisma.truckDistanceLog.update({ where: { id }, data });
    await recomputeTruckStats(updated.truck_id);

    res.json({ ...updated, distance_km: Number(updated.distance_km) });
  } catch (e) {
    console.error('updateDistanceLog error:', e);
    res.status(500).json({ message: 'Cannot update distance log' });
  }
};

// DELETE /api/distance-logs/:id
export const deleteDistanceLog = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const current = await prisma.truckDistanceLog.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ message: 'Distance log not found' });

    await prisma.truckDistanceLog.delete({ where: { id } });
    await recomputeTruckStats(current.truck_id);

    res.json({ ok: true });
  } catch (e) {
    console.error('deleteDistanceLog error:', e);
    res.status(500).json({ message: 'Cannot delete distance log' });
  }
};

