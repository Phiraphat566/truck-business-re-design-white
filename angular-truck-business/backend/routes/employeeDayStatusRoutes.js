// backend/routes/employeeDayStatusRoutes.js
import express from 'express';
import { listByDate, getOne, upsert } from '../controllers/employeeDayStatusController.js';
import {
    getDayStatuses,
    upsertManualStatus,
    clearManualOverride
} from '../controllers/edsController.js';

const router = express.Router();

router.get('/', listByDate);                 // ?date=YYYY-MM-DD
router.get('/:employeeId', getOne);          // ?date=YYYY-MM-DD
router.post('/upsert', upsert);              // body: employeeId, date, status, ...

//// EDS routes

router.get('/eds', getDayStatuses);          // ?date=YYYY-MM-DD
router.post('/eds/upsert', upsertManualStatus); // body: { employeeId, date(YYYY-MM-DD), status }
router.post('/eds/clear-manual', clearManualOverride); // body: { employeeId, date(YYYY-MM-DD) }

export default router;
