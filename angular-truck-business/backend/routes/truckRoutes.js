import { Router } from 'express';
import {
  listTrucks,
  createTruck,
  updateTruck,
  deleteTruck,
  setTruckDriver,
} from '../controllers/truckController.js';

const router = Router();

// อ่านรายการรถทั้งหมด (รวม currentDriver)
router.get('/trucks', listTrucks);

// เพิ่มรถใหม่
router.post('/trucks', createTruck);

// แก้ไขรถ (ทะเบียน/รุ่น/คนขับปัจจุบัน/ฯลฯ)
router.put('/trucks/:id', updateTruck);

// ลบรถ
router.delete('/trucks/:id', deleteTruck);

// เปลี่ยน/ลบ คนขับปัจจุบันของรถคันนี้ (body: { current_driver_id: string | null })
router.put('/trucks/:id/driver', setTruckDriver);

export default router;
