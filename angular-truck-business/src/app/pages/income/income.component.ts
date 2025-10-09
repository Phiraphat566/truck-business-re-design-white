import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgChartsModule } from 'ng2-charts';
import { ChartData, ChartOptions } from 'chart.js';
import { HttpClient, HttpClientModule, HttpParams } from '@angular/common/http';

type IncomeDoc = {
  id: number;
  receiptNo: string;
  customerName?: string | null;
  contractDate: string;
  dueDate?: string | null;
  amount: number | string;
  status: 'PENDING' | 'OVERDUE' | 'PAID' | 'PARTIAL';
  receivedAt?: string | null;
  createdAt: string;
  description?: string | null;

  // แนบมาจาก API list
  paidAmount?: number;
  remaining?: number;
};

@Component({
  standalone: true,
  selector: 'app-income',
  templateUrl: './income.component.html',
  styleUrls: ['./income.component.css'],
  imports: [CommonModule, FormsModule, NgChartsModule, HttpClientModule],
})
export class IncomeComponent implements OnInit {
  // ---------- Theme ----------
  isDark = localStorage.getItem('theme') === 'dark';
  private applyTheme() {
    document.documentElement.classList.toggle('dark', this.isDark);
    localStorage.setItem('theme', this.isDark ? 'dark' : 'light');
  }
  toggleTheme() { this.isDark = !this.isDark; this.applyTheme(); }

  // ---------- View ----------
  view: 'dashboard' | 'monthDetail' = 'dashboard';

  // ฐานเวลา (สลับได้จาก UI)
  basis: 'contractDate' | 'dueDate' | 'receivedAt' = 'contractDate';

  // === โหมดแก้ไข ===
  editingMode = false;

  // ---------- Year/Month ----------
  months = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  chartMonthIndex = new Date().getMonth(); // 0..11
  selectedYear!: number;
  years: number[] = [];

  // ---------- Loading & errors ----------
  isLoading = false;
  loadingDocs = false;
  apiError: string | null = null;

  // ---------- Data ----------
  monthTotals: number[] = Array(12).fill(0);
  incomesOfMonth: IncomeDoc[] = [];
  opened: Record<number, boolean> = {};

  // filter ในหน้ารายเดือน
  filterStatus: 'ALL' | 'PENDING' | 'OVERDUE' | 'PAID' | 'PARTIAL' = 'ALL';
  get filteredIncomes(): IncomeDoc[] {
    if (this.filterStatus === 'ALL') return this.incomesOfMonth;
    return (this.incomesOfMonth || []).filter(i => i.status === this.filterStatus);
  }

  // ---------- Create/Edit ----------
  showCreateModal = false;
  creating = false;
  createError: string | null = null;
  editingId: number | null = null;
  receiptNoHint = '';
  newIncome: {
    receiptNo: string;
    customerName?: string | null;
    contractDate: string;
    dueDate?: string | null;
    amount: number | null;
    description?: string | null;
  } = { receiptNo: '', customerName: '', contractDate: '', dueDate: '', amount: null, description: '' };

