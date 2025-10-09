// backend/routes/workYearRoutes.js
import express from 'express';
import { getYears, addYear, deleteYear } from '../controllers/workYearController.js';

const router = express.Router();

router.get('/', getYears);          // GET  /api/work-years
router.post('/', addYear);          // POST /api/work-years  { year? }
router.delete('/:year', deleteYear); // DELETE /api/work-years/:year  (ออปชัน)

export default router;
