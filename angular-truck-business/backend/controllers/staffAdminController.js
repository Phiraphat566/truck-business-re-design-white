import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const STAFF_SELECT = {
  staff_id: true, username: true, name: true, role: true,
  profile_image_path: true, created_at: true
};

// GET /api/staff?q=&page=&pageSize=
export async function listStaff(req, res, next) {
  try {
    const { q = '', page = 1, pageSize = 50 } = req.query;
    const skip = (Number(page) - 1) * Number(pageSize);
    const where = q
      ? { OR: [
            { username: { contains: String(q), mode: 'insensitive' } },
            { name: { contains: String(q), mode: 'insensitive' } },
            { role: { contains: String(q), mode: 'insensitive' } }
          ] }
      : {};

    const [items, total] = await Promise.all([
      prisma.staff.findMany({ where, skip, take: Number(pageSize), orderBy: { staff_id: 'asc' }, select: STAFF_SELECT }),
      prisma.staff.count({ where }),
    ]);

    res.json({ items, total, page: Number(page), pageSize: Number(pageSize) });
  } catch (err) { next(err); }
}

// POST /api/staff
export async function createStaff(req, res, next) {
  try {
    const { username, name, role = 'staff', password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'ต้องมี username และ password' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const staff = await prisma.staff.create({
      data: { username: String(username).trim(), name: name?.trim() || null, role, password_hash },
      select: STAFF_SELECT
    });

    res.status(201).json({ staff });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ message: 'username ซ้ำ' });
    }
    next(err);
  }
}

// PUT /api/staff/:id
export async function updateStaff(req, res, next) {
  try {
    const id = Number(req.params.id);
    const { username, name, role, password } = req.body;

    const data = {};
    if (username !== undefined) data.username = String(username).trim();
    if (name !== undefined) data.name = name?.trim() || null;
    if (role !== undefined) data.role = role;
    if (password) data.password_hash = await bcrypt.hash(password, 10);

    const staff = await prisma.staff.update({
      where: { staff_id: id },
      data,
      select: STAFF_SELECT
    });

    res.json({ staff });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ message: 'username ซ้ำ' });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'ไม่พบ staff' });
    }
    next(err);
  }
}

// DELETE /api/staff/:id
export async function deleteStaff(req, res, next) {
  try {
    const id = Number(req.params.id);
    await prisma.staff.delete({ where: { staff_id: id } });
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'ไม่พบ staff' });
    }
    next(err);
  }
}
