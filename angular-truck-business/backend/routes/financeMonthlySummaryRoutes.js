// backend/routes/financeMonthlySummaryRoutes.js
import { Router } from 'express';
import { getFinanceMonthlySummary } from '../controllers/financeMonthlySummaryController.js';

const router = Router();

/**
 * Mount ภายใต้ /api/finance ใน server.js
 * ตัวอย่างเรียก:
 *   GET /api/finance/summary/monthly?year=2025
 *   GET /api/finance/summary/monthly?year=2025&income_basis=receivedAt&invoice_basis=paidAt
 */
router.get('/summary/monthly', getFinanceMonthlySummary);

export default router;
