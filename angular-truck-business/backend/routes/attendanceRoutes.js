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
  getByEmployeeAndDate,
  findOneByEmpAndDate
} from '../controllers/attendanceController.js';

const router = express.Router();

// ----- รายงาน/สรุป (มาก่อนเสมอ) -----
router.get('/years', getYears);
router.get('/summary', getMonthSummary);
router.get('/employee-history', getEmployeeHistory);

// ----- endpoint เฉพาะเจาะจง (ต้องมาก่อน /:id) -----
router.post('/check-out', checkOutByEmployeeAndDate);
router.get('/find-one', findOneByEmpAndDate);         // << ย้ายขึ้นมา
router.get('/by-employee-date', getByEmployeeAndDate); // << ย้ายขึ้นมา

// ----- CRUD -----
router.get('/', getAllAttendance);
router.post('/', createAttendance);
router.put('/:id', updateAttendance);
router.delete('/:id', deleteAttendance);
router.get('/:id', getAttendanceById); // << ไว้ล่างสุดของ GET

export default router;
