// backend/routes/financeRoutes.js
import { Router } from 'express';
import {
  getFinanceYears,
  getIncomeYears,
  getInvoiceYears
} from '../controllers/financeYearsController.js';

const router = Router();

router.get('/years', getFinanceYears);
router.get('/years/income', getIncomeYears);
router.get('/years/invoice', getInvoiceYears);

export default router;
