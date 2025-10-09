// backend/routes/lineTaskRoutes.js
import express from 'express';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
dotenv.config();

const prisma = new PrismaClient();
const router = express.Router();

/** แปลง 'YYYY-MM-DD' -> Date (เอาเฉพาะวัน, ไม่เอาเวลา) แบบ timezone-safe */
function toDateOnly(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = String(dateStr).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}
function todayDateOnly() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

// เผื่อใช้เช็คจากภายนอก
router.get('/health', (_req, res) => res.json({ ok: true }));

/**
 * POST /api/line/sendTask
 * body: {
 *   title: string,
 *   when: string,        // ข้อความเวลาแบบไทยที่โชว์ใน LINE
 *   where: string,
 *   note?: string,
 *   date?: string,       // 'YYYY-MM-DD' -> เก็บ EmployeeCall.call_date และ JobAssignment.assigned_date
 *   employeeId?: string  // EMP001 ... -> ผูกกับตาราง Employee
 * }
 */
router.post('/sendTask', async (req, res) => {
  try {
    const { title, when, where, note, date, employeeId } = req.body || {};
    if (!title || !when || !where) {
      return res.status(400).json({ error: 'กรอก title/when/where ให้ครบ' });
    }
    if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
      return res.status(500).json({ error: 'ไม่พบ LINE_CHANNEL_ACCESS_TOKEN ใน .env' });
    }
    if (!process.env.LINE_DEFAULT_GROUP_ID) {
      return res.status(400).json({ error: 'ต้องตั้งค่า LINE_DEFAULT_GROUP_ID ใน .env' });
    }

    // หา info พนักงาน (ถ้าเลือกมา)
    let emp = null;
    if (employeeId) {
      emp = await prisma.employee.findUnique({
        where: { id: String(employeeId).trim() },
        select: { id: true, name: true },
      });
    }

    // สร้างข้อความที่จะส่งเข้า LINE
    const textLines = [];
    if (emp) textLines.push(`พนักงาน: ${emp.name} (${emp.id})`);
    textLines.push(`งาน: ${title}`);
    textLines.push(`เวลา: ${when}`);
    textLines.push(`สถานที่: ${where}`);
    if (note) textLines.push(`หมายเหตุ: ${note}`);
    const text = textLines.join('\n');

    // ส่งเข้า LINE กลุ่มเดียว (ค่าคงที่จาก .env)
    const to = process.env.LINE_DEFAULT_GROUP_ID;
    const r = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({ to, messages: [{ type: 'text', text }] }),
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => '');
      return res.status(r.status).json({ error: errText || 'LINE API error' });
    }

    // บันทึกลงฐานข้อมูล (แต่ละส่วนแยก try/catch กัน)
    const callDate = toDateOnly(date) ?? todayDateOnly();

    // 1) EmployeeCall (ถ้ามีพนักงาน)
    let savedCallId = null;
    if (emp) {
      try {
        const saved = await prisma.employeeCall.create({
          data: {
            employee_id: emp.id,
            call_date: callDate, // @db.Date
            message: text,
          },
        });
        savedCallId = saved.id;
      } catch (e) {
        console.error('Save EmployeeCall failed:', e);
        // ไม่ throw ต่อ
      }
    }

    // 2) JobAssignment (ถ้ามีพนักงาน)
    let savedAssignmentId = null;
    if (emp) {
      // สรุปสั้น ๆ สำหรับรายละเอียดงาน
      const plain = [
        `งาน: ${title}`,
        `เวลา: ${when}`,
        `สถานที่: ${where}`,
        note ? `หมายเหตุ: ${note}` : null,
      ]
        .filter(Boolean)
        .join(' • ');

      try {
        const saved = await prisma.jobAssignment.create({
          data: {
            employee_id: emp.id,
            assigned_date: callDate,     // เก็บเป็น date-only (00:00)
            job_description: plain,
            source: 'LINE',
          },
        });
        savedAssignmentId = saved.id;
      } catch (e) {
        console.error('Create JobAssignment failed:', e);
        // ไม่ throw ต่อ
      }
    }

    return res.json({
      ok: true,
      message: 'sent',
      savedCallId,
      savedAssignmentId,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || 'Internal error' });
  }
});

export default router;
