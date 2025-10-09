import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
export const getAllTrips = async (req, res) => {
  const trips = await prisma.trip.findMany();
  res.json(trips);
};

export const getTripById = async (req, res) => {
  const { id } = req.params;
  const trip = await prisma.trip.findUnique({ where: { id } });
  res.json(trip);
};

export const createTrip = async (req, res) => {
  const { jobId, distanceKM, fuelUsedLiters, fuelCost } = req.body;

  if (!jobId || distanceKM === undefined || fuelUsedLiters === undefined || fuelCost === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // หา Trip_ID ล่าสุด
    const allTrips = await prisma.trip.findMany({
      select: { id: true }
    });

    const maxNumber = allTrips.reduce((max, trip) => {
      const match = trip.id.match(/^TRIP(\d{3})$/);
      const num = match ? parseInt(match[1]) : 0;
      return Math.max(max, num);
    }, 0);

    const newId = `TRIP${String(maxNumber + 1).padStart(3, '0')}`;

    // สร้าง trip ใหม่
    const created = await prisma.trip.create({
      data: {
        id: newId,
        jobId,
        distanceKM: parseInt(distanceKM),
        fuelUsedLiters: parseInt(fuelUsedLiters),
        fuelCost: parseInt(fuelCost),
      },
    });

    res.status(201).json(created);
  } catch (error) {
    console.error('Create Trip Error:', error);
    res.status(500).json({ error: 'Failed to create trip' });
  }
};


export const updateTrip = async (req, res) => {
  const { id } = req.params;
  const { distanceKM, fuelUsedLiters, fuelCost } = req.body;

  try {
    const updated = await prisma.trip.update({
      where: { id },
      data: {
        distanceKM: parseInt(distanceKM),
        fuelUsedLiters: parseInt(fuelUsedLiters),
        fuelCost: parseInt(fuelCost),
      },
    });

    res.json(updated);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Trip not found' });
    }

    console.error('Update Trip Error:', error);
    res.status(500).json({ error: 'Failed to update trip' });
  }
};


export const deleteTrip = async (req, res) => {
  const { id } = req.params;
  await prisma.trip.delete({ where: { id } });
  res.json({ message: 'Deleted successfully' });
};
