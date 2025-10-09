// backend/routes/payrollRoutes.js
import express from 'express';
import {
  getPayrollSummaryByMonth,
  listPayrollByMonth,
  createPayrollRun,
  updatePayrollRun,
  deletePayrollRun,
  createPayrollItem,
  updatePayrollItem,
  deletePayrollItem,
  payPayrollItem,
  ensurePayrollRunByYM,
  createPayrollItemByYM,
} from '../controllers/payrollController.js';

const router = express.Router();

// ==== Summary (กราฟ) ====
router.get('/summary/by-month', getPayrollSummaryByMonth);

// ==== รายการรายเดือน (year, month) ====
router.get('/', listPayrollByMonth);

// ==== งวดเงินเดือน (run) ====
router.post('/runs', createPayrollRun);
router.patch('/runs/:runId', updatePayrollRun);
router.delete('/runs/:runId', deletePayrollRun);

// ==== รายการพนักงานในงวด (item) ====
router.post('/runs/:runId/items', createPayrollItem);
router.patch('/items/:itemId', updatePayrollItem);
router.delete('/items/:itemId', deletePayrollItem);

// ==== ทำรายการ “จ่ายเงินเดือน” ====
router.post('/items/:itemId/pay', payPayrollItem);

// ==== Helper/Convenience ====
router.post('/runs/ensure', ensurePayrollRunByYM);   // body: {year, month, title?, note?}
router.post('/items/by-ym', createPayrollItemByYM);  // body: {year, month, employee_id, base_salary, allowance?, overtime?, deduction?, note?}

export default router;
