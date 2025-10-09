// backend/services/dayStatus.js
import { PrismaClient, DayStatus, DaySource } from '@prisma/client';
import { normalizeYMDToUTC, dayRangeUTC, ymdUTC } from '../utils/date.js';

const prisma = new PrismaClient();

// ปรับตามจริงได้ (ตัวอย่างนี้: อาทิตย์เป็นวันหยุด)
function isWorkingDay(utcMidnightDate) {
  const dow = utcMidnightDate.getUTCDay(); // 0=Sun
  return dow !== 0;
}

// คืนสแนปชอตสถานะของวันนั้น (ไม่เขียน DB)
export async function computeSnapshot(employeeId, ymd) {
  const wd = normalizeYMDToUTC(ymd);
  const { start, end } = dayRangeUTC(ymd);

  // 1) ถ้ามี MANUAL อยู่แล้ว ให้คงผลเดิม
  const manual = await prisma.employeeDayStatus.findUnique({
    where: { employee_id_work_date: { employee_id: employeeId, work_date: wd } },
    select: { status: true, source: true, arrival_detail: true },
  });
  if (manual?.source === DaySource.MANUAL) {
    return { status: manual.status, source: DaySource.MANUAL, arrival_detail: manual.arrival_detail ?? null };
  }

  // 2) LEAVE?
  const leave = await prisma.leaveRequest.findFirst({
    where: { employee_id: employeeId, leave_date: { gte: start, lt: end } },
    select: { leave_id: true },
  });
  if (leave) return { status: DayStatus.ON_LEAVE, source: DaySource.LEAVE, arrival_detail: null };

  // 3) ATTENDANCE?
  const att = await prisma.attendance.findFirst({
    where: { employee_id: employeeId, work_date: { gte: start, lt: end } },
    orderBy: { check_in: 'asc' },
    select: { check_out: true, status: true }, // status = ON_TIME | LATE
  });
  if (att) {
    return {
      status: att.check_out ? DayStatus.OFF_DUTY : DayStatus.WORKING,
      source: DaySource.ATTENDANCE,
      arrival_detail: att.status,
    };
  }

  // 4) SYSTEM กรณีวันหยุด/ย้อนหลัง/วันนี้
  const nowYmd = ymdUTC(new Date());
  if (!isWorkingDay(wd)) return { status: DayStatus.OFF_DUTY, source: DaySource.SYSTEM, arrival_detail: null };
  if (ymd < nowYmd)     return { status: DayStatus.ABSENT,   source: DaySource.SYSTEM, arrival_detail: null };
  return { status: DayStatus.NOT_CHECKED_IN, source: DaySource.SYSTEM, arrival_detail: null };
}

// คำนวณใหม่และ upsert ใส่ EDS (เคารพ MANUAL)
export async function recomputeAndUpsertEDS(employeeId, ymd, { force = false } = {}) {
  const wd = normalizeYMDToUTC(ymd);

  const cur = await prisma.employeeDayStatus.findUnique({
    where: { employee_id_work_date: { employee_id: employeeId, work_date: wd } },
    select: { source: true },
  });
  if (cur?.source === DaySource.MANUAL && !force) return; // อย่าทับ MANUAL

  const snap = await computeSnapshot(employeeId, ymd);

  await prisma.employeeDayStatus.upsert({
    where: { employee_id_work_date: { employee_id: employeeId, work_date: wd } },
    create: {
      employee_id: employeeId,
      work_date: wd,
      status: snap.status,
      source: snap.source,
      arrival_detail: snap.arrival_detail ?? null,
    },
    update: {
      status: snap.status,
      source: snap.source,
      arrival_detail: snap.arrival_detail ?? null,
      updated_at: new Date(),
    },
  });
}
