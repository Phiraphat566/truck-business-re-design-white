import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgChartsModule } from 'ng2-charts';
import { ChartData, ChartOptions } from 'chart.js';
import { HttpClient, HttpClientModule, HttpParams } from '@angular/common/http';

/* ================== Types ================== */
type Invoice = {
  id: number;
  invoiceNo: string;
  customerName: string;
  contractDate: string;
  dueDate: string;
  amount: number | string;
  status: 'PENDING' | 'OVERDUE' | 'PAID' | 'PARTIAL';
  paidAt?: string | null;
  createdAt: string;
  description?: string | null;
  paidAmount?: number;
  remaining?: number;
};

type PayrollRun = {
  id: number;
  year: number;
  month: number;
  title?: string | null;
  note?: string | null;
  status: 'DRAFT' | 'CLOSED';
  total: number;
  created_at: string;
};

type PayrollItem = {
  id: number;
  payroll_run_id: number;
  employee_id: string | null;
  employeeName: string;
  position?: string | null;
  base_salary: number;
  allowance: number;
  overtime: number;
  deduction: number;
  net_amount: number;
  status: 'UNPAID' | 'PAID';
  paid_at?: string | null;
  note?: string | null;
};



@Component({
  standalone: true,
  selector: 'app-billing',
  templateUrl: './billing.component.html',
  styleUrls: ['./billing.component.css'],
  imports: [CommonModule, FormsModule, NgChartsModule, HttpClientModule]
})
export class BillingComponent implements OnInit {

  /* ========== Employees (สำหรับ Payroll) ========== */
  employees: { id: string, name: string, position?: string|null }[] = [];

  // โมดัลสร้าง payroll item
showPayrollCreateModal = false;
creatingPayrollItem = false;
payrollCreateError: string | null = null;
payrollCreateForm = {
  employee_id: null as string | null,
  base_salary: 0,
  allowance: 0,
  overtime: 0,
  deduction: 0,
  note: '' as string | null
};

payrollEditingId: number | null = null;

  /* ========== Theme ========== */
  isDark = localStorage.getItem('theme') === 'dark';
  private applyTheme() {
    document.documentElement.classList.toggle('dark', this.isDark);
    localStorage.setItem('theme', this.isDark ? 'dark' : 'light');
  }
  toggleTheme() { this.isDark = !this.isDark; this.applyTheme(); }

  /* ========== Views ========== */
  view: 'dashboard' | 'monthDetail' = 'dashboard';
  viewMode: 'INVOICE' | 'PAYROLL' = 'INVOICE'; // << โหมดข้อมูล

  basis: 'contractDate' | 'dueDate' | 'paidAt' = 'dueDate'; // ใช้กับ Invoice summary/list

  /* ========== Year/Month ========== */
  chartMonthIndex = new Date().getMonth(); // 0..11
  selectedYear!: number;
  years: number[] = [];

  /* ========== Loading & errors ========== */
  isLoading = false;
  loadingInvoices = false;
  loadingPayroll = false;
  apiError: string | null = null;

  /* ========== Data ========== */
  months = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

  // Summary for chart
  invoiceTotals: number[] = Array(12).fill(0);
  payrollTotals: number[] = Array(12).fill(0);

  // Invoice month detail
  invoicesOfMonth: Invoice[] = [];
  opened: Record<number, boolean> = {};

  // Payroll month detail
  payrollRun: PayrollRun | null = null;
  payrollItemsOfMonth: PayrollItem[] = [];
  openedPayroll: Record<number, boolean> = {};

  // Filters
  filterStatus: 'ALL' | 'PENDING' | 'OVERDUE' | 'PAID' | 'PARTIAL' = 'ALL';
  filterPayrollStatus: 'ALL' | 'UNPAID' | 'PAID' = 'ALL';

  get filteredInvoices(): Invoice[] {
    if (this.filterStatus === 'ALL') return this.invoicesOfMonth;
    return (this.invoicesOfMonth || []).filter(i => i.status === this.filterStatus);
  }
  get filteredPayroll(): PayrollItem[] {
    if (this.filterPayrollStatus === 'ALL') return this.payrollItemsOfMonth;
    return (this.payrollItemsOfMonth || []).filter(i => i.status === this.filterPayrollStatus);
  }

  // Edit / Create invoice (ของเดิม)
  editingMode = false;
  editingId: number | null = null;

