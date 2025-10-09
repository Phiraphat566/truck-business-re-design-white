// backend/routes/attendanceRoutes.js
import express from 'express';
import {
  getAllAttendance,
  getAttendanceById,
  createAttendance,
  updateAttendance,
  deleteAttendance,
  getYears,
  getMonthSummary,
  getEmployeeHistory,
  checkOutByEmployeeAndDate,

} from '../controllers/attendanceController.js';

const router = express.Router();

// ---------- รายงาน/สรุป ต้องมาก่อน route ที่มี :id ----------
router.get('/years', getYears);
router.get('/summary', getMonthSummary);
router.get('/employee-history', getEmployeeHistory);

// ---------- CRUD ----------
router.get('/', getAllAttendance);
router.post('/', createAttendance);
router.get('/:id', getAttendanceById);
router.put('/:id', updateAttendance);
router.delete('/:id', deleteAttendance);

// ---------- check-out by employeeId and date (query param) ----------
router.post('/check-out', checkOutByEmployeeAndDate);





export default router;
