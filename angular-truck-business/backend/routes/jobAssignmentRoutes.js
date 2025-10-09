import express from 'express';
import {
  getAllJobAssignments,
  getJobAssignmentById,
  createJobAssignment,
  updateJobAssignment,
  deleteJobAssignment,
  latestByDate,
  acceptLatestForEmployee,
  acceptJobById,
  historyForEmployee,

  // ✅ ใหม่
  completeJobById,
  reopenJobById,
} from '../controllers/jobAssignmentController.js';

const router = express.Router();

/** ค้นหา/กรอง/ประวัติ */
router.get('/', getAllJobAssignments);
router.get('/by-date', latestByDate); // ?date=YYYY-MM-DD&includeCompleted=0|1 (default 0)
router.get('/employee/:employeeId/history', historyForEmployee); // ?from=&to=

/** สร้าง/อ่าน/แก้/ลบ */
router.post('/', createJobAssignment);
router.get('/:id', getJobAssignmentById);
router.put('/:id', updateJobAssignment);
router.delete('/:id', deleteJobAssignment);

/** ยืนยันรับงาน */
router.post('/accept', acceptLatestForEmployee); // { employeeId, date? }
router.post('/:id/accept', acceptJobById);

/** ✅ ปิดงาน/ย้อนสถานะ */
router.patch('/:id/complete', completeJobById);   // body: { note?, staffId? }
router.patch('/:id/reopen',   reopenJobById);

export default router;
