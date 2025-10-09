// backend/routes/invoiceRoutes.js
import { Router } from 'express';
import {
  createInvoice,
  listInvoices,
  getInvoiceById,
  updateInvoice,
  updateInvoiceStatus,
  deleteInvoice,
  getInvoiceSummaryByMonth,
  createInvoicePayment,
  listInvoicePayments,
  refreshInvoiceStatuses
} from '../controllers/invoiceController.js';

const router = Router();

router.put('/:id', updateInvoice);
router.delete('/:id', deleteInvoice);

// ---- เส้นทางคงที่/เจาะจง ให้อยู่ก่อน ----
router.get('/summary/by-month', getInvoiceSummaryByMonth);
router.post('/refresh-statuses', refreshInvoiceStatuses);   // <= ย้ายขึ้นมาก่อน

// partial payment
router.post('/:id/payments', createInvoicePayment);
router.get('/:id/payments', listInvoicePayments);

// CRUD
router.post('/', createInvoice);
router.get('/', listInvoices);
router.put('/:id', updateInvoice);
router.patch('/:id/status', updateInvoiceStatus);
router.delete('/:id', deleteInvoice);
router.get('/:id', getInvoiceById);

export default router;
