// backend/controllers/authController.js
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/** แปลงข้อมูล staff ให้ปลอดภัยสำหรับฝั่งหน้า */
const safeStaff = (s) => ({
  staff_id: s.staff_id,
  username: s.username,
  name: s.name,
  role: s.role,
  profile_image_path: s.profile_image_path,
  created_at: s.created_at,
});

/** สร้าง JWT */
function signToken(payload, opts = {}) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN, ...opts });
}

/** สุ่มรหัสกู้คืน (อ่านง่าย ไม่ปน 0/O/I/l) */
function randomCode(len = 10) {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

/* ======================================
 * 1) Login ปกติ
 * ====================================== */
export async function login(req, res) {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ message: 'username/password required' });
    }

    const staff = await prisma.staff.findUnique({ where: { username: String(username).trim() } });
    if (!staff) return res.status(401).json({ message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });

    const ok = await bcrypt.compare(String(password), staff.password_hash);
    if (!ok) return res.status(401).json({ message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });

    const token = signToken({
      staff_id: staff.staff_id,
      sid: staff.staff_id, // เผื่อโค้ดเก่าใช้งาน
      role: staff.role,
    });

    return res.json({ token, staff: safeStaff(staff) });
  } catch (e) {
    console.error('login error', e);
    return res.status(500).json({ message: 'Server error' });
  }
}

/* ======================================
 * 2) ดึงข้อมูลตัวเอง
 * ====================================== */
export async function me(req, res) {
  try {
    const staffId = Number(req.user?.staff_id ?? req.user?.sid);
    if (!staffId) return res.status(401).json({ message: 'Unauthorized' });

    const staff = await prisma.staff.findUnique({ where: { staff_id: staffId } });
    if (!staff) return res.status(404).json({ message: 'Not found' });
    return res.json({ staff: safeStaff(staff) });
  } catch {
    return res.status(500).json({ message: 'Server error' });
  }
}

/* ======================================
 * 3) สร้างรหัสกู้คืน (ต้องล็อกอินปกติ)
 *    POST /api/auth/recovery/generate  body: { count?: number, days?: number }
 * ====================================== */
export async function generateRecoveryCodes(req, res, next) {
  try {
    const staffId = Number(req.user?.staff_id ?? req.user?.sid);
    if (!staffId) return res.status(401).json({ message: 'Unauthorized' });

    const count = Math.min(Math.max(Number(req.body?.count ?? 5), 1), 20);
    const days = Math.min(Math.max(Number(req.body?.days ?? 7), 1), 365);
    const expireAt = new Date(Date.now() + days * 24 * 3600 * 1000);

    const plainCodes = Array.from({ length: count }, () => randomCode(10));

    const rows = await Promise.all(
      plainCodes.map(async (code) => ({
        staff_id: staffId,
        code_hash: await bcrypt.hash(code, 10),
        expires_at: expireAt, // จะเป็นวันหมดอายุเดียวกันทั้งหมด
      }))
    );

    await prisma.staffRecoveryCode.createMany({ data: rows });

    // ส่ง “โค้ดจริง” กลับครั้งเดียว (อย่าเก็บฝั่ง frontend นาน)
    res.json({ codes: plainCodes, expires_at: expireAt });
  } catch (err) {
    next(err);
  }
}

/* ======================================
 * 4) ล็อกอินด้วย "รหัสกู้คืน"
 *    POST /api/auth/recovery/login  body:{ username, code }
 * ====================================== */
export async function recoveryLogin(req, res, next) {
  try {
    const { username, code } = req.body || {};
    if (!username || !code) {
      return res.status(400).json({ message: 'ต้องมี username และ code' });
    }

    const staff = await prisma.staff.findUnique({
      where: { username: String(username).trim() },
      select: { staff_id: true, username: true, name: true, role: true },
    });
    if (!staff) return res.status(400).json({ message: 'ข้อมูลไม่ถูกต้อง' });

    // หาโค้ดที่ยังใช้ได้:
    //  - อนุญาตถาวร (expires_at = NULL) หรือยังไม่หมดอายุ
    //  - ถ้าต้องการ "ใช้ครั้งเดียว" ให้เพิ่ม used_at: null และ mark used หลังผ่าน
    const candidates = await prisma.staffRecoveryCode.findMany({
      where: {
        staff_id: staff.staff_id,
        OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }],
        // used_at: null, // <- เปิดคอมเมนต์ ถ้าต้องการ one-time
      },
      orderBy: { id: 'desc' },
      take: 100,
    });

    let matched = null;
    for (const row of candidates) {
      const ok = await bcrypt.compare(String(code).trim(), row.code_hash);
      if (ok) { matched = row; break; }
    }
    if (!matched) {
      return res.status(400).json({ message: 'รหัสกู้คืนไม่ถูกต้อง หรือหมดอายุ' });
    }

    // ถ้าอยากให้ "ใช้ครั้งเดียว" ให้ mark used ที่นี่
    // await prisma.staffRecoveryCode.update({ where: { id: matched.id }, data: { used_at: new Date() } });

    // ออก token โหมด recovery (อายุสั้น)
    const token = signToken(
      { staff_id: staff.staff_id, sid: staff.staff_id, role: staff.role, mode: 'recovery' },
      { expiresIn: '30m' }
    );

    res.json({ token, staff: safeStaff(staff) });
  } catch (err) {
    next(err);
  }
}

/* ======================================
 * 5) ตั้งรหัสใหม่ (ต้องมี token — ปกติหรือโหมด recovery)
 *    POST /api/auth/password/set  body:{ newPassword }
 * ====================================== */
export async function setNewPassword(req, res, next) {
  try {
    const staffId = Number(req.user?.staff_id ?? req.user?.sid);
    if (!staffId) return res.status(401).json({ message: 'Unauthorized' });

    const { newPassword } = req.body || {};
    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ message: 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร' });
    }

    const password_hash = await bcrypt.hash(String(newPassword), 10);
    await prisma.staff.update({
      where: { staff_id: staffId },
      data: { password_hash },
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
