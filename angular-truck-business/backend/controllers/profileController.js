// backend/controllers/profileController.js
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs'; // ใช้ bcryptjs

const prisma = new PrismaClient();

/** อัปโหลดรูปโปรไฟล์ (ต้องแนบไฟล์ field name = "photo") */
export async function uploadProfilePhoto(req, res, next) {
  try {
    const staffId = req.user?.staff_id;
    if (!staffId) return res.status(401).json({ message: 'Unauthorized' });
    if (!req.file) return res.status(400).json({ message: 'ไม่พบไฟล์ภาพ' });

    // makeUploader('profiles') จะเซฟไฟล์ไว้ที่ uploads/profiles/<filename>
    // ให้ client ใช้ URL นี้เรียกดูได้ผ่าน app.use('/uploads', express.static(...))
    const url = `/uploads/profiles/${req.file.filename}`;

    const staff = await prisma.staff.update({
      where: { staff_id: staffId },
      data: { profile_image_path: url },
      select: {
        staff_id: true,
        username: true,
        name: true,
        role: true,
        profile_image_path: true,
        created_at: true,
      },
    });

    return res.json({ ok: true, url, staff });
  } catch (err) {
    next(err);
  }
}

/** อัปเดตชื่อ/ชื่อผู้ใช้ */
export async function updateProfile(req, res, next) {
  try {
    const staffId = req.user.staff_id;
    const { name, username } = req.body;

    const data = {};
    if (typeof name === 'string') data.name = name.trim();
    if (typeof username === 'string') data.username = username.trim();

    const staff = await prisma.staff.update({
      where: { staff_id: staffId },
      data,
      select: {
        staff_id: true,
        username: true,
        name: true,
        role: true,
        profile_image_path: true,
        created_at: true,
      },
    });

    res.json({ staff });
  } catch (err) {
    // กัน username ซ้ำ
    if (err.code === 'P2002') {
      return res.status(409).json({ message: 'ชื่อผู้ใช้ซ้ำกับคนอื่น' });
    }
    next(err);
  }
}

/** เปลี่ยนรหัสผ่าน */
export async function changePassword(req, res, next) {
  try {
    const staffId = req.user.staff_id;
    const { oldPassword, newPassword } = req.body;

    const current = await prisma.staff.findUnique({
      where: { staff_id: staffId },
      select: { password_hash: true },
    });
    if (!current) return res.status(404).json({ message: 'ไม่พบผู้ใช้' });

    const ok = await bcrypt.compare(oldPassword || '', current.password_hash || '');
    if (!ok) return res.status(400).json({ message: 'รหัสผ่านเดิมไม่ถูกต้อง' });

    const password_hash = await bcrypt.hash(newPassword, 10);
    await prisma.staff.update({ where: { staff_id: staffId }, data: { password_hash } });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
