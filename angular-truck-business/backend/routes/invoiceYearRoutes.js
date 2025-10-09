import { Router } from 'express';
import {
  listInvoiceYears,
  createInvoiceYear,
  syncInvoiceYears,
  pruneInvoiceYears,
} from '../controllers/invoiceYearController.js';

const router = Router();

router.get('/', listInvoiceYears);
router.post('/', createInvoiceYear);
router.post('/sync',  syncInvoiceYears);   // ให้เหมือน income
router.post('/prune', pruneInvoiceYears); // ให้เหมือน income

export default router;
