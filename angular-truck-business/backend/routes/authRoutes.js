// backend/routes/authRoutes.js
import express from 'express';
import { login, me } from '../controllers/authController.js';
import { requireAuth } from '../middlewares/requireAuth.js';
import { makeUploader } from '../middlewares/upload.js';
import { uploadProfilePhoto, updateProfile, changePassword } from '../controllers/profileController.js';

const router = express.Router();

router.post('/login', login);
router.get('/me', requireAuth, me);

router.patch('/me', requireAuth, updateProfile); // <-- เพิ่ม
router.post('/change-password', requireAuth, changePassword); // <-- ถ้าต้องการ

router.post('/me/photo',
  requireAuth,
  makeUploader('profiles').single('photo'),
  uploadProfilePhoto
);

export default router;
