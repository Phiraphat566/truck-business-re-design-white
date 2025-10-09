// server.js
import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';

// routes (ของเดิม)
import employeeRoutes from './routes/employeeRoutes.js';
import attendanceRoutes from './routes/attendanceRoutes.js';
import jobAssignmentRoutes from './routes/jobAssignmentRoutes.js';
import employeeMonthlySummaryRoutes from './routes/employeeMonthlySummaryRoutes.js';
import travelCostRoutes from './routes/travelCostRoutes.js';
import tripRoutes from './routes/tripRoutes.js';
import incomeRoutes from './routes/incomeRoutes.js';
import employeeDayStatusRoutes from './routes/employeeDayStatusRoutes.js';
import workYearRoutes from './routes/workYearRoutes.js';
import leaveRequestRoutes from './routes/leaveRequestRoutes.js';
import financeRoutes from './routes/financeRoutes.js';
import invoiceRoutes from './routes/invoiceRoutes.js';
import invoiceYearRoutes from './routes/invoiceYearRoutes.js';
import incomeYearRoutes from './routes/incomeYearRoutes.js';

import lineWebhookRoutes from './routes/lineWebhookRoutes.js';

// routes (LINE, งานที่ได้รับมอบหมาย)
import lineTaskRoutes from './routes/lineTaskRoutes.js';
import employeeCallRoutes from './routes/employeeCallRoutes.js';



// routes (รถ/น้ำมัน/ระยะทาง)
import truckRoutes from './routes/truckRoutes.js';
import fuelLogRoutes from './routes/fuelLogRoutes.js';
import truckDistanceRoutes from './routes/truckDistanceRoutes.js';

import truckExpenseRoutes from './routes/truckExpenseRoutes.js';

// routes (เงินเดือน)
import payrollRoutes from './routes/payrollRoutes.js';

import financeMonthlySummaryRoutes from './routes/financeMonthlySummaryRoutes.js';

import dashboardRoutes from './routes/dashboardRoutes.js';

import authRoutes from './routes/authRoutes.js';

import staffAdminRoutes from './routes/staffAdminRoutes.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// __dirname (ESM)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ให้เสิร์ฟไฟล์อัปโหลด
const UPLOADS_DIR = path.join(__dirname, 'uploads');
app.use('/uploads', express.static(UPLOADS_DIR));

/* ---------------------- Register Routes ---------------------- */
app.use('/api/employees', employeeRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/job-assignments', jobAssignmentRoutes);
app.use('/api/employee-monthly-summaries', employeeMonthlySummaryRoutes);
app.use('/api/travel-costs', travelCostRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/incomes', incomeRoutes);
app.use('/api/income', incomeRoutes); // backward-compat
app.use('/api/employee-day-status', employeeDayStatusRoutes);
app.use('/api/work-years', workYearRoutes);
app.use('/api/leaves', leaveRequestRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/invoice-years', invoiceYearRoutes);
app.use('/api/income-years', incomeYearRoutes);

// กลุ่มรถ/น้ำมัน/ระยะทาง (prefix /api)
app.use('/api', truckRoutes);
app.use('/api', fuelLogRoutes);
app.use('/api', truckDistanceRoutes);

//บันทึกค่าใช้จ่ายรถ
app.use('/api', truckExpenseRoutes);

// กลุ่ม LINE + งานที่ได้รับมอบหมาย
app.use('/api/line', lineTaskRoutes);
app.use('/api/employee-calls', employeeCallRoutes);

// กลุ่ม LINE Webhook (prefix /api/line/webhook)
app.use('/api/line/webhook', express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; }   // เก็บ raw body ไว้ตรวจลายเซ็น
}));
app.use('/api/line/webhook', lineWebhookRoutes);

// กลุ่มเงินเดือน
app.use('/api/payroll', payrollRoutes);


app.use('/api/finance', financeMonthlySummaryRoutes);

app.use('/api/dashboard', dashboardRoutes);

app.use('/api/auth', authRoutes);

app.use('/api/staff', staffAdminRoutes);


app.get('/api/line/webhook/ping', (_req, res) => res.send('ok'));
/* ---------------------- Health check ---------------------- */
app.get('/health', (_req, res) => res.send('ok'));

/* ---------------------- Error handler (Prisma-friendly) ---------------------- */
app.use((err, _req, res, _next) => {
  console.error(err);

  // กันซ้ำจาก unique constraint เช่น (truck_id, date, round_number)
  if (err.code === 'P2002') {
    return res.status(409).json({
      message: 'ข้อมูลซ้ำ (unique constraint)',
      meta: err.meta,
    });
  }

  // not found จาก Prisma
  if (err.code === 'P2025') {
    return res.status(404).json({ message: 'ไม่พบข้อมูลที่ต้องการแก้ไข/ลบ' });
  }

  res.status(500).json({ message: err.message || 'Internal Server Error' });
});

/* ---------------------- Start ---------------------- */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
