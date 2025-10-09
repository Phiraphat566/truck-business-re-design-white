import express from 'express';
import { requireAuth , requireAdmin  } from '../middlewares/requireAuth.js';

import { listStaff, createStaff, updateStaff, deleteStaff } from '../controllers/staffAdminController.js';

const router = express.Router();

router.get('/',  requireAuth, requireAdmin, listStaff);
router.post('/', requireAuth, requireAdmin, createStaff);
router.put('/:id', requireAuth, requireAdmin, updateStaff);
router.delete('/:id', requireAuth, requireAdmin, deleteStaff);

export default router;
