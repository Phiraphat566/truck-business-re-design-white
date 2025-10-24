// backend/routes/lineWebhookRoutes.js
import express from 'express';
import crypto from 'crypto';
import fetch from 'node-fetch';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

const CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET || '';

/* ---------- helpers ---------- */
function verifyLineSignature(req, res, next) {
  try {
    const signature = req.get('x-line-signature') || '';
    const body = req.rawBody ? req.rawBody : Buffer.from(JSON.stringify(req.body));
    const hmac = crypto.createHmac('sha256', CHANNEL_SECRET).update(body).digest('base64');
    if (signature !== hmac) return res.sendStatus(401);
    next();
  } catch (e) {
    console.error('verifyLineSignature error', e);
    res.sendStatus(401);
  }
}

async function replyMessage(replyToken, messages) {
  const r = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ replyToken, messages }),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    console.error('[LINE] reply error', r.status, txt);
  }
}

// ช่วงวันนี้ (ตามเวลาเครื่อง)
function startOfDayLocal(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function endOfDayLocal(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}
function dateOnlyLocal(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

/* ---------- health ---------- */
router.get('/', (_req, res) => res.status(200).send('LINE webhook OK'));

/* ---------- webhook ---------- */
router.post('/', verifyLineSignature, async (req, res) => {
  try {
    const events = req.body?.events || [];
    console.log('[LINE] events:', events.length);

    for (const ev of events) {
      if (ev.type !== 'message' || ev.message?.type !== 'text') continue;

      const raw = (ev.message.text || '').trim();
      console.log('[LINE] text:', raw);

      // รองรับ: "EMP001 รับงาน", "EMP001-รับงาน", "emp001 รับงานนี้"
      const m = raw.match(/(emp\d{3,})\s*[-_ ]?\s*(รับงาน|accept)(?:นี้)?/i);
      if (!m) continue;

      const empId = m[1].toUpperCase();
      const sod = startOfDayLocal();
      const eod = endOfDayLocal();

      // งานของ "วันนี้" ที่ยังไม่ complete (ล่าสุด)
      const job = await prisma.jobAssignment.findFirst({
        where: {
          employee_id: empId,
          assigned_date: { gte: sod, lte: eod },
          completed_at: null,
        },
        orderBy: [{ id: 'desc' }],
      });

      if (!job) {
        await replyMessage(ev.replyToken, [
          { type: 'text', text: `ไม่พบนัดหมายงานของวันนี้สำหรับ ${empId}` },
        ]);
        continue;
      }

      // ถ้ารับไปแล้ว -> แจ้งว่าได้รับแล้ว (ไม่พยายาม create DayStatus ซ้ำ ให้แค่อัปเดต)
      if (job.accepted_at) {
        try {
          await prisma.employeeDayStatus.updateMany({
            where: { employee_id: empId, work_date: dateOnlyLocal() },
            data: { status: 'WORKING', source: 'LINE' },
          });
        } catch (edsErr) {
          console.error('[EDS] ensure working (already-accepted) failed:', edsErr);
        }

        await replyMessage(ev.replyToken, [
          { type: 'text', text: `${empId} ได้รับงานไปแล้ว กรุณาเคลียร์งานให้เสร็จหรือแจ้งหัวหน้า` },
          { type: 'text', text: `วันนี้: งาน: ${job.job_description}` },
        ]);
        continue;
      }

      // ยังไม่ได้รับ -> mark accept
      const updated = await prisma.jobAssignment.update({
        where: { id: job.id },
        data: { accepted_at: new Date() },
      });

      // เซ็ต DayStatus = WORKING อย่างปลอดภัย:
      // 1) อัปเดตก่อน
      const upd = await prisma.employeeDayStatus.updateMany({
        where: { employee_id: empId, work_date: dateOnlyLocal() },
        data: { status: 'WORKING', source: 'LINE' },
      });
      // 2) ถ้าไม่มี record ให้สร้างแบบกันชนซ้ำ
      if (upd.count === 0) {
        try {
          await prisma.employeeDayStatus.createMany({
            data: [{
              employee_id: empId,
              work_date: dateOnlyLocal(),
              status: 'WORKING',
              source: 'LINE',
            }],
            skipDuplicates: true,
          });
        } catch (edsErr) {
          console.error('[EDS] createMany failed (will ignore):', edsErr);
        }
      }

      // ข้อความยืนยัน + ชื่อพนักงาน
      const emp = await prisma.employee.findUnique({
        where: { id: empId },
        select: { name: true },
      });
      const label = emp?.name ? `${empId} (${emp.name})` : empId;

      await replyMessage(ev.replyToken, [
        { type: 'text', text: `${label} ยืนยันรับงานแล้ว ` },
        { type: 'text', text: `วันนี้: งาน: ${updated.job_description}` },
      ]);
    }

    res.sendStatus(200);
  } catch (e) {
    console.error('Webhook error', e);
    res.sendStatus(200); // ให้ LINE ไม่รีทรายถี่ ๆ
  }
});

export default router;
