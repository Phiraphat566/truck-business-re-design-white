// backend/utils/date.js

const pad2 = (n) => String(n).padStart(2, '0');

/** คืน 'YYYY-MM-DD' (ตาม UTC) จากค่า Date/ISOString */
export function ymdUTC(dateLike) {
  const d = new Date(dateLike);
  return d.toISOString().slice(0, 10);
}

/** รับ 'YYYY-MM-DD' แล้วคืน Date เวลา 00:00:00.000Z (UTC) */
export function normalizeYMDToUTC(ymd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd))) {
    throw new Error(`normalizeYMDToUTC invalid input: ${ymd}`);
  }
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
  const end   = new Date(Date.UTC(y, m, 1)); // exclusive
  return { start, end };
}

/**
 * แปลงเวลาจาก DB -> 'HH:mm'
 * แสดงผล “ตามโซน Asia/Bangkok” เสมอ เพื่อไม่ให้เพี้ยนเป็น 02:00
 * (เก็บใน DB เป็น UTC ได้ปกติ)
 */
export function hhmmFromDB(val) {
  if (!val) return '';
  const dt = new Date(val);
  const fmt = new Intl.DateTimeFormat('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Bangkok',
  });
  return fmt.format(dt);
}

/** คีย์มาตรฐาน 'empId#YYYY-MM-DD' */
export function empDayKey(empId, ymd) {
  return `${empId}#${ymd}`;
}
