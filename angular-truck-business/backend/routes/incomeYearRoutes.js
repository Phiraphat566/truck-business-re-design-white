// routes/incomeYearRoutes.js
import { Router } from 'express';
import {
  listIncomeYears,
  createIncomeYear,
  syncIncomeYears,
  pruneIncomeYears,
} from '../controllers/incomeYearController.js';

const router = Router();

router.get('/', listIncomeYears);
router.post('/', createIncomeYear);

// optional utilities
router.post('/sync',  syncIncomeYears);
router.post('/prune', pruneIncomeYears);

export default router;
