// fuelLogRoutes.js
import { Router } from 'express';
import {
  listFuelLogs,
  createFuelLog,
  updateFuelLog,   // <— เพิ่ม
  deleteFuelLog,   // <— เพิ่ม
} from '../controllers/fuelLogController.js';

const router = Router();

/** GET /api/fuel-logs?truck_id=&year=&month= */
router.get('/fuel-logs', listFuelLogs);

/** POST /api/fuel-logs */
router.post('/fuel-logs', createFuelLog);

/** PATCH /api/fuel-logs/:id */
router.patch('/fuel-logs/:id', updateFuelLog);

/** DELETE /api/fuel-logs/:id */
router.delete('/fuel-logs/:id', deleteFuelLog);

export default router;
