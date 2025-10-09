// backend/routes/lineWebhookRoutes.js
import express from 'express';
import crypto from 'crypto';
import fetch from 'node-fetch'; // ถ้าใช้ Node 18+ ที่มี global fetch แล้ว จะถอดก็ได้
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

const CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET || '';

/* ---------- utils ---------- */
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

function startOfDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function endOfDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}
function dateOnly(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

/* ---------- health (ให้กด Verify ได้ 200) ---------- */
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

      /* === มุกเอ็มบัปเป้ (เช็คก่อนอย่างอื่น) === 
      const MBAPPE_RE = /(บองชู้กำมอง|บองชู้|ตะเลวู้|ว่าไงคับผมเอ็มบัปเป้)/i;
      if (MBAPPE_RE.test(raw)) {
        await replyMessage(ev.replyToken, [
          { type: 'text', text: 'ว่าไงคับผมเอ็มบัปเป้' },
        ]);
        continue; // จบเคสนี้เลย
      }*/

      // รูปแบบ: "EMP001-รับงาน", "emp001 รับงาน", "emp001 รับงานนี้"
      const m = raw.match(/(emp\d{3,})\s*[- ]?\s*รับงาน(?:นี้)?/i);
      if (!m) continue;

      const empId = m[1].toUpperCase();
      const sod = startOfDay(new Date());
      const eod = endOfDay(new Date());

      // หา "งานของวันนี้" (อันล่าสุด)
      const job = await prisma.jobAssignment.findFirst({
        where: { employee_id: empId, assigned_date: { gte: sod, lte: eod } },
        orderBy: { assigned_date: 'desc' }, // ไม่มี created_at ในโมเดลนี้
      });

      if (!job) {
        await replyMessage(ev.replyToken, [
          { type: 'text', text: `ไม่พบนัดหมายงานของวันนี้สำหรับ ${empId}` },
        ]);
        continue;
      }

      // ตีตรารับงาน (ถ้ายัง)
      if (!job.accepted_at) {
        await prisma.jobAssignment.update({
          where: { id: job.id },
          data: { accepted_at: new Date() },
        });
      }

      // อัปเดตสถานะวันนี้เป็น WORKING (หลีกเลี่ยง upsert -> ใช้ findUnique + update/create)
      try {
        const key = { employee_id_work_date: { employee_id: empId, work_date: dateOnly(new Date()) } };
        const exists = await prisma.employeeDayStatus.findUnique({ where: key });
        if (exists) {
          await prisma.employeeDayStatus.update({
            where: key,
            data: { status: 'WORKING', source: 'MANUAL' }, // ใช้ค่าใน enum DaySource ที่มีจริง
          });
        } else {
          await prisma.employeeDayStatus.create({
            data: {
              employee_id: empId,
              work_date: dateOnly(new Date()),
              status: 'WORKING',
              source: 'MANUAL',
            },
          });
        }
      } catch (edsErr) {
        // ไม่ให้ล้มจนไม่ได้ตอบ LINE
        console.error('[EDS] write failed:', edsErr);
      }

      // ตอบกลับพร้อมชื่อพนักงาน
      const emp = await prisma.employee.findUnique({
        where: { id: empId },
        select: { name: true },
      });
      const label = emp?.name ? `${empId} (${emp.name})` : empId;

      await replyMessage(ev.replyToken, [
        { type: 'text', text: `${label} ยืนยันการรับงานแล้ว` },
        { type: 'text', text: `วันนี้: ${job.job_description}` },
      ]);
    }

    // ต้องตอบ 200 เสมอให้ LINE ไม่รีเทรย์
    res.sendStatus(200);
  } catch (e) {
    console.error('Webhook error', e);
    // ป้องกัน LINE รีเทรย์ถี่ ๆ
    res.sendStatus(200);
  }
});

export default router;
