// routes/employeeRoutes.js
import express from 'express';
import { makeUploader } from '../middlewares/upload.js';
import {
  getAllEmployees,
  getEmployeeSummary,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  uploadEmployeePhoto,
  deleteEmployeePhoto,
} from '../controllers/employeeController.js';

const router = express.Router();


router.get('/', getAllEmployees); 
router.get('/:id/summary', getEmployeeSummary);
router.post('/', createEmployee);          
router.delete('/:id', deleteEmployee);
router.put('/:id', updateEmployee);
router.post('/:id/photo', makeUploader('employees').single('image'), uploadEmployeePhoto);
router.delete('/:id/photo', deleteEmployeePhoto);

export default router;
