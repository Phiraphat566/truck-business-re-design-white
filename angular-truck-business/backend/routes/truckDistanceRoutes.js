import { Router } from 'express';
import {
  listTruckDistanceLogs,
  createTruckDistanceLog,
} from '../controllers/truckDistanceLogController.js';

const router = Router();

/**
 * GET /api/truck-distance-logs?truck_id=TRK-001
 * - หากมี ?truck_id จะกรองเฉพาะคันนั้น
 */
router.get('/truck-distance-logs', listTruckDistanceLogs);

/**
 * POST /api/truck-distance-logs
 * body: { truck_id, log_date(YYYY-MM-DD), round_number, distance_km }
 * - controller จะบันทึกและคำนวณสรุป (total_distance & efficiency) ให้อัตโนมัติ
 */
router.post('/truck-distance-logs', createTruckDistanceLog);

export default router;
