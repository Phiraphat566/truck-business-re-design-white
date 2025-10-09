import { Component, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

/** สถานะจากระบบ (สำหรับตาราง/ข้อมูล) */
type Status = 'ON_TIME' | 'LATE' | 'LEAVE' | 'ABSENT';
/** สถานะสำหรับแสดงผลในปฏิทิน (เพิ่ม HOLIDAY) */
type UiStatus = Status | 'HOLIDAY';

type YearRow = { year: number; monthsCount: number };

type DayRow = {
  date: string; // 'YYYY-MM-DD'
  rows: {
    employee_id: string;
    employee_name: string;
    check_in?: string;
    check_out?: string;
    status?: Status;
    note?: string;
  }[];
};

type ApiSummary = {
  headStats: { people: number; ontimePct: number; latePct: number; absentPct: number };
  days: DayRow[];
};

@Component({
  standalone: true,
  selector: 'app-time-in-out',
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './time-in-out.component.html',
})
export class TimeInOutComponent implements OnInit {
  /* ================== CONFIG สำหรับปฏิทิน ================== */
  private readonly sundayIsHoliday = true;
  private readonly markMissingAsAbsentInCalendar = false;

  /* ================== Modal header ================== */
  modalYear = 0;
  modalMonthIndex = 0; // 0..11

  // แปลง 'YYYY-MM-DD' → 'dd/MM/yy'
  formatYMD(ymd: string) {
    const [Y, M, D] = ymd.split('-');
    return `${D}/${M}/${Y.slice(2)}`;
  }

  /* ================== Theme ================== */
  isDark = localStorage.getItem('theme') === 'dark';
  private applyTheme() {
    document.documentElement.classList.toggle('dark', this.isDark);
    localStorage.setItem('theme', this.isDark ? 'dark' : 'light');
  }
  toggleTheme() { this.isDark = !this.isDark; this.applyTheme(); }

  /* ================== View ================== */
  view: 'year' | 'month' = 'year';

  /* ================== Year list ================== */
  years: YearRow[] = [];
  loadingYears = false;

  /* ================== Month dashboard ================== */
  year = new Date().getFullYear();
  months = [
    'มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
    'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'
  ];
  selectedMonthIndex = 0; // 0..11

  searchText = '';
  filterScope: 'all' | 'ontime' | 'late' | 'leave' | 'absent' = 'all';

  // 🔎 ฟิลเตอร์เพิ่ม: วันเดียว + เฉพาะแถวที่มีข้อมูลจริง
  filterDate: string | null = null;  // 'YYYY-MM-DD' จาก <input type="date">
  onlyWithData = false;
  clearDayFilter() {
    this.filterDate = null;
    this.onlyWithData = false;
  }

  headStats = signal({ people: 0, ontimePct: 0, latePct: 0, absentPct: 0 });
  days: DayRow[] = [];
  loadingMonth = false;
  errorMsg = signal<string | null>(null);

  /* ================== Employee modal ================== */
  modalOpen = signal(false);
  modalEmp  = signal<{ id: string; name: string } | null>(null);
  weeks: { day: number | null; status?: UiStatus; timeIn?: string }[][] = [];
  loadingHistory = false;

  /* ================== Cache ================== */
  private monthCache = new Map<string, ApiSummary>(); // key: `${year}-${monthNumber}`

  /* ================== Accordion state ================== */
  openDays = new Set<string>(); // เก็บ YMD ของวันทีเปิดอยู่

  constructor(private http: HttpClient) {}
  ngOnInit() {
    this.applyTheme();
    this.loadYears();
  }

  /* ================== API base ================== */
  private attendanceApi = '/api/attendance';
  private workYearApi   = '/api/work-years';

  /* ================== WorkYear ================== */
  async loadYears() {
    this.loadingYears = true;
    this.errorMsg.set(null);
    try {
      const res = await firstValueFrom(this.http.get<YearRow[]>(`${this.workYearApi}`));
      this.years = res ?? [];
      if (this.years.length) {
        this.openYear(this.years[0].year);
      } else {
        this.view = 'year';
      }
    } catch (e) {
      console.error('[loadYears]', e);
      this.errorMsg.set('โหลดรายการปีไม่สำเร็จ');
    } finally {
      this.loadingYears = false;
    }
  }

  async addYear() {
    this.errorMsg.set(null);
    try {
      const nextYear = (this.years[0]?.year ?? new Date().getFullYear()) + 1;
      await firstValueFrom(
        this.http.post<{ year:number; monthsCount:number }>(`${this.workYearApi}`, { year: nextYear })
      );
      await this.loadYears();
      this.view = 'year';
    } catch (e) {
      console.error('[addYear]', e);
      this.errorMsg.set('เพิ่มปีใหม่ไม่สำเร็จ');
    }
  }

  /* ================== Month ================== */
  openYear(y: number) {
    if (this.modalOpen()) this.closeModal();
    this.year = y;
    this.view = 'month';
    this.selectedMonthIndex = 0;

    // ล้าง cache แล้วบังคับโหลด ม.ค. ของปีนั้น
    this.monthCache.clear();
    this.headStats.set({ people: 0, ontimePct: 0, latePct: 0, absentPct: 0 });
    this.days = [];
    this.loadMonth(true);
  }

  resetToYear() {
    if (this.modalOpen()) this.closeModal();
    this.view = 'year';
  }

  async loadMonth(force = false) {
    this.loadingMonth = true;
    this.errorMsg.set(null);
    try {
      const monthNumber = Number(this.selectedMonthIndex) + 1; // 1..12
      const cacheKey = `${this.year}-${monthNumber}`;

      if (!force && this.monthCache.has(cacheKey)) {
        const cached = this.monthCache.get(cacheKey)!;
        this.headStats.set(cached.headStats);
        this.days = cached.days;
      } else {
        const res = await firstValueFrom(
          this.http.get<ApiSummary>(`${this.attendanceApi}/summary`, {
            params: { year: String(this.year), month: String(monthNumber) }
          })
        );

        const summary: ApiSummary = {
          headStats: res?.headStats ?? { people: 0, ontimePct: 0, latePct: 0, absentPct: 0 },
          days: res?.days ?? [],
        };

        this.monthCache.set(cacheKey, summary);
        this.headStats.set(summary.headStats);
        this.days = summary.days;
      }
    } catch (e) {
      console.error('[loadMonth]', e);
      this.errorMsg.set('โหลดข้อมูลเดือนนี้ไม่สำเร็จ');
      this.headStats.set({ people: 0, ontimePct: 0, latePct: 0, absentPct: 0 });
      this.days = [];
    } finally {
      this.loadingMonth = false;

      // โฟกัสเปิด “วันนี้” ถ้าอยู่ในเดือนที่กำลังดู
      const today = this.ymdToday();
      this.openDays.clear();
      if (this.days.some(g => g.date === today)) {
        this.openDays.add(today);
      }
    }
  }

  async refreshMonth() {
    const monthNumber = Number(this.selectedMonthIndex) + 1;
    this.monthCache.delete(`${this.year}-${monthNumber}`);
    await this.loadMonth(true);
  }

  async prevMonth() {
    if (this.modalOpen()) this.closeModal();
    if (this.selectedMonthIndex === 0) {
      this.year -= 1;
      this.selectedMonthIndex = 11;
    } else {
      this.selectedMonthIndex -= 1;
    }
    await this.loadMonth(true); // force
  }

  async nextMonth() {
    if (this.modalOpen()) this.closeModal();
    if (this.selectedMonthIndex === 11) {
      this.year += 1;
      this.selectedMonthIndex = 0;
    } else {
      this.selectedMonthIndex += 1;
    }
    await this.loadMonth(true); // force
  }

  async onChangeMonth() {
    if (this.modalOpen()) this.closeModal();
    await this.loadMonth(true); // force
  }

  /* ================== Filtering (ตารางรายวัน) ================== */
  filteredDays(): DayRow[] {
    const s = this.searchText.trim().toLowerCase();
    const scope = this.filterScope;
    const byDate = this.filterDate; // ถ้ามีให้แสดงเฉพาะวันนั้น

    return this.days
      .filter(g => !byDate || g.date === byDate)
      .map(g => {
        // กรองชื่อ + สถานะ
        let rows = g.rows.filter(r => {
          const nameOk  = !s || r.employee_name.toLowerCase().includes(s);
          const scopeOk =
            scope === 'all' ||
            (scope === 'ontime' && r.status === 'ON_TIME') ||
            (scope === 'late'   && r.status === 'LATE')   ||
            (scope === 'leave'  && r.status === 'LEAVE')  ||
            (scope === 'absent' && r.status === 'ABSENT');
          return nameOk && scopeOk;
        });

        // ถ้า “เฉพาะวันที่มีข้อมูล” ให้คงเฉพาะแถวที่มีสถานะ/เวลา/หมายเหตุจริง
        if (this.onlyWithData) {
          rows = rows.filter(r => !!(r.status || r.check_in || r.check_out || r.note));
        }

        return { date: g.date, rows };
      })
      .filter(g => g.rows.length > 0); // ตัดวันว่างออก
  }

  /* ================== Badge สีในตารางรายวัน ================== */
  badgeClass(s?: Status) {
    return {
      'ON_TIME': 'bg-emerald-600/15 text-emerald-400 border border-emerald-500/30',
      'LATE':    'bg-orange-600/15  text-orange-400  border border-orange-500/30',
      'LEAVE':   'bg-amber-600/15   text-amber-400   border border-amber-500/30',
      'ABSENT':  'bg-rose-600/15    text-rose-400    border border-rose-500/30',
    }[s as Status] ?? '';
  }

  /* ================== Employee modal ================== */
  async openEmpHistory(empId: string, empName: string) {
    this.modalOpen.set(true);
    this.loadingHistory = true;

    // ล็อกเดือน/ปีปัจจุบันไว้ให้ modal
    const lockedYear = this.year;
    const lockedMonthIndex = this.selectedMonthIndex;

    try {
      const res = await firstValueFrom(
        this.http.get<{
          employee:{id:string;name:string},
          days:{day:number;status?:Status;timeIn?:string;note?:string}[]
        }>(
          `${this.attendanceApi}/employee-history`,
          { params: { empId, year: lockedYear, month: lockedMonthIndex + 1 } }
        )
      );

      this.modalEmp.set(res.employee);
      this.modalYear = lockedYear;
      this.modalMonthIndex = lockedMonthIndex;

      this.weeks = this.buildCalendarGrid(res.days || [], lockedYear, lockedMonthIndex);
    } catch (e) {
      console.error('[openEmpHistory]', e);
      this.modalYear = lockedYear;
      this.modalMonthIndex = lockedMonthIndex;
      this.weeks = this.buildCalendarGrid([], lockedYear, lockedMonthIndex);
    } finally {
      this.loadingHistory = false;
    }
  }

  closeModal() { this.modalOpen.set(false); this.modalEmp.set(null); }

  /* ================== Calendar grid (ใส่วันหยุด + ขาดอัตโนมัติ) ================== */
  private buildCalendarGrid(
    days: {day:number;status?:Status;timeIn?:string}[],
    year: number,
    monthIndex: number // 0..11
  ) {
    const first = new Date(year, monthIndex, 1);
    const startWeekday = (first.getDay() + 6) % 7; // แปลงให้ จันทร์=0
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

    // map เร็ว ๆ: day -> info
    const byDay = new Map<number, { status?: Status; timeIn?: string }>();
    for (const d of days) byDay.set(d.day, { status: d.status, timeIn: d.timeIn });

    const grid: { day: number | null; status?: UiStatus; timeIn?: string }[][] = [];
    let cursor = 1 - startWeekday;

    const today = new Date();
    const monthIsPastOrCurrent =
      year < today.getFullYear() ||
      (year === today.getFullYear() && monthIndex <= today.getMonth());

    for (let w = 0; w < 6; w++) {
      const row: Array<{ day: number | null; status?: UiStatus; timeIn?: string }> = [];
      for (let d = 0; d < 7; d++, cursor++) {
        if (cursor < 1 || cursor > daysInMonth) {
          row.push({ day: null });
          continue;
        }

        const info = byDay.get(cursor);
        const dateObj = new Date(year, monthIndex, cursor);
        const isSunday = dateObj.getDay() === 0;

        if (info?.status) {
          // มีสถานะจาก API → แสดงตามจริง (LEAVE/ABSENT/ON_TIME/LATE)
          row.push({ day: cursor, status: info.status, timeIn: info.timeIn });
          continue;
        }

        // ไม่มีสถานะจาก API
        if (this.sundayIsHoliday && isSunday) {
          // วันอาทิตย์ → แสดง "หยุด"
          row.push({ day: cursor, status: 'HOLIDAY' });
          continue;
        }

        // ถ้าเป็นอดีตหรือเดือนปัจจุบัน และตั้งค่าให้ตีความว่าไม่มีข้อมูล = ขาด
        if (this.markMissingAsAbsentInCalendar && monthIsPastOrCurrent) {
          const isFutureDay =
            year === today.getFullYear() &&
            monthIndex === today.getMonth() &&
            cursor > today.getDate();
          if (!isFutureDay) {
            row.push({ day: cursor, status: 'ABSENT' });
            continue;
          }
        }

        // ปล่อยว่าง (อนาคต หรือไม่ต้องการตีความ)
        row.push({ day: cursor });
      }
      grid.push(row);
    }
    return grid;
  }

  /* ================== สี/ข้อความสำหรับปฏิทิน ================== */
  pillClass(s?: UiStatus) {
    const map: Record<UiStatus, string> = {
      'ON_TIME': 'bg-emerald-500/15 border border-emerald-400/30',
      'LATE':    'bg-orange-500/15  border border-orange-400/30',
      'LEAVE':   'bg-amber-500/15   border border-amber-400/30',
      'ABSENT':  'bg-rose-500/15    border border-rose-400/30',
      'HOLIDAY': 'bg-sky-500/15     border border-sky-400/30',
    } as const;
    return s ? map[s] : '';
  }

  statusText(s?: UiStatus, t?: string) {
    if (s === 'ON_TIME') return `${t ?? '-'} · ตรงเวลา`;
    if (s === 'LATE')    return `${t ?? '-'} · มาสาย`;
    if (s === 'LEAVE')   return 'ลา';
    if (s === 'ABSENT')  return 'ขาด';
    if (s === 'HOLIDAY') return 'หยุด';
    return '-';
  }

  /* ================== Accordion helpers ================== */
  toggleDay(ymd: string) {
    if (this.openDays.has(ymd)) this.openDays.delete(ymd);
    else this.openDays.add(ymd);
  }
  isOpen(ymd: string) { return this.openDays.has(ymd); }

  expandAll() {
    // เปิดเฉพาะวันที่ผ่านฟิลเตอร์แล้ว (รวมฟิลเตอร์วัน/onlyWithData)
    this.openDays = new Set(this.filteredDays().map(g => g.date));
  }
  collapseAll() {
    this.openDays.clear();
  }

  private ymdToday() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }


  // ตรวจว่าวันที่เป็นวันอาทิตย์ไหม (รับ 'YYYY-MM-DD')
private isSundayYmd(ymd: string): boolean {
  const [Y, M, D] = ymd.split('-').map(Number);
  return new Date(Y, M - 1, D).getDay() === 0;
}

// เลือกคลาสสำหรับ badge ใน "ตารางด้านนอก"
badgeClassTable(dateYmd: string, r: { status?: Status; check_in?: string; check_out?: string }) {
  const isHoliday = this.sundayIsHoliday && this.isSundayYmd(dateYmd) && !r.check_in && !r.check_out;
  if (isHoliday) {
    // โทนฟ้าเหมือนใน modal
    return 'bg-sky-600/15 text-sky-400 border border-sky-500/30';
  }
  return this.badgeClass(r.status);
}

// เลือกข้อความสำหรับ badge ใน "ตารางด้านนอก"
statusTextTable(dateYmd: string, r: { status?: Status; check_in?: string; check_out?: string }) {
  const isHoliday = this.sundayIsHoliday && this.isSundayYmd(dateYmd) && !r.check_in && !r.check_out;
  if (isHoliday) return 'หยุด';

  return r.status
    ? (r.status === 'ON_TIME' ? 'ตรงเวลา'
      : r.status === 'LATE'   ? 'มาสาย'
      : r.status === 'LEAVE'  ? 'ลา'
      : 'ขาดงาน')
    : 'ยังไม่มีข้อมูล';
}

}
