import express from 'express';
import {
  getAllTrips,
  getTripById,
  createTrip,
  updateTrip,
  deleteTrip
} from '../controllers/tripController.js';

const router = express.Router();

router.get('/', getAllTrips);
router.get('/:id', getTripById);
router.post('/', createTrip);
router.put('/:id', updateTrip);
router.delete('/:id', deleteTrip);

export default router;
