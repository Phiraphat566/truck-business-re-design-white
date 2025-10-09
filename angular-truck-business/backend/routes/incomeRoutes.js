// backend/routes/incomeRoutes.js
import express from 'express';
import {
  upload,
  listIncomes,
  getIncomeById,
  createIncome,
  updateIncome,
  deleteIncome,
  createIncomePayment,
  listIncomePayments,
  getIncomeSummaryByMonth,
  refreshIncomeStatuses,   // ชื่อเดียวกับ invoice
} from '../controllers/incomeController.js';

const router = express.Router();

/* ----- รายงานและรีเฟรชสถานะ (มาก่อน /:id) ----- */
router.get('/summary/by-month', getIncomeSummaryByMonth);
router.post('/refresh-statuses', refreshIncomeStatuses); // ชื่อให้ตรงกัน

/* ----- งวดรับเงิน (มาก่อน /:id) ----- */
router.get('/:id/payments', listIncomePayments);
router.post('/:id/payments', createIncomePayment);

/* ----- CRUD หลัก ----- */
router.get('/', listIncomes);
router.post('/', upload.single('file'), createIncome);
router.put('/:id', upload.single('file'), updateIncome);
router.delete('/:id', deleteIncome);
router.get('/:id', getIncomeById);

/* ----- ทางลัดแบบเดิม (optional) ----- */
router.get('/year/:year', (req, res, next) => {
  req.query.year = req.params.year;
  return listIncomes(req, res, next);
});

export default router;
