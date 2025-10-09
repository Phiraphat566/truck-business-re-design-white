import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const num = (v) => (v == null ? null : Number(v));

async function recomputeTruckStats(truckId) {
  const [distAgg, fuelAgg] = await Promise.all([
    prisma.truckDistanceLog.aggregate({
      where: { truck_id: truckId },
      _sum: { distance_km: true },
    }),
    prisma.fuelLog.aggregate({
      where: { truck_id: truckId },
      _sum: { liters: true },
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

// GET /api/truck-distance-logs?truck_id=xxx
export const listTruckDistanceLogs = async (req, res) => {
  try {
    const { truck_id } = req.query;
    const where = truck_id ? { truck_id } : {};
    const rows = await prisma.truckDistanceLog.findMany({
      where,
      orderBy: [{ log_date: 'desc' }, { round_number: 'desc' }, { id: 'desc' }],
    });
    const data = rows.map((r) => ({
      id: r.id,
      truck_id: r.truck_id,
      log_date: r.log_date,
      round_number: r.round_number,
      distance_km: Number(r.distance_km),
    }));
    res.json(data);
  } catch (e) {
    console.error('listTruckDistanceLogs error:', e);
    res.status(500).json({ message: 'Cannot list distance logs' });
  }
};

// POST /api/truck-distance-logs
// body: { truck_id, log_date(YYYY-MM-DD), round_number, distance_km }
export const createTruckDistanceLog = async (req, res) => {
  try {
    const { truck_id, log_date, round_number, distance_km } = req.body;
    if (!truck_id) return res.status(400).json({ message: 'truck_id is required' });
    if (!log_date) return res.status(400).json({ message: 'log_date is required' });

    const created = await prisma.truckDistanceLog.create({
      data: {
        truck_id,
        log_date: new Date(log_date),
        round_number: Number(round_number || 1),
        distance_km: Number(distance_km || 0),
      },
    });

    // คำนวณสรุปให้รถคันนี้
    await recomputeTruckStats(truck_id);

    res.status(201).json({
      ...created,
      distance_km: Number(created.distance_km),
    });
  } catch (e) {
    console.error('createTruckDistanceLog error:', e);
    if (e.code === 'P2002') {
      return res.status(409).json({ message: 'รายการซ้ำ (truck_id, วันที่, รอบ)' });
    }
    res.status(400).json({ message: 'Cannot create distance log' });
  }
};
