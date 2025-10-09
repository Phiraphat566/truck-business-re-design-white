// backend/controllers/lineWebhookController.js
import { acceptLatestForEmployee } from './jobAssignmentController.js';

export const handleLineWebhook = async (req, res) => {
  try {
    const events = req.body?.events || [];
    for (const ev of events) {
      const text = ev.message?.text?.trim();
      if (!text) continue;

      // รูปแบบ EMP001-รับงาน
      const mt = /^([A-Za-z]{3}\d{3})[-_](รับงาน|ACCEPT)$/i.exec(text);
      if (mt) {
        const employeeId = mt[1].toUpperCase();
        // reuse controller logic
        req.body = { employeeId }; // mock body
        await acceptLatestForEmployee(req, res);
        return;
      }
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(200).json({ ok: true }); // อย่าให้ LINE timeout
  }
};
