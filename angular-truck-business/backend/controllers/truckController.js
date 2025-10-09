// backend/controllers/truckController.js
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
const prisma = new PrismaClient();

const num = (v) => (v == null ? null : Number(v));

/** ใช้ตอน list: สร้างออปเจ็กต์รถจากค่าที่สรุปจาก Log แล้ว */
const mapTruckFromComputed = (t, distance, liters) => {
  const eff =
    liters > 0
      ? Number((distance / liters).toFixed(1))
      : t.fuel_efficiency_km_per_liter == null
        ? null
        : Number(t.fuel_efficiency_km_per_liter);

  return {
    truck_id: t.id,
    plate: t.plate,
    model: t.model ?? null,

    // ระยะรวมมาจาก SUM ของ TruckDistanceLog
    total_distance: Number(distance || 0),

    // ถ้ามีลิตรจาก log ค่อยคำนวณใหม่ ไม่งั้น fallback ค่าที่บันทึกไว้ในตาราง Truck
    fuel_efficiency_km_per_liter: eff,

    currentDriver: t.currentDriver
      ? { id: t.currentDriver.id, name: t.currentDriver.name, phone: t.currentDriver.phone ?? null }
      : null,
  };
};

/** ดึงสรุประยะ/ลิตรจาก Log ของรถหนึ่งคัน */
const getComputedFromLogs = async (truckId) => {
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
  return {
    distance: Number(distAgg._sum.distance_km || 0),
    liters: Number(fuelAgg._sum.liters || 0),
  };
};

// GET /api/trucks
export const listTrucks = async (_req, res) => {
  try {
    const [trucks, distGroup, fuelGroup] = await Promise.all([
      prisma.truck.findMany({
        include: { currentDriver: { select: { id: true, name: true, phone: true } } },
        orderBy: [{ plate: 'asc' }],
      }),
      prisma.truckDistanceLog.groupBy({
        by: ['truck_id'],
        _sum: { distance_km: true },
      }),
      prisma.fuelLog.groupBy({
        by: ['truck_id'],
        _sum: { liters: true },
      }),
    ]);

    const distMap = new Map(distGroup.map(d => [d.truck_id, Number(d._sum.distance_km || 0)]));
    const litersMap = new Map(fuelGroup.map(f => [f.truck_id, Number(f._sum.liters || 0)]));

    const data = trucks.map(t =>
      mapTruckFromComputed(t, distMap.get(t.id) ?? 0, litersMap.get(t.id) ?? 0)
    );

    res.json(data);
  } catch (e) {
    console.error('listTrucks error:', e);
    res.status(500).json({ message: 'Cannot list trucks' });
  }
};

// POST /api/trucks
export const createTruck = async (req, res) => {
  try {
    const { truck_id, plate, model, total_distance, fuel_efficiency_km_per_liter, current_driver_id } = req.body;
    if (!plate) return res.status(400).json({ message: 'plate is required' });

    const id = truck_id && String(truck_id).trim() ? String(truck_id).trim() : randomUUID();

    const created = await prisma.truck.create({
      data: {
        id,
        plate,
        model: model ?? null,
        // ยอมรับค่าที่ส่งมาได้ แต่ตอน list จะไม่ใช้ฟิลด์นี้แล้ว
        total_distance: Number(total_distance || 0),
        fuel_efficiency_km_per_liter:
          fuel_efficiency_km_per_liter == null ? null : Number(fuel_efficiency_km_per_liter),
        current_driver_id: current_driver_id || null,
      },
      include: { currentDriver: { select: { id: true, name: true, phone: true } } },
    });

    const { distance, liters } = await getComputedFromLogs(created.id);
    res.status(201).json(mapTruckFromComputed(created, distance, liters));
  } catch (e) {
    console.error('createTruck error:', e);
    if (e.code === 'P2002') return res.status(400).json({ message: 'plate must be unique' });
    res.status(400).json({ message: 'Cannot create truck' });
  }
};

