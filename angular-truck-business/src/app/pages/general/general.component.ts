import { Component, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule, NgIf, NgFor, NgClass } from '@angular/common';
import { HttpClient, HttpClientModule, HttpParams } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { NgChartsModule } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';

type AttendanceDay = {
  date: string; working: number; present: number; onTime: number; late: number; leave: number; absent: number;
};
type RangeMode = 'month' | 'year';

@Component({
  standalone: true,
  selector: 'app-general',
  templateUrl: './general.component.html',
  styleUrls: ['./general.component.css'],
  imports: [RouterModule, NgIf, NgFor, NgClass, HttpClientModule, NgChartsModule, FormsModule, CommonModule]
})
export class GeneralComponent implements OnInit {
  constructor(private http: HttpClient) {}

  // ===== Theme =====
  isDark = localStorage.getItem('isDark') === '1';
  toggleTheme() { this.isDark = !this.isDark; localStorage.setItem('isDark', this.isDark ? '1' : '0'); }

  // ===== ช่วงเวลา =====
  rangeMode: RangeMode = (localStorage.getItem('genRangeMode') as RangeMode) || 'month';
  months = [
    { value: 1, label: 'ม.ค.' }, { value: 2, label: 'ก.พ.' }, { value: 3, label: 'มี.ค.' },
    { value: 4, label: 'เม.ย.' }, { value: 5, label: 'พ.ค.' }, { value: 6, label: 'มิ.ย.' },
    { value: 7, label: 'ก.ค.' }, { value: 8, label: 'ส.ค.' }, { value: 9, label: 'ก.ย.' },
    { value: 10, label: 'ต.ค.' }, { value: 11, label: 'พ.ย.' }, { value: 12, label: 'ธ.ค.' },
  ];
  selectedMonth = Number(localStorage.getItem('genMonth')) || (new Date().getMonth() + 1);
  selectedYear  = Number(localStorage.getItem('genYear'))  || new Date().getFullYear();
  yearList: number[] = [];

  // ===== เป้าหมายรายได้ =====
  editingTarget = false;
  editTargetValue: number | null = null;
  targetMonth = Number(localStorage.getItem('revTargetMonth')) || 10_000_000;
  targetYear  = Number(localStorage.getItem('revTargetYear'))  || 120_000_000;
  get target(): number { return this.rangeMode === 'month' ? this.targetMonth : this.targetYear; }
  get achievedAmount(): number { return Math.round(this.target * (this.incomeProgressValue / 100)); }
  startEditTarget() { this.editingTarget = true; this.editTargetValue = this.target; }
  saveTarget() {
    const v = Math.max(0, Math.floor(Number(this.editTargetValue || 0)));
    if (this.rangeMode === 'month') { this.targetMonth = v; localStorage.setItem('revTargetMonth', String(v)); }
    else { this.targetYear = v; localStorage.setItem('revTargetYear', String(v)); }
    this.editingTarget = false; this.recalcDonutFromActual();
  }
  cancelEditTarget() { this.editingTarget = false; this.editTargetValue = null; }

  // ===== KPI ที่ดึงจริง =====
  incomeMonthly:  number[] = Array(12).fill(0);
  expenseMonthly: number[] = Array(12).fill(0);
  payrollMonthly: number[] = Array(12).fill(0);   // <--- เพิ่มอาร์เรย์เงินเดือน
  incomeTotalDisplay = 0;
  expenseTotalDisplay = 0;
  payrollTotalDisplay = 0;                        // <--- รวมเงินเดือนเพื่อโชว์บนการ์ด
  truckCount = 0;
  employeeCount = 0;

  // อัตราส่วนสำหรับ progress การ์ดเงินเดือน (เงินเดือน/รายจ่าย)
  get payrollPctOfExpenses(): number {
    const exp = this.expenseTotalDisplay || 0;
    const pay = this.payrollTotalDisplay || 0;
    return exp > 0 ? Math.min(100, Math.round((pay / exp) * 100)) : 0;
  }

  // ===== Attendance chart =====
  attendanceData: ChartData<'bar'> = { labels: [], datasets: [] };
  attendanceOpt: ChartConfiguration<'bar'>['options'] = {
    responsive: true, maintainAspectRatio: false,
    scales: {
      x: { stacked: true, grid: { color: 'rgba(148,163,184,.15)' } },
      y: { stacked: true, beginAtZero: true, grid: { color: 'rgba(148,163,184,.15)' } },
    },
    plugins: {
      legend: { position: 'top', labels: { color: '#cbd5e1' } },
      tooltip: {
        callbacks: {
          footer: (items) => {
            const i = items[0].dataIndex ?? 0;
            // @ts-ignore
            const w = (items[0].chart.data as any)._working?.[i] ?? 0;
            return `ต้องทำงาน: ${w} คน`;
          },
        },
      },
    },
  };

