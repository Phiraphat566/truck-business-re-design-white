import { Router } from 'express';
import { getDashboardAttendance } from '../controllers/attendanceController.js';

const router = Router();

// จะได้ path: /api/dashboard/attendance?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/attendance', getDashboardAttendance);

export default router;
