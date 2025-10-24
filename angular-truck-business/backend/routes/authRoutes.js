// backend/routes/authRoutes.js
import express from 'express';
import {
  login,
  me,
  generateRecoveryCodes,
  recoveryLogin,
  setNewPassword,
} from '../controllers/authController.js';
import { requireAuth } from '../middlewares/requireAuth.js';
import { makeUploader } from '../middlewares/upload.js';
import { uploadProfilePhoto, updateProfile, changePassword } from '../controllers/profileController.js';

const router = express.Router();

// login / me
router.post('/login', login);
router.get('/me', requireAuth, me);

// profile
router.patch('/me', requireAuth, updateProfile);
router.post('/change-password', requireAuth, changePassword);
router.post('/me/photo', requireAuth, makeUploader('profiles').single('photo'), uploadProfilePhoto);

// recovery
router.post('/recovery/generate', requireAuth, generateRecoveryCodes);
router.post('/recovery/login', recoveryLogin);
router.post('/password/set', requireAuth, setNewPassword);

export default router;
