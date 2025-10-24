import { Router } from 'express';
import {
  listTruckDistanceLogs,
  createTruckDistanceLog,
  updateDistanceLog,
  deleteDistanceLog,
  
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


router.post('/distance-logs', createTruckDistanceLog);
router.put('/distance-logs/:id', updateDistanceLog);    // ทางเลือก A (PUT)
router.patch('/distance-logs/:id', updateDistanceLog);  // เผื่อกรณีส่ง PATCH
router.delete('/distance-logs/:id', deleteDistanceLog);

export default router;
