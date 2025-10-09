// middlewares/upload.js
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';

// สร้าง uploader ที่ระบุโฟลเดอร์ย่อยได้ เช่น makeUploader('employees')
export function makeUploader(subfolder) {
  const ROOT_DIR = 'uploads';
  const TARGET_DIR = path.join(ROOT_DIR, subfolder);

  // สร้างโฟลเดอร์เป้าหมายถ้ายังไม่มี
  if (!fs.existsSync(TARGET_DIR)) {
    fs.mkdirSync(TARGET_DIR, { recursive: true });
  }

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, TARGET_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      cb(null, `${uuidv4()}${ext}`);
    },
  });

  // อนุญาตเฉพาะรูปภาพ
  function fileFilter(_req, file, cb) {
    const ok = /image\/(png|jpeg|jpg|webp|gif)/.test(file.mimetype);
    if (ok) cb(null, true);
    else cb(new Error('ไฟล์ต้องเป็นรูปภาพเท่านั้น (png/jpg/jpeg/webp/gif)'));
  }

  return multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  });
}