// PUT /api/trucks/:id
export const updateTruck = async (req, res) => {
  try {
    const { id } = req.params;
    const { plate, model, total_distance, fuel_efficiency_km_per_liter, current_driver_id } = req.body;

    const updated = await prisma.truck.update({
      where: { id },
      data: {
        ...(plate !== undefined ? { plate } : {}),
        ...(model !== undefined ? { model } : {}),
        // เก็บค่าได้ แต่ตอน list จะคิดจาก log
        ...(total_distance !== undefined ? { total_distance: Number(total_distance) } : {}),
        ...(fuel_efficiency_km_per_liter !== undefined
          ? { fuel_efficiency_km_per_liter: fuel_efficiency_km_per_liter == null ? null : Number(fuel_efficiency_km_per_liter) }
          : {}),
        ...(current_driver_id !== undefined ? { current_driver_id: current_driver_id || null } : {}),
      },
      include: { currentDriver: { select: { id: true, name: true, phone: true } } },
    });

    const { distance, liters } = await getComputedFromLogs(updated.id);
    res.json(mapTruckFromComputed(updated, distance, liters));
  } catch (e) {
    console.error('updateTruck error:', e);
    if (e.code === 'P2025') return res.status(404).json({ message: 'Truck not found' });
    res.status(400).json({ message: 'Cannot update truck' });
  }
};

// DELETE /api/trucks/:id
export const deleteTruck = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.truck.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) {
    console.error('deleteTruck error:', e);
    if (e.code === 'P2025') return res.status(404).json({ message: 'Truck not found' });
    res.status(400).json({ message: 'Cannot delete truck' });
  }
};

// PUT /api/trucks/:id/driver  { employee_id: 'EMP001' }  // ส่ง null/'' เพื่อลบคนขับ
export const setTruckDriver = async (req, res) => {
  const { id } = req.params;                 // truck_id
  const { employee_id } = req.body ?? {};    // อาจเป็น null/'' เพื่อเคลียร์
  const newDriverId =
    employee_id && String(employee_id).trim() !== '' ? String(employee_id).trim() : null;

  try {
    const truck = await prisma.$transaction(async (tx) => {
      // 1) ตรวจว่ามีรถคันนี้ไหม + ดึง current_driver_id
      const current = await tx.truck.findUnique({
        where: { id },
        select: { id: true, current_driver_id: true },
      });
      if (!current) {
        const err = new Error('Truck not found');
        err.code = 'P2025';
        throw err;
      }

      // 2) ถ้าไม่ได้เปลี่ยนจริง คืนข้อมูลเดิม
      if ((current.current_driver_id || null) === (newDriverId || null)) {
        return await tx.truck.findUnique({
          where: { id },
          include: { currentDriver: { select: { id: true, name: true, phone: true } } },
        });
      }

      // 3) ถ้ามีการกำหนดพนักงานใหม่ ให้ตรวจว่ามีอยู่จริง และไม่ได้ถูกใช้อยู่กับรถคันอื่น
      if (newDriverId) {
        // *** สำคัญ: ฝั่ง Prisma ใช้ field 'id' ไม่ใช่ 'employee_id' ***
        const emp = await tx.employee.findUnique({
          where: { id: newDriverId },
          select: { id: true },
        });
        if (!emp) {
          const err = new Error('employee_id not found');
          err.code = 'P2003';
          throw err;
        }

        const busy = await tx.truck.findFirst({
          where: { current_driver_id: newDriverId, NOT: { id } },
          select: { id: true, plate: true },
        });
        if (busy) {
          const err = new Error(`Driver already assigned to truck ${busy.plate || busy.id}`);
          err.code = 'DRIVER_BUSY';
          throw err;
        }
      }

      // 4) ปิด assignment เดิมของรถคันนี้ (ถ้ามี)
      await tx.truckDriverAssignment.updateMany({
        where: { truck_id: id, end_at: null },
        data: { end_at: new Date() },
      });

      // 5) ถ้ามีการกำหนดคนขับใหม่ สร้าง assignment ใหม่
      if (newDriverId) {
        await tx.truckDriverAssignment.create({
          data: {
            truck_id: id,
            employee_id: newDriverId,
            start_at: new Date(),
            end_at: null,
          },
        });
      }

      // 6) อัปเดต current_driver_id ใน Truck
      return await tx.truck.update({
        where: { id },
        data: { current_driver_id: newDriverId },
        include: { currentDriver: { select: { id: true, name: true, phone: true } } },
      });
    });

    // สรุปผลจาก Log เพื่อตอบกลับตามรูปแบบที่หน้าเว็บใช้
    const { distance, liters } = await getComputedFromLogs(truck.id);
    res.json(mapTruckFromComputed(truck, distance, liters));
  } catch (e) {
    console.error('setTruckDriver error:', e);
    if (e.code === 'DRIVER_BUSY')
      return res.status(409).json({ message: 'คนขับคนนี้ถูกใช้อยู่กับรถคันอื่นแล้ว' });
    if (e.code === 'P2025') return res.status(404).json({ message: 'Truck not found' });
    if (e.code === 'P2003') return res.status(400).json({ message: 'employee_id not found' });
    return res.status(400).json({ message: 'Cannot set driver' });
  }
};