  // ===== Doughnut =====
  incomeProgressValue = 0;
  circularChartData: ChartData<'doughnut'> = {
    labels: ['บรรลุแล้ว', 'คงเหลือ'],
    datasets: [{ data: [0, 100], backgroundColor: ['#34d399', '#e5e7eb'], borderWidth: 0 }],
  };
  circularOpts: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true, maintainAspectRatio: false,
    radius: '96%', cutout: '58%', layout: { padding: 0 },
    plugins: { legend: { position: 'top', labels: { color: '#cbd5e1' } } },
  };

  // ===== lifecycle =====
  ngOnInit(): void { this.buildYearList(); this.loadAttendance(); this.loadFinance(); this.loadCounts(); }

  // ===== Header text =====
  get periodLabel(): string {
    if (this.rangeMode === 'month') {
      const m = this.months.find(x => x.value === this.selectedMonth)?.label;
      return `${m} ${this.selectedYear}`;
    }
    return `ปี ${this.selectedYear}`;
  }

  // ===== UI Handlers =====
  onRangeMode(mode: RangeMode) {
    if (this.rangeMode === mode) return;
    this.rangeMode = mode; localStorage.setItem('genRangeMode', mode);
    this.loadAttendance(); this.recalcTotalsFromMonthly(); this.recalcDonutFromActual();
  }
  onMonthYearChange() {
    localStorage.setItem('genMonth', String(this.selectedMonth));
    localStorage.setItem('genYear', String(this.selectedYear));
    this.loadAttendance(); this.loadFinance();
  }

  // ===== Core calls =====
  private iso(d: Date) { return d.toISOString().slice(0, 10); }
  private getStartEnd(): { start: Date; end: Date } {
    if (this.rangeMode === 'month') {
      const start = new Date(this.selectedYear, this.selectedMonth - 1, 1);
      const end   = new Date(this.selectedYear, this.selectedMonth, 0);
      return { start, end };
    } else {
      const start = new Date(this.selectedYear, 0, 1);
      const end   = new Date(this.selectedYear, 11, 31);
      return { start, end };
    }
  }

  // ปีในดรอปดาวน์
  private buildYearList() {
    this.http.get<{ years: number[] }>('/api/finance/years').subscribe({
      next: (r) => this.yearList = r.years,
      error: () => {
        const cur = new Date().getFullYear();
        const start = cur - 5, end = cur + 1;
        this.yearList = Array.from({ length: end - start + 1 }, (_, i) => start + i);
      }
    });
  }

  // Attendance
  private loadAttendance() {
    const { start, end } = this.getStartEnd();
    const params = new HttpParams().set('start', this.iso(start)).set('end', this.iso(end));
    this.http.get<{ days: AttendanceDay[]; totalEmployees: number }>(
      '/api/dashboard/attendance', { params }
    ).subscribe({
      next: (res) => this.applyAttendance(res.days || []),
      error: () => { this.applyAttendance([]); }
    });
  }

  // สรุปรายเดือนการเงิน (ดึง payroll ด้วย)
  private loadFinance() {
    const params = new HttpParams()
      .set('year', String(this.selectedYear))
      .set('income_basis', 'receivedAt')
      .set('invoice_basis', 'dueDate');

    this.http.get<{
      year: number;
      incomes: number[];
      expenses: number[];
      breakdown?: { fuel?: number[]; truck?: number[]; payroll?: number[] };
    }>('/api/finance/summary/monthly', { params }).subscribe({
      next: (r) => {
        this.incomeMonthly  = (r.incomes  || Array(12).fill(0)).map(v => Number(v || 0));
        this.expenseMonthly = (r.expenses || Array(12).fill(0)).map(v => Number(v || 0));
        this.payrollMonthly = (r.breakdown?.payroll || Array(12).fill(0)).map(v => Number(v || 0)); // <-- ใช้ payroll จริง
        this.recalcTotalsFromMonthly();
        this.recalcDonutFromActual();
      },
      error: () => {
        this.incomeMonthly  = Array(12).fill(0);
        this.expenseMonthly = Array(12).fill(0);
        this.payrollMonthly = Array(12).fill(0);
        this.recalcTotalsFromMonthly();
        this.recalcDonutFromActual();
      }
    });
  }

  // นับรถ/พนักงาน
  private loadCounts() {
    this.http.get<any[]>('/api/trucks').subscribe({
      next: (rows) => this.truckCount = Array.isArray(rows) ? rows.length : 0,
      error: () => this.truckCount = 0
    });
    this.http.get<any[]>('/api/employees').subscribe({
      next: (rows) => this.employeeCount = Array.isArray(rows) ? rows.length : 0,
      error: () => this.employeeCount = 0
    });
  }

  // โดนัทรายได้
  private recalcDonutFromActual() {
    const amt = this.rangeMode === 'month'
      ? (this.incomeMonthly[this.selectedMonth - 1] || 0)
      : this.incomeMonthly.reduce((s, v) => s + (v || 0), 0);
    const goal = this.target;
    const pct = goal > 0 ? Math.min(100, Math.round((amt / goal) * 100)) : 0;

    this.incomeProgressValue = pct;
    this.circularChartData = {
      labels: ['บรรลุแล้ว', 'คงเหลือ'],
      datasets: [{ data: [pct, 100 - pct], backgroundColor: ['#34d399', '#e5e7eb'], borderWidth: 0 }]
    };
  }

  // รวม KPI ตามโหมด (รวม payroll ด้วย)
  private recalcTotalsFromMonthly() {
    if (this.rangeMode === 'month') {
      const i = this.selectedMonth - 1;
      this.incomeTotalDisplay  = this.incomeMonthly[i]  || 0;
      this.expenseTotalDisplay = this.expenseMonthly[i] || 0;
      this.payrollTotalDisplay = this.payrollMonthly[i] || 0; // <--- ใหม่
    } else {
      this.incomeTotalDisplay  = this.incomeMonthly.reduce((s, v) => s + (v || 0), 0);
      this.expenseTotalDisplay = this.expenseMonthly.reduce((s, v) => s + (v || 0), 0);
      this.payrollTotalDisplay = this.payrollMonthly.reduce((s, v) => s + (v || 0), 0); // <--- ใหม่
    }
  }

  // Apply attendance dataset
  private applyAttendance(days: AttendanceDay[]) {
    if (this.rangeMode === 'month') {
      const labels = days.map(d =>
        new Date(d.date).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' })
      );
      this.attendanceData = {
        labels,
        datasets: [
          { label: 'ตรงเวลา', data: days.map(d => d.onTime), stack: 'a', backgroundColor: '#10b981' },
          { label: 'สาย',     data: days.map(d => d.late),   stack: 'a', backgroundColor: '#f59e0b' },
          { label: 'ลา',      data: days.map(d => d.leave),  stack: 'b', backgroundColor: '#94a3b8' },
          { label: 'ขาด',     data: days.map(d => d.absent), stack: 'b', backgroundColor: '#ef4444' },
        ],
      } as any;
      (this.attendanceData as any)._working = days.map(d => d.working);
    } else {
      const byM = Array.from({ length: 12 }).map(() => ({ w: 0, on: 0, late: 0, leave: 0, abs: 0 }));
      for (const d of days) {
        const m = new Date(d.date).getMonth();
        byM[m].w    += d.working   || 0;
        byM[m].on   += d.onTime    || 0;
        byM[m].late += d.late      || 0;
        byM[m].leave+= d.leave     || 0;
        byM[m].abs  += d.absent    || 0;
      }
      const labels = this.months.map(m => m.label);
      this.attendanceData = {
        labels,
        datasets: [
          { label: 'ตรงเวลา', data: byM.map(x => x.on),   stack: 'a', backgroundColor: '#10b981' },
          { label: 'สาย',     data: byM.map(x => x.late), stack: 'a', backgroundColor: '#f59e0b' },
          { label: 'ลา',      data: byM.map(x => x.leave),stack: 'b', backgroundColor: '#94a3b8' },
          { label: 'ขาด',     data: byM.map(x => x.abs),  stack: 'b', backgroundColor: '#ef4444' },
        ],
      } as any;
      (this.attendanceData as any)._working = byM.map(x => x.w);
    }
  }



  // % รายจ่ายเทียบรายรับ (การ์ด "รายจ่าย" ใช้)
