// backend/routes/truckExpenseRoutes.js
import { Router } from 'express';
import {
  listExpenses, getExpense, createExpense, updateExpense, deleteExpense,
} from '../controllers/truckExpenseController.js';

const router = Router();

router.get('/truck-expenses', listExpenses);
router.get('/truck-expenses/:id', getExpense);
router.post('/truck-expenses', createExpense);
router.put('/truck-expenses/:id', updateExpense);
router.delete('/truck-expenses/:id', deleteExpense);

export default router;
