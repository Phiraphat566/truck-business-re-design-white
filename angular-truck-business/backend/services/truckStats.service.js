// services/truckStats.service.js
const { PrismaClient, Prisma } = require('@prisma/client');
const prisma = new PrismaClient();

async function recomputeTruckStats(truckId) {
  // รวมระยะทางจาก TruckDistanceLog
  const distAgg = await prisma.truckDistanceLog.aggregate({
    where: { truck_id: truckId },
    _sum: { distance_km: true }
  });
  // รวมลิตรจาก FuelLog
  const fuelAgg = await prisma.fuelLog.aggregate({
    where: { truck_id: truckId },
    _sum: { liters: true }
  });

  const km = new Prisma.Decimal(distAgg._sum.distance_km || 0);
  const liters = new Prisma.Decimal(fuelAgg._sum.liters || 0);

  const efficiency = liters.gt(0) ? km.div(liters) : null;

  await prisma.truck.update({
    where: { id: truckId },
    data: {
      total_distance: km,                                 // Decimal(12,2)
      fuel_efficiency_km_per_liter: efficiency            // Decimal(10,2) | null
    }
  });
}

module.exports = { recomputeTruckStats };