  // ---------- Chart ----------
  chartData: ChartData<'bar', number[], string> = { labels: [], datasets: [{ data: [], label: 'ยอดรายรับต่อเดือน' }] };
  chartOptions: ChartOptions<'bar'> = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'top' },
      tooltip: { displayColors: false, callbacks: { label: (ctx) => `${ctx.label}: ${ctx.parsed.y.toLocaleString('th-TH')} บาท` } }
    },
    scales: {
      x: { grid: { display: false } },
      y: { beginAtZero: true, ticks: { callback: v => (v as number).toLocaleString('th-TH') + ' ฿' } }
    },
    elements: { bar: { borderRadius: 8, borderSkipped: false } }
  };

  constructor(private http: HttpClient) {}
  ngOnInit() { this.applyTheme(); this.fetchYearsFromDb(); }

  // ===== helpers =====
  toAmountNumber(v: number | string | null | undefined): number { return v == null ? 0 : (typeof v === 'number' ? v : Number(v)); }
  getRemaining(doc: Partial<IncomeDoc>): number {
    const amt = this.toAmountNumber(doc.amount as any);
    const paid = this.toAmountNumber((doc.paidAmount as any) ?? 0);
    return typeof doc.remaining === 'number' ? doc.remaining : Math.max(amt - paid, 0);
  }
  statusLabel(s: IncomeDoc['status']) {
    if (s === 'PAID') return 'รับครบแล้ว';
    if (s === 'OVERDUE') return 'เกินกำหนด';
    if (s === 'PARTIAL') return 'รับบางส่วน';
    return 'รอดำเนินการ';
  }
  statusBadgeClass(s: IncomeDoc['status']) {
    if (s === 'PAID')     return 'bg-green-100 text-green-700 dark:bg-emerald-500/20 dark:text-emerald-300';
    if (s === 'OVERDUE')  return 'bg-yellow-100 text-yellow-700 dark:bg-amber-500/20 dark:text-amber-300';
    if (s === 'PARTIAL')  return 'bg-blue-100 text-blue-700 dark:bg-sky-500/20 dark:text-sky-300';
    return 'bg-gray-100 text-gray-700 dark:bg-slate-700/50 dark:text-slate-200';
  }
  private toDateInput(d: Date): string {
    const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }

  // ===== Years =====
  private fetchYearsFromDb() {
    this.apiError = null;
    this.http.get<{ years: number[] }>('/api/income-years').subscribe({
      next: (res) => {
        const ys = (res?.years ?? []).map(Number).filter(Boolean).sort((a,b)=>a-b);
        this.years = ys;
        if (!ys.length) {
          this.apiError = 'ยังไม่มีเอกสารรายรับในระบบ';
          this.chartData = { labels: [], datasets: [{ data: [], label: 'ยอดรายรับต่อเดือน' }] };
          return;
        }
        this.selectedYear = ys[ys.length - 1];
        this.loadChartYear(this.selectedYear);
        this.loadIncomesForCurrentMonth();
      },
      error: () => this.apiError = 'โหลดรายการปีรายรับไม่สำเร็จ'
    });
  }
  addNewYear() {
    const base = this.years.length ? Math.max(...this.years) : new Date().getFullYear();
    const nextYear = base + 1;
    this.http.post('/api/income-years', { year: nextYear }).subscribe({
      next: () => { this.fetchYearsFromDb(); this.selectedYear = nextYear; },
      error: () => { if (!this.years.includes(nextYear)) this.years.push(nextYear); }
    });
  }

  // ===== Summary by month =====
  private loadChartYear(year: number) {
    this.isLoading = true;
    const params = new HttpParams().set('year', String(year)).set('basis', this.basis);
    this.http.get<{ year: number; totals: number[] }>('/api/incomes/summary/by-month', { params }).subscribe({
      next: (res) => {
        this.monthTotals = Array.isArray(res?.totals) ? res.totals : Array(12).fill(0);
        this.updateChartData();
        this.isLoading = false;
      },
      error: () => {
        this.apiError = 'เชื่อมต่อข้อมูลรายรับไม่สำเร็จ (summary)';
        this.monthTotals = Array(12).fill(0);
        this.updateChartData();
        this.isLoading = false;
      }
    });
  }

  // ===== List incomes for current month =====
  private loadIncomesForCurrentMonth() {
    if (!this.selectedYear) return;
    this.loadingDocs = true;
    const params = new HttpParams()
      .set('year', String(this.selectedYear))
      .set('month', String(this.chartMonthIndex + 1))
      .set('basis', this.basis);

    this.http.get<IncomeDoc[]>('/api/incomes', { params }).subscribe({
      next: (items) => {
        this.incomesOfMonth = (items ?? []).map(it => ({
          ...it,
          amount: this.toAmountNumber(it.amount),
          paidAmount: this.toAmountNumber((it as any).paidAmount ?? 0),
          remaining: this.toAmountNumber((it as any).remaining ?? 0),
        }));
        this.opened = {};
        this.loadingDocs = false;
      },
      error: () => {
        this.apiError = 'เชื่อมต่อข้อมูลรายรับไม่สำเร็จ (list)';
        this.incomesOfMonth = [];
        this.loadingDocs = false;
      }
    });
  }

  // ===== Chart data =====
  private updateChartData() {
    const data = Array.from({ length: 12 }, (_, i) => this.toAmountNumber(this.monthTotals[i] ?? 0));
    const palette = [
      'rgba(59,130,246,0.8)','rgba(99,102,241,0.8)','rgba(168,85,247,0.8)',
      'rgba(236,72,153,0.8)','rgba(251,113,133,0.8)','rgba(249,115,22,0.8)',
      'rgba(245,158,11,0.8)','rgba(34,197,94,0.8)','rgba(16,185,129,0.8)',
      'rgba(6,182,212,0.8)','rgba(14,165,233,0.8)','rgba(139,92,246,0.8)'
    ];
    this.chartData = {
      labels: this.months,
      datasets: [{
        data,
        label: `ยอดรายรับปี ${this.selectedYear ?? ''}`,
        backgroundColor: palette,
        borderColor: palette.map(c => c.replace('0.8','1')),
        borderWidth: 2,
        borderRadius: 8,
        borderSkipped: false,
        hoverBackgroundColor: palette.map(c => c.replace('0.8','0.9')),
        hoverBorderWidth: 3
      }]
    };
  }

  // ===== UI actions =====
  onChangeYear(year: number) {
    this.selectedYear = Number(year);
    this.loadChartYear(this.selectedYear);
    this.loadIncomesForCurrentMonth();
  }
  onChangeBasis(_b: 'contractDate' | 'dueDate' | 'receivedAt') {
    this.loadChartYear(this.selectedYear);
    this.loadIncomesForCurrentMonth();
  }
  prevMonth() {
    if (this.chartMonthIndex > 0) {
      this.chartMonthIndex--;
      this.updateChartData();
      this.loadIncomesForCurrentMonth();
    }
  }
  nextMonth() {
    if (this.chartMonthIndex < 11) {
      this.chartMonthIndex++;
      this.updateChartData();
      this.loadIncomesForCurrentMonth();
    }
  }
  openMonthDetail(year: number, monthName: string) {
    if (this.selectedYear !== year) {
      this.selectedYear = year;
      this.loadChartYear(this.selectedYear);
    }
    const idx = this.months.indexOf(monthName);
    if (idx >= 0) this.chartMonthIndex = idx;
    this.view = 'monthDetail';
    this.filterStatus = 'ALL';
    this.loadIncomesForCurrentMonth();
  }
  backToDashboard() { this.view = 'dashboard'; }
  onChangeMonthInDetail(_i: number) { this.loadIncomesForCurrentMonth(); }
  applyStatusFilter() { /* ใช้ filteredIncomes แล้ว */ }
  toggleOpen(id: number) { this.opened[id] = !this.opened[id]; }

  // ===== Create/Edit =====
  addIncome(year: number, monthName: string) {
    const idx = this.months.indexOf(monthName);
    if (idx >= 0) this.chartMonthIndex = idx;

    const yyyy = year, mm = String(this.chartMonthIndex + 1).padStart(2, '0');
    this.receiptNoHint = `${yyyy}-${mm}-0001`;

    const start = new Date(yyyy, this.chartMonthIndex, 1);
    const end = new Date(yyyy, this.chartMonthIndex + 1, 0);

    this.newIncome = {
      receiptNo: '',
      customerName: '',
      contractDate: this.toDateInput(start),
      dueDate: this.toDateInput(end),
      amount: null,
      description: ''
    };
    this.createError = null; this.showCreateModal = true; this.editingId = null;
  }
  openEdit(doc: IncomeDoc) {
    this.editingId = doc.id; this.showCreateModal = true; this.createError = null;
    this.newIncome = {
      receiptNo: doc.receiptNo,
      customerName: doc.customerName ?? '',
      contractDate: (doc.contractDate || '').slice(0,10),
      dueDate: (doc.dueDate || '').slice(0,10),
      amount: this.toAmountNumber(doc.amount),
      description: doc.description ?? ''
    };
  }
  confirmDelete(doc: IncomeDoc) {
    if (!confirm(`ลบใบรับเงินเลขที่ ${doc.receiptNo} ?`)) return;
    this.http.delete(`/api/incomes/${doc.id}`).subscribe({
      next: () => { this.loadChartYear(this.selectedYear); this.loadIncomesForCurrentMonth(); },
      error: (err) => { alert(err?.error?.message || 'ลบไม่สำเร็จ'); }
    });
  }
  closeCreate() { this.showCreateModal = false; this.creating = false; this.createError = null; this.editingId = null; }
  submitCreate() {
    if (!this.newIncome.receiptNo || !this.newIncome.contractDate || this.newIncome.amount == null) {
      this.createError = 'กรุณากรอกข้อมูลที่มี * ให้ครบถ้วน'; return;
    }
    this.creating = true; this.createError = null;
    const payload = {
      receiptNo: this.newIncome.receiptNo.trim(),
      customerName: this.newIncome.customerName?.toString().trim() || null,
      contractDate: this.newIncome.contractDate,
      dueDate: this.newIncome.dueDate || null,
      amount: Number(this.newIncome.amount),
      description: this.newIncome.description?.trim() || null
    };
    const req$ = this.editingId
      ? this.http.put<IncomeDoc>(`/api/incomes/${this.editingId}`, payload)
      : this.http.post<IncomeDoc>('/api/incomes', payload);
    req$.subscribe({
      next: () => {
        this.creating = false;
        this.showCreateModal = false;
        this.editingId = null;
        this.loadChartYear(this.selectedYear);
        this.loadIncomesForCurrentMonth();
      },
      error: (err) => { this.creating = false; this.createError = err?.error?.message || 'บันทึกไม่สำเร็จ'; }
    });
  }

  // ====== รับเงินแบบเป็นงวด ======
  showReceiveModal = false;
  receiving = false;
  receiveError: string | null = null;
  receiveTarget: IncomeDoc | null = null;
  receiveForm: { receivedAt: string; amount: number | null; description?: string | null; } = { receivedAt: '', amount: null, description: '' };

  openReceive(doc: IncomeDoc) {
    this.receiveTarget = doc;
    const t = new Date(); const y = t.getFullYear(), m = String(t.getMonth()+1).padStart(2,'0'), d = String(t.getDate()).padStart(2,'0');
    this.receiveForm = {
      receivedAt: `${y}-${m}-${d}`,
      amount: this.getRemaining(doc),
      description: `รับเงินเอกสาร ${doc.receiptNo}`,
    };
    this.receiveError = null; this.showReceiveModal = true;
  }
  closeReceive() { this.showReceiveModal = false; this.receiveTarget = null; this.receiving = false; this.receiveError = null; }
  submitReceive() {
    if (!this.receiveTarget) return;
    if (!this.receiveForm.receivedAt || this.receiveForm.amount == null) { this.receiveError = 'กรุณากรอกวันที่และยอดรับให้ครบถ้วน'; return; }
    this.receiving = true; this.receiveError = null;
    const body = { amount: Number(this.receiveForm.amount), receivedAt: this.receiveForm.receivedAt, description: this.receiveForm.description || `รับเงินเอกสาร ${this.receiveTarget.receiptNo}` };
    this.http.post(`/api/incomes/${this.receiveTarget.id}/payments`, body).subscribe({
      next: () => { this.closeReceive(); this.loadIncomesForCurrentMonth(); this.loadChartYear(this.selectedYear); },
      error: (err) => { this.receiveError = err?.error?.message || 'บันทึกไม่สำเร็จ'; this.receiving = false; }
    });
  }
}