get expensePctOfIncome(): number {
  const i = this.incomeTotalDisplay || 0;
  const e = this.expenseTotalDisplay || 0;
  return i > 0 ? Math.min(100, Math.round((e / i) * 100)) : 0;
}

// % เงินเดือนเทียบรายรับ (การ์ด "เงินเดือนพนักงาน" ถ้า HTML ใช้ payrollPctOfIncome)
get payrollPctOfIncome(): number {
  const i = this.incomeTotalDisplay || 0;
  const p = this.payrollTotalDisplay || 0;
  return i > 0 ? Math.min(100, Math.round((p / i) * 100)) : 0;
}

// === กำไรสุทธิ (รวมทั้งหมด) ===
// หมายเหตุ: expenses จาก backend รวม payroll แล้ว
get netTotalDisplay(): number {
  const income  = this.incomeTotalDisplay || 0;
  const expense = this.expenseTotalDisplay || 0;
  return Math.round(income - expense); // ไม่ต้องลบ payroll ซ้ำ
}

// === % กำไรเทียบรายรับ ===
get profitPct(): number {
  const income = this.incomeTotalDisplay || 0;
  const net    = this.netTotalDisplay || 0;
  return income > 0 ? Math.min(100, Math.max(0, Math.round((net / income) * 100))) : 0;
}



