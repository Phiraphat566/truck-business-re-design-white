// routes/employeeCallRoutes.js
import express from 'express';
import {
  listEmployeeCalls,
  getEmployeeCall,
  createEmployeeCall,
  updateEmployeeCall,
  deleteEmployeeCall,
} from '../controllers/employeeCall.controller.js';

const router = express.Router();

router.get('/', listEmployeeCalls);
router.get('/:id', getEmployeeCall);
router.post('/', createEmployeeCall);
router.put('/:id', updateEmployeeCall);
router.delete('/:id', deleteEmployeeCall);

export default router;
