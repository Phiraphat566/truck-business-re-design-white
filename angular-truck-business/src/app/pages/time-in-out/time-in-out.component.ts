import { Component, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

type Status = 'ON_TIME' | 'LATE' | 'LEAVE' | 'ABSENT';
type UiEditStatus = Status | 'NONE';   // <- เพิ่ม
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

  /* ============ CONFIG ============ */
  private readonly sundayIsHoliday = true;
  private readonly markMissingAsAbsentInCalendar = false;

  /* ============ Modal header ============ */
  modalYear = 0;
  modalMonthIndex = 0; // 0..11

  formatYMD(ymd: string) {
    const [Y, M, D] = ymd.split('-');
    return `${D}/${M}/${Y.slice(2)}`;
  }

  /* ============ View ============ */
  view: 'year' | 'month' = 'year';


  /* ============ Year list ============ */
  years: YearRow[] = [];
  loadingYears = false;

  /* ============ Month dashboard ============ */
  year = new Date().getFullYear();
  months = [
    'มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
    'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'
  ];
  selectedMonthIndex = 0; // 0..11

  searchText = '';
  filterScope: 'all' | 'ontime' | 'late' | 'leave' | 'absent' = 'all';

  filterDate: string | null = null;  // 'YYYY-MM-DD'
  onlyWithData = false;
  clearDayFilter() { this.filterDate = null; this.onlyWithData = false; }

  headStats = signal({ people: 0, ontimePct: 0, latePct: 0, absentPct: 0 });
  days: DayRow[] = [];
  loadingMonth = false;
  errorMsg = signal<string | null>(null);

  /* ============ Employee modal ============ */
  modalOpen = signal(false);
  modalEmp  = signal<{ id: string; name: string } | null>(null);
  weeks: { day: number | null; status?: UiStatus; timeIn?: string }[][] = [];
  loadingHistory = false;

  /* ============ Confirm / Edit modals ============ */
  confirm = {
    open: false,
    mode: 'confirm' as 'confirm' | 'alert',
    title: '',
    message: '',
    okText: '',
    ok: null as null | (() => void),
  };
  openConfirm(title: string, message: string, ok: () => void) {
    this.confirm = { open: true, mode: 'confirm', title, message, okText: 'ตกลง', ok };
  }
  openAlert(title: string, message: string) {
    this.confirm = { open: true, mode: 'alert', title, message, okText: 'ตกลง', ok: () => this.closeConfirm() };
  }
  closeConfirm() { this.confirm.open = false; this.confirm.ok = null; }

edit = {
  open: false,
  id: '' as string | null,
  date: '',
  empId: '',
  empName: '',
  form: { checkIn: '', checkOut: '', status: 'ON_TIME' as UiEditStatus }
};
openEdit(
  dateYmd: string, empId: string, empName?: string,
  id?: string, checkIn?: string, checkOut?: string,
  status?: UiEditStatus
) {
  this.edit.open = true;
  this.edit.date = dateYmd;
  this.edit.empId = empId;
  this.edit.empName = empName || '';
  this.edit.id = id || null;
  this.edit.form.checkIn  = checkIn  || '';
  this.edit.form.checkOut = checkOut || '';
  this.edit.form.status   = status   || 'ON_TIME';
}
  closeEdit() { this.edit.open = false; }

  /* ============ Cache ============ */
  private monthCache = new Map<string, ApiSummary>(); // key: `${year}-${monthNumber}`

  /* ============ Accordion ============ */
  openDays = new Set<string>();

  constructor(private http: HttpClient) {}
  ngOnInit() {
    this.loadYears();
  }

  /* ============ API base ============ */
  private attendanceApi = '/api/attendance';
  private workYearApi   = '/api/work-years';

/* ============ WorkYear ============ */
async loadYears() {
  this.loadingYears = true;
  this.errorMsg.set(null);
  try {
    const res = await firstValueFrom(this.http.get<YearRow[]>(`${this.workYearApi}`));
    this.years = res ?? [];

    // ไม่ต้อง auto-open ปีแรกอีกต่อไป
    // แสดงหน้า "รายปี" เสมอ
    this.view = 'year';
  } catch (e) {
    console.error('[loadYears]', e);
    this.errorMsg.set('โหลดรายการปีไม่สำเร็จ');
    this.view = 'year'; // เผื่อ error ก็ยังอยู่หน้า year
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

  /* ============ Month ============ */
  openYear(y: number) {
    if (this.modalOpen()) this.closeModal();
    this.year = y;
    this.view = 'month';
    this.selectedMonthIndex = 0;

    this.monthCache.clear();
    this.headStats.set({ people: 0, ontimePct: 0, latePct: 0, absentPct: 0 });
    this.days = [];
    this.loadMonth(true);
  }

  resetToYear() { if (this.modalOpen()) this.closeModal(); this.view = 'year'; }

  editMode = false;
  toggleEditMode() { this.editMode = !this.editMode; }

  

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
      const today = this.ymdToday();
      this.openDays.clear();
      if (this.days.some(g => g.date === today)) this.openDays.add(today);
    }
  }

  async refreshMonth() {
    const monthNumber = Number(this.selectedMonthIndex) + 1;
    this.monthCache.delete(`${this.year}-${monthNumber}`);
    await this.loadMonth(true);
  }

  async prevMonth() {
    if (this.modalOpen()) this.closeModal();
    if (this.selectedMonthIndex === 0) { this.year -= 1; this.selectedMonthIndex = 11; }
    else this.selectedMonthIndex -= 1;
    await this.loadMonth(true);
  }

  async nextMonth() {
    if (this.modalOpen()) this.closeModal();
    if (this.selectedMonthIndex === 11) { this.year += 1; this.selectedMonthIndex = 0; }
    else this.selectedMonthIndex += 1;
    await this.loadMonth(true);
  }

  async onChangeMonth() { if (this.modalOpen()) this.closeModal(); await this.loadMonth(true); }

  /* ============ Filtering (ตารางรายวัน) ============ */
  filteredDays(): DayRow[] {
    const s = this.searchText.trim().toLowerCase();
    const scope = this.filterScope;
    const byDate = this.filterDate;

    return this.days
      .filter(g => !byDate || g.date === byDate)
      .map(g => {
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
        if (this.onlyWithData) rows = rows.filter(r => !!(r.status || r.check_in || r.check_out || r.note));
        return { date: g.date, rows };
      })
      .filter(g => g.rows.length > 0);
  }

  /* ============ Badge ============ */
  badgeClass(s?: Status) {
    return {
      'ON_TIME': 'bg-emerald-600/15 text-emerald-400 border border-emerald-500/30',
      'LATE':    'bg-orange-600/15  text-orange-400  border border-orange-500/30',
      'LEAVE':   'bg-amber-600/15   text-amber-400   border border-amber-500/30',
      'ABSENT':  'bg-rose-600/15    text-rose-400    border border-rose-500/30',
    }[s as Status] ?? '';
  }

  async openEmpHistory(empId: string, empName: string) {
    this.modalOpen.set(true);
    this.loadingHistory = true;
    const lockedYear = this.year;
    const lockedMonthIndex = this.selectedMonthIndex;
    try {
      const res = await firstValueFrom(
        this.http.get<{ employee:{id:string;name:string}, days:{day:number;status?:Status;timeIn?:string;note?:string}[] }>(
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

  /* ============ Calendar grid ============ */
  private buildCalendarGrid(
    days: {day:number;status?:Status;timeIn?:string}[],
    year: number,
    monthIndex: number
  ) {
    const first = new Date(year, monthIndex, 1);
    const startWeekday = (first.getDay() + 6) % 7; // จันทร์=0
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

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
        if (cursor < 1 || cursor > daysInMonth) { row.push({ day: null }); continue; }
        const info = byDay.get(cursor);
        const dateObj = new Date(year, monthIndex, cursor);
        const isSunday = dateObj.getDay() === 0;

        if (info?.status) { row.push({ day: cursor, status: info.status, timeIn: info.timeIn }); continue; }
        if (this.sundayIsHoliday && isSunday) { row.push({ day: cursor, status: 'HOLIDAY' }); continue; }

        if (this.markMissingAsAbsentInCalendar && monthIsPastOrCurrent) {
          const isFutureDay =
            year === today.getFullYear() &&
            monthIndex === today.getMonth() &&
            cursor > today.getDate();
          if (!isFutureDay) { row.push({ day: cursor, status: 'ABSENT' }); continue; }
        }
        row.push({ day: cursor });
      }
      grid.push(row);
    }
    return grid;
  }

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

  /* ============ Accordion helpers ============ */
  toggleDay(ymd: string) { if (this.openDays.has(ymd)) this.openDays.delete(ymd); else this.openDays.add(ymd); }
  isOpen(ymd: string) { return this.openDays.has(ymd); }
  expandAll() { this.openDays = new Set(this.filteredDays().map(g => g.date)); }
  collapseAll() { this.openDays.clear(); }
  private ymdToday() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  private isSundayYmd(ymd: string): boolean {
    const [Y, M, D] = ymd.split('-').map(Number);
    return new Date(Y, M - 1, D).getDay() === 0;
  }
  badgeClassTable(dateYmd: string, r: { status?: Status; check_in?: string; check_out?: string }) {
    const isHoliday = this.sundayIsHoliday && this.isSundayYmd(dateYmd) && !r.check_in && !r.check_out;
    if (isHoliday) return 'bg-sky-600/15 text-sky-400 border border-sky-500/30';
    return this.badgeClass(r.status);
  }
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

  /* ============ Edit/Delete actions ============ */

  /**
   * หา Attendance ด้วย employeeId + date
   * ต้องมี endpoint /api/attendance/find-one?employeeId=&date=
   */
  private async findAttendance(empId: string, ymd: string): Promise<null | {
    id: string; employee_id: string; work_date: string; check_in: string | null; check_out: string | null; status: 'ON_TIME'|'LATE'
  }> {
    try {
      return await firstValueFrom(
        this.http.get<any>(`${this.attendanceApi}/find-one`, { params: { employeeId: empId, date: ymd } })
      );
    } catch {
      return null;
    }
  }

async clickEdit(dateYmd: string, empId: string, empName?: string) {
  const row = await this.findAttendance(empId, dateYmd);
  if (!row) {
    this.openEdit(dateYmd, empId, empName || '', undefined, '', '', 'ON_TIME');
    return;
  }

  // ❗ ใช้ hhmm จากแบ็กเอนด์ ไม่ต้อง toHHMMLocal
  const cin  = (row as any).check_in_hhmm  || '';
  const cout = (row as any).check_out_hhmm || '';

  this.openEdit(dateYmd, empId, empName || '', row.id, cin, cout, row.status);
}




  async clickDelete(dateYmd: string, empId: string) {
    const row = await this.findAttendance(empId, dateYmd);
    if (!row) {
      this.openAlert('ไม่มีข้อมูลสำหรับวันนั้น', 'ยังไม่มีบันทึกของพนักงานคนนี้ให้ลบ');
      return;
    }
    this.openConfirm('ลบรายการนี้?', 'คุณต้องการลบการบันทึกของวันดังกล่าวใช่ไหม', async () => {
      this.closeConfirm();
      try {
        await firstValueFrom(this.http.delete(`${this.attendanceApi}/${row.id}`));
        await this.refreshMonth();
        this.openAlert('สำเร็จ', 'ลบข้อมูลเรียบร้อย');
      } catch {
        this.openAlert('ผิดพลาด', 'ลบข้อมูลไม่สำเร็จ');
      }
    });
  }

  private toHHMMLocal(dateStr: string) {
    const d = new Date(dateStr);
    const pad2 = (n: number) => String(n).padStart(2, '0');
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  private toIsoWithOffset(ymd: string, hm: string): string {
  const [Y, M, D] = ymd.split('-').map(Number);
  const [h, m]   = (hm || '00:00').split(':').map(Number);
  const dt = new Date(Y, (M - 1), D, h || 0, m || 0, 0, 0); // เวลาโลคัล

  const pad = (n: number) => String(n).padStart(2, '0');

  // timezone offset ของเครื่อง (นาที “ตะวันออกเป็นบวก”)
  const offMin = -dt.getTimezoneOffset();
  const sign   = offMin >= 0 ? '+' : '-';
  const oh     = Math.floor(Math.abs(offMin) / 60);
  const om     = Math.abs(offMin) % 60;

  return `${Y}-${pad(M)}-${pad(D)}T${pad(h)}:${pad(m)}:00${sign}${pad(oh)}:${pad(om)}`;
}


// แก้ saveEdit ให้รองรับ ABSENT และ NONE
async saveEdit() {
  try {
    const ymd   = this.edit.date;
    const empId = this.edit.empId;

    // 1) ไม่มีข้อมูล -> ลบ Attendance ถ้ามี แล้วมาร์ค EDS เป็น NOT_CHECKED_IN
    if (this.edit.form.status === 'NONE') {
      if (this.edit.id) {
        await firstValueFrom(this.http.delete(`${this.attendanceApi}/${this.edit.id}`));
      }
      await firstValueFrom(this.http.post(`/api/employee-day-status/upsert`, {
        employeeId: empId,
        date: ymd,
        status: 'NOT_CHECKED_IN',   // ให้สรุป/ปฏิทินโชว์ว่าง
      }));
      this.closeEdit();
      await this.refreshMonth();
      this.openAlert('สำเร็จ', 'ตั้งค่าเป็น “ไม่มีข้อมูล” แล้ว');
      return;
    }

    // 2) ขาดงาน -> อัปเดต EDS เป็น ABSENT (ไม่สร้าง Attendance)
    if (this.edit.form.status === 'ABSENT') {
      if (this.edit.id) {
        await firstValueFrom(this.http.delete(`${this.attendanceApi}/${this.edit.id}`));
      }
      await firstValueFrom(this.http.post(`/api/employee-day-status/upsert`, {
        employeeId: empId,
        date: ymd,
        status: 'ABSENT',
      }));
      this.closeEdit();
      await this.refreshMonth();
      this.openAlert('สำเร็จ', 'บันทึกขาดงานแล้ว');
      return;
    }

    // 3) ON_TIME / LATE -> สร้าง/แก้ Attendance เหมือนเดิม
    const payload: any = {
      employeeId: empId,
      workDate: ymd,
      checkIn:  this.edit.form.checkIn  ? this.toIsoWithOffset(ymd, this.edit.form.checkIn)  : undefined,
      checkOut: this.edit.form.checkOut ? this.toIsoWithOffset(ymd, this.edit.form.checkOut) : undefined,
      status: this.edit.form.status,  // 'ON_TIME' | 'LATE'
    };

    if (this.edit.id) {
      await firstValueFrom(this.http.put(`${this.attendanceApi}/${this.edit.id}`, payload));
    } else {
      await firstValueFrom(this.http.post(`${this.attendanceApi}`, {
        ...payload,
        checkIn: payload.checkIn || this.toIsoWithOffset(ymd, '09:00'),
      }));
    }

    this.closeEdit();
    await this.refreshMonth();
    this.openAlert('สำเร็จ', 'บันทึกข้อมูลเรียบร้อย');
  } catch (e) {
    console.error('[saveEdit]', e);
    this.openAlert('ผิดพลาด', 'บันทึกไม่สำเร็จ');
  }
}

}