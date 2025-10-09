// backend/utils/date.js

const pad2 = (n) => String(n).padStart(2, '0');

/** คืน 'YYYY-MM-DD' โดยอิงวัน/เดือน/ปีแบบ UTC (กันเพี้ยนข้ามโซนเวลา) */
export function ymdUTC(dateLike) {
  const d = new Date(dateLike);
  const y = d.getUTCFullYear();
  const m = pad2(d.getUTCMonth() + 1);
  const dd = pad2(d.getUTCDate());
  return `${y}-${m}-${dd}`;
}

/** รับ 'YYYY-MM-DD' แล้วคืน Date เวลา 00:00:00 (UTC) */
export function normalizeYMDToUTC(ymd) {
  const m = /^\d{4}-\d{2}-\d{2}$/.exec(String(ymd));
  if (!m) throw new Error(`normalizeYMDToUTC invalid input: ${ymd}`);
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** ช่วงของวันแบบ [start, end) ใน UTC */
export function dayRangeUTC(ymd) {
  const start = normalizeYMDToUTC(ymd);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

/** ช่วงของเดือนแบบ [start, end) ใน UTC (month = 1..12) */
export function monthRangeUTC(year, month) {
  const y = Number(year), m = Number(month);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
    throw new Error(`monthRangeUTC invalid args year=${year} month=${month}`);
  }
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { start, end };
}

/** แปลง Date จาก DB → 'HH:mm' แบบเวลาโลคอล (ให้ตรงกับเวลาที่หัวหน้ากรอก) */
export function hhmmFromDB(dateLike) {
  const d = new Date(dateLike);
  const hh = pad2(d.getHours());      // ใช้ local hours
  const mm = pad2(d.getMinutes());    // ใช้ local minutes
  return `${hh}:${mm}`;
}

/** คีย์ map มาตรฐาน 'empId#YYYY-MM-DD' */
export function empDayKey(empId, ymd) {
  return `${empId}#${ymd}`;
}
