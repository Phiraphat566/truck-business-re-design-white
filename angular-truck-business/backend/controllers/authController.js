// backend/controllers/authController.js
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

const safeStaff = (s) => ({
  staff_id: s.staff_id,
  username: s.username,
  name: s.name,
  role: s.role,
  profile_image_path: s.profile_image_path,
  created_at: s.created_at,
});

export async function login(req, res) {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ message: 'username/password required' });
    }

    const staff = await prisma.staff.findUnique({ where: { username } });
    if (!staff) return res.status(401).json({ message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });

    const ok = await bcrypt.compare(password, staff.password_hash);
    if (!ok) return res.status(401).json({ message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });

    const token = jwt.sign(
      { sid: staff.staff_id, role: staff.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    return res.json({ token, staff: safeStaff(staff) });
  } catch (e) {
    console.error('login error', e);
    return res.status(500).json({ message: 'Server error' });
  }
}

export async function me(req, res) {
  try {
    const staff = await prisma.staff.findUnique({ where: { staff_id: req.user.staff_id } });
    if (!staff) return res.status(404).json({ message: 'Not found' });
    return res.json({ staff: safeStaff(staff) });
  } catch (e) {
    return res.status(500).json({ message: 'Server error' });
  }
}
