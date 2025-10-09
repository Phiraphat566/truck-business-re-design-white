// backend/routes/leaveRequestRoutes.js
import express from 'express';
import {
  getLeaves,
  getLeaveById,
  createLeave,
  updateLeave,
  deleteLeave,
  
} from '../controllers/leaveRequestController.js';

const router = express.Router();

router.get('/', getLeaves);          // list + optional filters ?employeeId=&year=&month=
router.get('/:id', getLeaveById);    // read one
router.post('/', createLeave);       // create
router.put('/:id', updateLeave);     // update
router.delete('/:id', deleteLeave);  // delete

export default router;
