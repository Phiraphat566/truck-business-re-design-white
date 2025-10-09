// backend/middleware/requireAuth.js
import jwt from 'jsonwebtoken';

export function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) {
      return res.status(401).json({ message: 'Missing token' });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // ใส่ข้อมูลผู้ใช้ไว้ใน req.user เพื่องานถัดไป
    req.user = { staff_id: payload.sid, role: payload.role };
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid/expired token' });
  }
}

// ใช้คู่กับ requireAuth ที่มีอยู่แล้ว
export function requireAdmin(req, res, next) {
  if (req?.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin only' });
  }
  next();
}

