  // routes/travelCostRoutes.js
  import express from 'express';
  import {
    getAllTravelCosts,
    getTravelCostById,
    createTravelCost,
    updateTravelCost,
    deleteTravelCost,
    calcTravelPrice,
  } from '../controllers/travelCostController.js';

  const router = express.Router();

  /**
   * ไฟล์นี้ถูก mount ที่ /api/travel-costs ใน server.js
   * เช่น:
   *   app.use('/api/travel-costs', travelCostRoutes);
   */

  /** รายการทั้งหมด */
  router.get('/', getAllTravelCosts);

  /** ตัวคำนวณราคา — ต้องมาก่อน /:id เพื่อไม่ให้ชน (id = "calc") */
  router.get('/calc', calcTravelPrice);

  /** อ่านรายละเอียดตาม id (บังคับเป็นตัวเลข) */
  router.get('/:id(\\d+)', getTravelCostById);

  /** สร้างรายการใหม่ */
  router.post('/', createTravelCost);

  /** แก้ไขข้อมูลบางส่วน (แนะนำใช้ PATCH) */
  router.patch('/:id(\\d+)', updateTravelCost);

  /** เผื่อระบบเดิมเรียก PUT อยู่ ให้รองรับด้วย */
  router.put('/:id(\\d+)', updateTravelCost);

  /** ลบรายการ */
  router.delete('/:id(\\d+)', deleteTravelCost);

  export default router;