// ===== Travel Cost Modal state =====
travelModalOpen = false;
tab: 'calc' | 'rules' = 'calc';

// คำนวณราคา
calc = { distance: null as number | null, at: new Date().toISOString().slice(0,10) };
calcLoading = false;
calcResult: { rejected?: boolean; price_per_round: number; message?: string; rule?: any } | null = null;

// ประวัติเรท
rules: any[] = [];
editingRule: any = { id: null, min_km: 0, max_km: 15, price_per_round: 400, is_active: true, note: null };
effectiveFromStr = new Date().toISOString().slice(0,10);
effectiveToStr: string | null = null;

// เปิด/ปิด modal
openTravelModal() { this.travelModalOpen = true; this.tab = 'calc'; this.resetCalc(); this.loadRules(); }
closeTravelModal() { this.travelModalOpen = false; }

// รีเซ็ตฟอร์มคำนวณ
resetCalc() {
  this.calc = { distance: null, at: new Date().toISOString().slice(0,10) };
  this.calcResult = null;
}

// เรียกคำนวณ (ใช้ backend ปัจจุบัน: GET /api/travel-costs/calc?distance=&at=)
submitCalc() {
  const d = Number(this.calc.distance ?? 0);
  if (!Number.isFinite(d) || d < 0) return;

  this.calcLoading = true;
  const params = new HttpParams().set('distance', String(d)).set('at', this.calc.at);
  this.http.get<any>('/api/travel-costs/calc', { params }).subscribe({
    next: (r) => {
      // รองรับกรณี backend ตอบ rejected เมื่อ >= 30 กม.
      this.calcResult = {
        rejected: !!r.rejected,
        price_per_round: Number(r.price_per_round || r.rule?.price_per_round || 0),
        message: r.message,
        rule: r.rule
      };
      this.calcLoading = false;
    },
    error: (e) => {
      // 404: ไม่พบเรท
      this.calcResult = { price_per_round: 0, message: e?.error?.error || 'ไม่พบเรทที่ตรงเงื่อนไข' };
      this.calcLoading = false;
    }
  });
}

// โหลดประวัติเรท (ใช้รายการทั้งหมด)
loadRules() {
  this.http.get<any[]>('/api/travel-costs').subscribe({
    next: (rows) => this.rules = (rows || []).map(r => ({ ...r, price_per_round: Number(r.price_per_round) })),
    error: () => this.rules = []
  });
}

// เริ่มแก้ไขเรท
startEdit(r: any) {
  this.editingRule = { ...r, price_per_round: Number(r.price_per_round) };
  this.effectiveFromStr = r.effective_from ? String(r.effective_from).slice(0,10) : new Date().toISOString().slice(0,10);
  this.effectiveToStr   = r.effective_to   ? String(r.effective_to).slice(0,10)   : null;
}

// ยกเลิกแก้ไข
cancelEdit() {
  this.editingRule = { id: null, min_km: 0, max_km: 15, price_per_round: 400, is_active: true, note: null };
  this.effectiveFromStr = new Date().toISOString().slice(0,10);
  this.effectiveToStr = null;
}

// บันทึกเรท (สร้าง/แก้ไข)
saveRule() {
  const payload: any = {
    min_km: Number(this.editingRule.min_km),
    max_km: this.editingRule.max_km === '' || this.editingRule.max_km == null ? null : Number(this.editingRule.max_km),
    price_per_round: Number(this.editingRule.price_per_round),
    is_active: !!this.editingRule.is_active,
    note: this.editingRule.note ?? null,
    effective_from: this.effectiveFromStr,
    effective_to: this.effectiveToStr || null,
  };

  const req$ = this.editingRule?.id
    ? this.http.patch(`/api/travel-costs/${this.editingRule.id}`, payload)
    : this.http.post(`/api/travel-costs`, payload);

  req$.subscribe({
    next: () => { this.cancelEdit(); this.loadRules(); },
    error: (e) => alert(e?.error?.error || 'บันทึกกติกาไม่สำเร็จ')
  });
}

// ลบเรท
removeRule(r: any) {
  if (!confirm('ลบกติกานี้?')) return;
  this.http.delete(`/api/travel-costs/${r.id}`).subscribe({
    next: () => this.loadRules(),
    error: (e) => alert(e?.error?.error || 'ลบไม่สำเร็จ')
  });
}



}