  /* ===== Create Invoice Modal (ของเดิม) ===== */
  showCreateModal = false;
  creating = false;
  createError: string | null = null;
  newInvoice: { invoiceNo: string; customerName: string; contractDate: string; dueDate: string; amount: number | null; description?: string | null; } =
    { invoiceNo: '', customerName: '', contractDate: '', dueDate: '', amount: null, description: '' };
  invoiceNoHint = '';

  /* ===== Chart ===== */
  chartData: ChartData<'bar', number[], string> = { labels: [], datasets: [] };
  chartOptions: ChartOptions<'bar'> = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'top' },
      title: { display: false },
      tooltip: { displayColors: false, callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString('th-TH')} บาท` } }
    },
    scales: {
      x: { grid: { display: false } },
      y: { beginAtZero: true, ticks: { callback: v => (v as number).toLocaleString('th-TH') + ' ฿' } }
    },
    elements: { bar: { borderRadius: 8, borderSkipped: false } }
  };

  /* ===== Pay Invoice Modal (ของเดิม) ===== */
  showPayModal = false;
  paying = false;
  payError: string | null = null;
  payTarget: Invoice | null = null;
  payForm: { paidAt: string; incomeAmount: number | null; incomeDescription?: string | null; incomeCategory?: string | null } =
    { paidAt: '', incomeAmount: null, incomeDescription: '', incomeCategory: 'INVOICE' };

  /* ===== Pay Payroll Modal (ใหม่) ===== */
  showPayrollPayModal = false;
  payingPayroll = false;
  payrollPayError: string | null = null;
  payrollPayTarget: PayrollItem | null = null;
  payrollPayForm: { paid_at: string } = { paid_at: '' };

  constructor(private http: HttpClient) {}
  ngOnInit(): void { this.applyTheme(); this.fetchYearsFromDb(); }

  /* ================== Helpers ================== */
  toAmountNumber(v: number | string | null | undefined): number { if (v == null) return 0; return typeof v === 'number' ? v : Number(v); }
  getRemaining(inv: Partial<Invoice>): number {
    const amt = this.toAmountNumber(inv.amount as any);
    const paid = this.toAmountNumber((inv.paidAmount as any) ?? 0);
    return typeof inv.remaining === 'number' ? inv.remaining : Math.max(amt - paid, 0);
  }
  statusLabel(s: Invoice['status']) {
    if (s === 'PAID') return 'ชำระแล้ว';
    if (s === 'OVERDUE') return 'ค้างชำระ';
    if (s === 'PARTIAL') return 'ชำระบางส่วน';
    return 'รอดำเนินการ';
  }
  statusBadgeClass(s: Invoice['status']) {
    if (s === 'PAID')     return 'bg-green-100 text-green-700 dark:bg-emerald-500/20 dark:text-emerald-300';
    if (s === 'OVERDUE')  return 'bg-yellow-100 text-yellow-700 dark:bg-amber-500/20 dark:text-amber-300';
    if (s === 'PARTIAL')  return 'bg-blue-100 text-blue-700 dark:bg-sky-500/20 dark:text-sky-300';
    return 'bg-gray-100 text-gray-700 dark:bg-slate-700/50 dark:text-slate-200';
  }

  /* ================== Years ================== */
  private fetchYearsFromDb() {
    this.apiError = null;
    this.http.get<{ years: number[] }>('/api/finance/years/invoice').subscribe({
      next: (res) => {
        const ys = (res?.years ?? []).map(Number).filter(Boolean).sort((a,b)=>a-b);
        this.years = ys;
        if (this.years.length === 0) {
          this.apiError = 'ยังไม่มีข้อมูลปี';
          this.chartData = { labels: [], datasets: [] };
          return;
        }
        this.selectedYear = this.years[this.years.length - 1];
        this.loadChartYear(this.selectedYear);
        this.loadCurrentMonthDetail();
      },
      error: () => this.apiError = 'โหลดรายการปีไม่สำเร็จ'
    });
  }

  /* ================== Summary (Chart) ================== */
  private loadChartYear(year: number) {
    this.isLoading = true;

    const invParams = new HttpParams().set('year', String(year)).set('basis', this.basis);
    const payParams = new HttpParams().set('year', String(year)).set('basis', 'paidAt');

    // โหลดสองฝั่งคู่กัน
    this.http.get<{ year: number; totals: number[] }>('/api/invoices/summary/by-month', { params: invParams })
      .subscribe({
        next: (res) => { this.invoiceTotals = Array.isArray(res?.totals) ? res.totals : Array(12).fill(0); this.updateChartData(); },
        error: () => { this.invoiceTotals = Array(12).fill(0); this.updateChartData(); }
      });

    this.http.get<{ year: number; totals: number[] }>('/api/payroll/summary/by-month', { params: payParams })
      .subscribe({
        next: (res) => { this.payrollTotals = Array.isArray(res?.totals) ? res.totals : Array(12).fill(0); this.updateChartData(); this.isLoading = false; },
        error: () => { this.payrollTotals = Array(12).fill(0); this.updateChartData(); this.isLoading = false; }
      });
  }

  private colorA = 'rgba(59,130,246,0.85)';  // blue for invoices
  private colorB = 'rgba(16,185,129,0.85)';  // emerald for payroll

  private updateChartData() {
    const inv = this.invoiceTotals.map(v => this.toAmountNumber(v));
    const pay = this.payrollTotals.map(v => this.toAmountNumber(v));

    this.chartData = {
      labels: this.months,
      datasets: [
        { label: `ยอดใบแจ้งหนี้ปี ${this.selectedYear ?? ''}`, data: inv, backgroundColor: this.colorA, borderColor: this.colorA.replace('0.85','1'), borderWidth: 2, borderRadius: 8, borderSkipped: false },
        { label: `เงินเดือนที่จ่ายปี ${this.selectedYear ?? ''}`, data: pay, backgroundColor: this.colorB, borderColor: this.colorB.replace('0.85','1'), borderWidth: 2, borderRadius: 8, borderSkipped: false },
      ]
    };
  }

  /* ================== Month Detail Loader ================== */
  loadCurrentMonthDetail() {
  if (this.viewMode === 'INVOICE') this.loadInvoicesForCurrentMonth();
  else this.loadPayrollForCurrentMonth();
}

  // Invoices (เดิม)
  private loadInvoicesForCurrentMonth() {
    if (!this.selectedYear) return;
    this.loadingInvoices = true;
    const month = this.chartMonthIndex + 1;
    const params = new HttpParams().set('year', String(this.selectedYear)).set('month', String(month)).set('basis', this.basis);
    this.http.get<Invoice[]>('/api/invoices', { params }).subscribe({
      next: (items) => {
        this.invoicesOfMonth = (items ?? []).map(it => ({
          ...it,
          amount: this.toAmountNumber(it.amount),
          paidAmount: this.toAmountNumber((it as any).paidAmount ?? 0),
          remaining: this.toAmountNumber((it as any).remaining ?? 0),
        }));
        this.opened = {};
        this.loadingInvoices = false;
      },
      error: () => { this.apiError = 'เชื่อมต่อข้อมูลใบแจ้งหนี้ไม่สำเร็จ (list)'; this.invoicesOfMonth = []; this.loadingInvoices = false; }
    });
  }

  private loadEmployeesIfNeed() {
  if (this.employees.length) return;
  this.http.get<any[]>('/api/employees').subscribe({
    next: (rows) => {
      this.employees = (rows || []).map(r => ({
        id: r.id ?? r.employee_id,            // รองรับทั้ง id หรือ employee_id
        name: r.name,
        position: r.position ?? null
      }));
    },
    error: () => {}
  });
}


/** addPayroll: ให้มี ev?.stopPropagation?.() ได้ แต่ตัวเรียกหลักคือ onAddPayrollClick */
addPayroll(year: number, monthName: string, ev?: Event) {
  ev?.stopPropagation?.();

  if (this.selectedYear !== year) {
    this.selectedYear = Number(year);
    this.loadChartYear(this.selectedYear);
  }

  const idx = this.months.indexOf(monthName);
  if (idx >= 0) this.chartMonthIndex = idx;

  this.http.post<{ run: any }>('/api/payroll/runs/ensure', {
    year: this.selectedYear,
    month: this.chartMonthIndex + 1
  }).subscribe({
    next: () => {
      this.viewMode = 'PAYROLL';
      this.view = 'monthDetail';
      this.loadPayrollForCurrentMonth();
      this.loadEmployeesIfNeed();
      this.payrollEditingId = null;
      this.payrollCreateForm = { employee_id: null, base_salary: 0, allowance: 0, overtime: 0, deduction: 0, note: '' };
      this.payrollCreateError = null;
      this.showPayrollCreateModal = true;
    },
    error: () => {
      // แม้ error ก็เปิดหน้า + โมดัลต่อ (ใน dev)
      this.viewMode = 'PAYROLL';
      this.view = 'monthDetail';
      this.loadPayrollForCurrentMonth();
      this.loadEmployeesIfNeed();
      this.payrollEditingId = null;
      this.payrollCreateError = null;
      this.showPayrollCreateModal = true;
    }
  });
}

closePayrollCreate() {
  this.showPayrollCreateModal = false;
  this.creatingPayrollItem = false;
  this.payrollCreateError = null;
  this.payrollEditingId = null;                  // << reset
}
calcNetFromCreateForm() {
  const f = this.payrollCreateForm;
  return (Number(f.base_salary||0) + Number(f.allowance||0) + Number(f.overtime||0) - Number(f.deduction||0));
}
submitPayrollCreate() {
  const f = this.payrollCreateForm;
  if (!f.employee_id || !f.base_salary) {
    this.payrollCreateError = 'กรุณาเลือกพนักงาน และระบุฐานเงินเดือน';
    return;
  }
  this.creatingPayrollItem = true; this.payrollCreateError = null;

  const common = {
    employee_id: f.employee_id,
    base_salary: Number(f.base_salary || 0),
    allowance: Number(f.allowance || 0),
    overtime: Number(f.overtime || 0),
    deduction: Number(f.deduction || 0),
    note: (f.note || '').trim() || null
  };

  let req$;
  if (this.payrollEditingId) {
    // แก้ไข: ใช้ PATCH /api/payroll/items/:id
    req$ = this.http.patch(`/api/payroll/items/${this.payrollEditingId}`, common);
  } else {
    // เพิ่มใหม่: ใช้ route แบบ by-ym (หรือ /api/payroll/items ถ้า backend คุณรองรับ)
    req$ = this.http.post('/api/payroll/items/by-ym', {
      year: this.selectedYear,
      month: this.chartMonthIndex + 1,
      ...common
    });
  }

  req$.subscribe({
    next: () => {
      this.creatingPayrollItem = false;
      this.showPayrollCreateModal = false;
      this.payrollEditingId = null;
      this.loadPayrollForCurrentMonth();
      this.loadChartYear(this.selectedYear);
    },
    error: (err) => {
      this.creatingPayrollItem = false;
      this.payrollCreateError = err?.error?.message || 'บันทึกไม่สำเร็จ';
    }
  });
}


  // Payroll (ใหม่)
  private loadPayrollForCurrentMonth() {
    if (!this.selectedYear) return;
    this.loadingPayroll = true;
    const month = this.chartMonthIndex + 1;
    const params = new HttpParams().set('year', String(this.selectedYear)).set('month', String(month));
    this.http.get<{ run: PayrollRun | null; items: PayrollItem[] }>('/api/payroll', { params }).subscribe({
      next: (res) => {
        this.payrollRun = res?.run ?? null;
        this.payrollItemsOfMonth = (res?.items ?? []).map(x => ({
          ...x,
          base_salary: this.toAmountNumber(x.base_salary),
          allowance: this.toAmountNumber(x.allowance),
          overtime: this.toAmountNumber(x.overtime),
          deduction: this.toAmountNumber(x.deduction),
          net_amount: this.toAmountNumber(x.net_amount)
        }));
        this.openedPayroll = {};
        this.loadingPayroll = false;
      },
      error: () => { this.apiError = 'เชื่อมต่อข้อมูลเงินเดือนไม่สำเร็จ'; this.payrollRun = null; this.payrollItemsOfMonth = []; this.loadingPayroll = false; }
    });
  }


  openPayrollEdit(row: PayrollItem) {
  this.loadEmployeesIfNeed();
  this.payrollEditingId = row.id;
  this.payrollCreateForm = {
    employee_id: row.employee_id,
    base_salary: Number(row.base_salary || 0),
    allowance: Number(row.allowance || 0),
    overtime: Number(row.overtime || 0),
    deduction: Number(row.deduction || 0),
    note: row.note || ''
  };
  this.payrollCreateError = null;
  this.showPayrollCreateModal = true;
}

confirmDeletePayroll(row: PayrollItem) {
  if (!confirm(`ลบบรรทัดเงินเดือนของ ${row.employeeName}?`)) return;
  this.http.delete(`/api/payroll/items/${row.id}`).subscribe({
    next: () => {
      this.loadPayrollForCurrentMonth();
      this.loadChartYear(this.selectedYear);
    },
    error: (err) => alert(err?.error?.message || 'ลบไม่สำเร็จ')
  });
}


  /* ================== UI actions ================== */
  onChangeYear(year: number) {
    this.selectedYear = Number(year);
    this.loadChartYear(this.selectedYear);
    this.loadCurrentMonthDetail();
  }
  prevMonth() { if (this.chartMonthIndex > 0) { this.chartMonthIndex--; this.loadCurrentMonthDetail(); } }
  nextMonth() { if (this.chartMonthIndex < 11) { this.chartMonthIndex++; this.loadCurrentMonthDetail(); } }

  switchMode(mode: 'INVOICE' | 'PAYROLL') {
    this.viewMode = mode;
    this.loadCurrentMonthDetail();
  }

  /* ====== Month Grid actions ====== */
  addNewYear() {
    const base = this.years.length ? Math.max(...this.years) : new Date().getFullYear();
    const nextYear = base + 1;
    this.http.post('/api/invoice-years', { year: nextYear }).subscribe({
      next: () => { this.fetchYearsFromDb(); this.selectedYear = nextYear; },
      error: () => { if (!this.years.includes(nextYear)) this.years.push(nextYear); }
    });
  }

/** กันไม่ให้เปิดหน้าเดือนตอนที่มีโมดัลเปิดอยู่ */
private get isAnyModalOpen() {
  return this.showCreateModal
      || this.showPayModal
      || this.showPayrollCreateModal
      || this.showPayrollPayModal;
}

/** เปิดหน้า detail ของเดือน (ถ้ามีโมดัลอยู่ให้ return) */
openMonthDetail(year: number, monthName: string) {
  if (this.isAnyModalOpen) return;

  if (this.selectedYear !== year) {
    this.selectedYear = Number(year);
    this.loadChartYear(this.selectedYear);
  }

  const idx = this.months.indexOf(monthName);
  if (idx >= 0) this.chartMonthIndex = idx;

  this.view = 'monthDetail';
  this.filterStatus = 'ALL';
  this.filterPayrollStatus = 'ALL';
  this.loadCurrentMonthDetail();
}

  backToDashboard() { this.view = 'dashboard'; }

  /* ====== Invoice edit/create/delete (ของเดิมย่อ) ====== */
  openEdit(inv: Invoice) {
    this.editingId = inv.id; this.showCreateModal = true; this.createError = null;
    this.newInvoice = {
      invoiceNo: inv.invoiceNo,
      customerName: inv.customerName,
      contractDate: (inv.contractDate || '').slice(0,10),
      dueDate: (inv.dueDate || '').slice(0,10),
      amount: this.toAmountNumber(inv.amount),
      description: inv.description ?? ''
    };
  }
  confirmDelete(inv: Invoice) {
    if (!confirm(`ลบใบแจ้งหนี้เลขที่ ${inv.invoiceNo} ?`)) return;
    this.http.delete(`/api/invoices/${inv.id}`).subscribe({
      next: () => { this.loadChartYear(this.selectedYear); this.loadCurrentMonthDetail(); },
      error: (err) => { alert(err?.error?.message || 'ลบไม่สำเร็จ'); }
    });
  }
  addBill(year: number, monthName: string) {
    const idx = this.months.indexOf(monthName); if (idx >= 0) this.chartMonthIndex = idx;
    const yyyy = year; const start = new Date(yyyy, this.chartMonthIndex, 1); const end = new Date(yyyy, this.chartMonthIndex + 1, 0);
    this.invoiceNoHint = `${yyyy}-${String(this.chartMonthIndex + 1).padStart(2,'0')}-0001`;
    this.newInvoice = { invoiceNo: '', customerName: '', contractDate: this.toDateInput(start), dueDate: this.toDateInput(end), amount: null, description: '' };
    this.createError = null; this.showCreateModal = true;
  }
  closeCreate() { this.showCreateModal = false; this.creating = false; this.createError = null; this.editingId = null; }
  submitCreate() {
    if (!this.newInvoice.invoiceNo || !this.newInvoice.customerName || !this.newInvoice.contractDate || !this.newInvoice.dueDate || this.newInvoice.amount == null) {
      this.createError = 'กรุณากรอกข้อมูลที่มี * ให้ครบถ้วน'; return;
    }
    this.creating = true; this.createError = null;
    const payload = {
      invoiceNo: this.newInvoice.invoiceNo.trim(),
      customerName: this.newInvoice.customerName.trim(),
      contractDate: this.newInvoice.contractDate,
      dueDate: this.newInvoice.dueDate,
      amount: Number(this.newInvoice.amount),
      description: this.newInvoice.description?.trim() || null
    };
    const req$ = this.editingId ? this.http.put<Invoice>(`/api/invoices/${this.editingId}`, payload) : this.http.post<Invoice>('/api/invoices', payload);
    req$.subscribe({
      next: () => { this.creating = false; this.showCreateModal = false; this.editingId = null; this.loadChartYear(this.selectedYear); this.loadCurrentMonthDetail(); },
      error: (err) => { this.creating = false; this.createError = err?.error?.message || 'บันทึกไม่สำเร็จ'; }
    });
  }
  private toDateInput(d: Date): string { const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; }

  /* ====== Pay invoice (ของเดิม) ====== */
  openPay(inv: Invoice) {
    this.payTarget = inv;
    const today = new Date(); const y=today.getFullYear(); const m=String(today.getMonth()+1).padStart(2,'0'); const d=String(today.getDate()).padStart(2,'0');
    const remain = this.getRemaining(inv);
    this.payForm = { paidAt: `${y}-${m}-${d}`, incomeAmount: remain, incomeDescription: `ชำระเงินใบแจ้งหนี้ ${inv.invoiceNo}`, incomeCategory: 'INVOICE' };
    this.payError = null; this.showPayModal = true;
  }
  closePay() { this.showPayModal = false; this.payTarget = null; this.paying = false; this.payError = null; }
  submitPay() {
    if (!this.payTarget) return;
    if (!this.payForm.paidAt || this.payForm.incomeAmount == null) { this.payError = 'กรุณากรอกวันที่และยอดรับให้ครบถ้วน'; return; }
    this.paying = true; this.payError = null;
    const body = { amount: Number(this.payForm.incomeAmount), paidAt: this.payForm.paidAt, description: this.payForm.incomeDescription || `ชำระเงินใบแจ้งหนี้ ${this.payTarget.invoiceNo}` };
    this.http.post(`/api/invoices/${this.payTarget.id}/payments`, body).subscribe({
      next: () => { this.closePay(); this.loadCurrentMonthDetail(); this.loadChartYear(this.selectedYear); },
      error: (err) => { this.payError = err?.error?.message || 'บันทึกไม่สำเร็จ'; this.paying = false; }
    });
  }

/** ปุ่มเพิ่ม “ใบแจ้งหนี้” บนการ์ดเดือน */
onAddInvoiceClick(ev: Event, year: number, monthName: string) {
  ev.stopPropagation();
  ev.preventDefault();
  this.addBill(year, monthName);
}


/** ปุ่มเพิ่ม “เงินเดือน” บนการ์ดเดือน */
onAddPayrollClick(ev: Event, year: number, monthName: string) {
  ev.stopPropagation();
  ev.preventDefault();
  this.addPayroll(year, monthName);
}



  /* ====== Pay payroll (ใหม่) ====== */
  openPayPayroll(item: PayrollItem) {
    this.payrollPayTarget = item;
    const t = new Date(); const y=t.getFullYear(); const m=String(t.getMonth()+1).padStart(2,'0'); const d=String(t.getDate()).padStart(2,'0');
    this.payrollPayForm = { paid_at: `${y}-${m}-${d}` };
    this.payrollPayError = null; this.showPayrollPayModal = true;
  }
  closePayrollPay() { this.showPayrollPayModal = false; this.payrollPayTarget = null; this.payingPayroll = false; this.payrollPayError = null; }
  submitPayrollPay() {
    if (!this.payrollPayTarget) return;
    if (!this.payrollPayForm.paid_at) { this.payrollPayError = 'กรุณาเลือกวันที่จ่าย'; return; }
    this.payingPayroll = true; this.payrollPayError = null;
    this.http.post(`/api/payroll/items/${this.payrollPayTarget.id}/pay`, { paid_at: this.payrollPayForm.paid_at }).subscribe({
      next: () => { this.closePayrollPay(); this.loadPayrollForCurrentMonth(); this.loadChartYear(this.selectedYear); },
      error: (err) => { this.payrollPayError = err?.error?.message || 'บันทึกไม่สำเร็จ'; this.payingPayroll = false; }
    });
  }

  /* ====== Row toggles ====== */
  toggleOpen(id: number) { this.opened[id] = !this.opened[id]; }
  toggleOpenPayroll(id: number) { this.openedPayroll[id] = !this.openedPayroll[id]; }
}
