// backend/routes/employeeMonthlySummaryRoutes.js
import express from 'express';
import {
  getAllMonthlySummaries,
  getMonthlySummaryById,
  createMonthlySummary,
  updateMonthlySummary,
  deleteMonthlySummary,
  employeeMonthlySummaryByYear,
  computeMonthlyFromEDS
} from '../controllers/employeeMonthlySummaryController.js';

const router = express.Router();

router.get('/', getAllMonthlySummaries);

// วางเส้นนี้ก่อน :id
router.get('/year/:year', employeeMonthlySummaryByYear);

router.get('/:id', getMonthlySummaryById);
router.post('/', createMonthlySummary);
router.put('/:id', updateMonthlySummary);
router.delete('/:id', deleteMonthlySummary);

router.post('/compute-from-eds', computeMonthlyFromEDS); // body: { year, month }

export default router;
