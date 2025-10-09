import { Component, OnInit, OnDestroy } from '@angular/core';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { firstValueFrom, interval, Subscription } from 'rxjs';

import { JobAssignmentService, TodayAssignment } from '../../services/job-assignment.service';
import { EmployeeCallService, EmployeeCall } from '../../services/employee-call.service';

type ApiEmployee = {
  id: string;
  name: string;
  position: string;
  phone: string;
  email?: string;
  profileImagePath?: string | null;
};

type DayStatus = 'NOT_CHECKED_IN' | 'WORKING' | 'OFF_DUTY' | 'ON_LEAVE' | 'ABSENT';

type ApiDayStatus = {
  employee_id: string;
  status: DayStatus;
};

interface Employee {
  id?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  email?: string;
  phone?: string;
  position?: string;
  salary?: number;
  imageUrl?: string;
  status?: DayStatus;
  todayJob?: TodayAssignment | null;
}

type ViewMode = 'main' | 'history';

@Component({
  standalone: true,
  selector: 'app-employee',
  templateUrl: './employee.component.html',
  styleUrls: ['./employee.component.css'],
  imports: [RouterModule, FormsModule, CommonModule, HttpClientModule],
})
export class EmployeeComponent implements OnInit, OnDestroy {
  private pollSub?: Subscription;

  // ===== UI / Theme =====
  isDark = localStorage.getItem('theme') === 'dark';
  toggleTheme() { this.isDark = !this.isDark; this.applyTheme(); }
  private applyTheme() {
    const root = document.documentElement;
    root.classList.toggle('dark', this.isDark);
    localStorage.setItem('theme', this.isDark ? 'dark' : 'light');
  }

  // ===== View switching (แทน popup ประวัติ) =====
  view: ViewMode = 'main';

  // ===== State ทั่วไป =====
  showDeleteConfirm = false;
  deleteIndex: number | null = null;
  showToast = false;
  toastMessage = '';
  isLoading = false;

  searchTerm = '';

  showPopup = false;
  editingMode = false;
  form: Partial<Employee> = {};
  showDetailPopup = false;
  selectedEmployee: Employee | null = null;

  currentIndex = 0;
  employees: Employee[] = [];

  // ===== Assign / Job detail =====
  showAssign = false;
  assign = {
    employeeId: null as string | null,
    date: this.formatYMD(),
    time: this.formatHM(),
    title: '',
    where: '',
    note: ''
  };

  showJobModal = false;
  jobModal: TodayAssignment | null = null;

  // ===== ประวัติการเรียก (เต็มหน้า) =====
  historyFilter = { employeeId: '', q: '' };
  calls: EmployeeCall[] = [];
  loadingCalls = false;

  page = 1;
  pageSize = 10;
  total = 0;
  totalPages = 1;
  totalKnown = false;
  hasNext = false;

  editId: number | null = null;
  editBuf: { employeeId: string; callDate: string; message: string } = { employeeId: '', callDate: '', message: '' };

  // ===== Attendance =====
  showAtt = false;
  att: any = {
    mode: 'IN',
    employeeId: null,
    date: this.formatYMD(),
    time: this.formatHM(),
    arrival: 'ON_TIME',
    leave_type: 'PERSONAL',
    reason: '',
    approved_by: null,
    absent_note: ''
  };

  // ===== Upload =====
  maxImageSize = 5 * 1024 * 1024;
  selectedFile: File | null = null;
  imagePreview: string | null = null;

  private apiBase = '/api';

  constructor(
    private http: HttpClient,
    private jobSvc: JobAssignmentService,
    private callSvc: EmployeeCallService,
  ) {}

  ngOnInit() {
    this.applyTheme();
    this.loadEmployees();
    this.pollSub = interval(10_000).subscribe(() => this.refreshDayStatuses());
  }
  ngOnDestroy() { this.pollSub?.unsubscribe(); }

  // ===== Summary getters =====
  get totalEmployees() { return this.employees.length; }
  get workingCount() { return this.employees.filter(e => e.status === 'WORKING').length; }
  get leaveCount()   { return this.employees.filter(e => e.status === 'ON_LEAVE').length; }

  // ===== Filter list =====
  get filteredEmployees(): Employee[] {
    const term = (this.searchTerm || '').trim().toLowerCase();
    if (!term) return this.employees;
    return this.employees.filter(emp =>
      (emp.firstName || '').toLowerCase().includes(term) ||
      (emp.lastName  || '').toLowerCase().includes(term) ||
      (emp.id        || '').toLowerCase().includes(term) ||
      (emp.position  || '').toLowerCase().includes(term) ||
      (emp.email     || '').toLowerCase().includes(term)
    );
  }

  // ===== CRUD helpers =====
  confirmDelete(index: number) { this.deleteIndex = index; this.showDeleteConfirm = true; }
  async deleteEmployee(index: number) {
    this.isLoading = true;
    try {
      const id = this.employees[index]?.id!;
      await firstValueFrom(this.http.delete(`${this.apiBase}/employees/${id}`));
      this.employees.splice(index, 1);
      this.toastMessage = 'ลบข้อมูลพนักงานเรียบร้อยแล้ว';
    } catch (err) {
      console.error(err);
      this.toastMessage = 'ลบไม่สำเร็จ';
    } finally {
      this.isLoading = false;
      this.showDeleteConfirm = false;
      this.deleteIndex = null;
      this.showToast = true; setTimeout(() => (this.showToast = false), 3000);
    }
  }

  openEditPopupFor(index: number) {
    this.currentIndex = index;
    this.editingMode = true;
    this.form = { ...this.employees[index] };
    this.selectedFile = null;
    this.imagePreview = this.form.imageUrl ?? null;
    this.showPopup = true;
  }
  openEditPopup() {
    if (!this.employees.length) return;
    this.editingMode = true;
    this.form = { ...this.employees[this.currentIndex] };
    this.showPopup = true;
  }
  openAddPopup() {
    this.editingMode = false;
    this.form = {};
    this.selectedFile = null;
    this.imagePreview = null;
    this.showPopup = true;
  }
  closePopup() { this.showPopup = false; }

  async submitForm() {
    this.isLoading = true;
    try {
      if (this.editingMode) {
        const id = this.form.id!;
        await firstValueFrom(this.http.put<ApiEmployee>(`${this.apiBase}/employees/${id}`, this.toApi(this.form)));
        if (this.selectedFile) await this.uploadPhoto(id, this.selectedFile);
        await this.loadEmployees();
        this.toastMessage = 'แก้ไขข้อมูลพนักงานเรียบร้อยแล้ว';
      } else {
        const created = await firstValueFrom(this.http.post<ApiEmployee>(`${this.apiBase}/employees`, this.toApi(this.form)));
        if (this.selectedFile) await this.uploadPhoto(created.id, this.selectedFile);
        await this.loadEmployees();
        this.toastMessage = 'เพิ่มพนักงานใหม่เรียบร้อยแล้ว';
      }
      this.closePopup();
      this.showToast = true; setTimeout(() => (this.showToast = false), 3000);
    } catch (err) {
      console.error(err);
      this.toastMessage = 'อัปโหลดหรือบันทึกไม่สำเร็จ';
      this.showToast = true; setTimeout(() => (this.showToast = false), 3000);
    } finally { this.isLoading = false; }
  }

  private async uploadPhoto(empId: string, file: File) {
    const fd = new FormData();
    fd.append('image', file);
    await firstValueFrom(this.http.post(`${this.apiBase}/employees/${empId}/photo`, fd));
  }

  // ===== Detail =====
  showDetail(emp: Employee) {
    this.selectedEmployee = emp;
    this.showDetailPopup = true;
    this.loadJobHistory(emp.id!);
  }
  editSelectedEmployee() {
    const index = this.employees.findIndex(emp => emp === this.selectedEmployee);
    if (index !== -1) { this.openEditPopupFor(index); this.closeDetailPopup(); }
  }
  closeDetailPopup() { this.showDetailPopup = false; }
  trackByIndex(i: number) { return i; }

  // ===== Upload UI =====
  onFileSelected(evt: Event) {
    const input = evt.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { this.toastMessage = 'กรุณาเลือกไฟล์รูปภาพเท่านั้น'; this.showToast = true; setTimeout(()=>this.showToast=false, 2500); return; }
    if (file.size > this.maxImageSize) { this.toastMessage = 'ขนาดไฟล์รูปภาพต้องไม่เกิน 5MB'; this.showToast = true; setTimeout(()=>this.showToast=false, 2500); return; }
    this.selectedFile = file;
    const reader = new FileReader();
    reader.onload = () => { this.imagePreview = reader.result as string; };
    reader.readAsDataURL(file);
  }
  clearSelectedFile() { this.selectedFile = null; this.imagePreview = null; }

  // ===== Map API <-> UI =====
  private toUi(e: ApiEmployee): Employee {
    const [firstName, ...rest] = (e.name || '').trim().split(' ');
    const lastName = rest.join(' ');
    return {
      id: e.id,
      firstName,
      lastName,
      position: e.position,
      phone: e.phone,
      email: e.email ?? '',
      imageUrl: e.profileImagePath ?? undefined,
    };
  }
  private toApi(form: Partial<Employee>): Partial<ApiEmployee> {
    return {
      name: [form.firstName, form.lastName].filter(Boolean).join(' ').trim(),
      position: form.position ?? '',
      phone: form.phone ?? '',
      email: form.email ?? ''
    };
  }

  // ===== Load data =====
  async loadEmployees() {
    try {
      const apiList = await firstValueFrom(this.http.get<ApiEmployee[]>(`${this.apiBase}/employees`));
      const date = this.formatYMD();
      const statusList = await firstValueFrom(this.http.get<ApiDayStatus[]>(`${this.apiBase}/employee-day-status`, { params: { date } }));
      const jobRows = await firstValueFrom(this.jobSvc.byDate(date));
      const jobMap: Record<string, TodayAssignment | null> = {};
      for (const r of jobRows) jobMap[r.employee_id] = r.assignment;

      const statusMap: Record<string, DayStatus> = {};
      for (const r of statusList) statusMap[r.employee_id] = r.status;

      this.employees = apiList.map(e => {
        const ui = this.toUi(e);
        ui.status = statusMap[e.id] ?? 'NOT_CHECKED_IN';
        ui.todayJob = jobMap[e.id] ?? null;
        return ui;
      });
    } catch (err) {
      console.error(err);
      this.toastMessage = 'โหลดรายชื่อพนักงานไม่สำเร็จ';
      this.showToast = true; setTimeout(() => (this.showToast = false), 3000);
    }
  }

  private formatYMD(d = new Date()): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }
  private formatHM(d = new Date()): string {
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  private joinLocalDateTime(dYmd: string, hm: string) {
    const [h, m] = hm.split(':');
    return `${dYmd}T${h.padStart(2,'0')}:${m.padStart(2,'0')}:00`;
  }

  async refreshDayStatuses() {
    try {
      if (!this.employees.length) return;
      const date = this.formatYMD();
      const statusList = await firstValueFrom(this.http.get<ApiDayStatus[]>(`${this.apiBase}/employee-day-status`, { params: { date } }));
      const jobRows = await firstValueFrom(this.jobSvc.byDate(date));
      const jobMap: Record<string, TodayAssignment | null> = {};
      for (const r of jobRows) jobMap[r.employee_id] = r.assignment;

      const statusMap: Record<string, DayStatus> = {};
      for (const r of statusList) statusMap[r.employee_id] = r.status;

      this.employees = this.employees.map(e => ({
        ...e,
        status: statusMap[e.id!] ?? 'NOT_CHECKED_IN',
        todayJob: jobMap[e.id!] ?? e.todayJob ?? null
      }));
    } catch (err) {
      console.error('[refreshDayStatuses]', err);
    }
  }

  statusDotClass(s?: DayStatus) {
    switch (s) {
      case 'WORKING':        return 'bg-emerald-500 dark:bg-emerald-400';
      case 'ON_LEAVE':       return 'bg-amber-500  dark:bg-amber-400';
      case 'OFF_DUTY':       return 'bg-rose-500   dark:bg-rose-400';
      case 'NOT_CHECKED_IN': return 'bg-sky-400    dark:bg-sky-300';
      case 'ABSENT':         return 'bg-slate-400  dark:bg-slate-500';
      default:               return 'bg-slate-400  dark:bg-slate-500';
    }
  }
  statusLabel(s?: DayStatus) {
    switch (s) {
      case 'WORKING':        return 'กำลังทำงาน';
      case 'ON_LEAVE':       return 'ลาพัก';
      case 'OFF_DUTY':       return 'นอกเวลางาน';
      case 'NOT_CHECKED_IN': return 'ยังไม่เช็คอิน';
      case 'ABSENT':         return 'ขาดงาน';
      default:               return 'ไม่ทราบสถานะ';
    }
  }

  // ===== Attendance =====
  openAttModal(emp?: Employee) {
    this.att = {
      mode: 'IN',
      employeeId: emp?.id ?? this.selectedEmployee?.id ?? null,
      date: this.formatYMD(),
      time: this.formatHM(),
      arrival: 'ON_TIME',
      leave_type: 'PERSONAL',
      reason: '',
      approved_by: null,
      absent_note: ''
    };
    this.showAtt = true;
  }
  closeAttModal() { this.showAtt = false; }

  async submitAtt() {
    this.isLoading = true;
    try {
      if (!this.att.employeeId) { this.toastMessage = 'กรุณาเลือกพนักงาน'; this.showToast = true; setTimeout(()=>this.showToast=false, 2500); return; }
      if (this.att.mode === 'IN') {
        const payload = { employeeId: this.att.employeeId, workDate: this.att.date, checkIn: this.joinLocalDateTime(this.att.date, this.att.time), status: this.att.arrival };
        await firstValueFrom(this.http.post(`${this.apiBase}/attendance`, payload));
        this.toastMessage = 'บันทึก Check-in เรียบร้อย';
      }
      if (this.att.mode === 'OUT') {
        const payload = { employeeId: this.att.employeeId, workDate: this.att.date, checkOut: this.joinLocalDateTime(this.att.date, this.att.time) };
        await firstValueFrom(this.http.post(`${this.apiBase}/attendance/check-out`, payload));
        this.toastMessage = 'บันทึก Check-out เรียบร้อย';
      }
      if (this.att.mode === 'LEAVE') {
        const payload = { employee_id: this.att.employeeId, leave_date: this.att.date, leave_type: this.att.leave_type, reason: this.att.reason || null, approved_by: Number(this.att.approved_by || 0) };
        await firstValueFrom(this.http.post(`${this.apiBase}/leaves`, payload));
        this.toastMessage = 'บันทึกลางานเรียบร้อย';
      }
      if (this.att.mode === 'ABSENT') {
        const payload = { employeeId: this.att.employeeId, date: this.att.date, status: 'ABSENT', source: 'MANUAL', note: this.att.absent_note || null };
        await firstValueFrom(this.http.post(`${this.apiBase}/employee-day-status/upsert`, payload));
        this.toastMessage = 'บันทึกขาดงานเรียบร้อย';
      }
      await this.refreshDayStatuses();
      this.showToast = true; this.closeAttModal(); setTimeout(() => (this.showToast = false), 3000);
    } catch (err: any) {
      console.error(err);
      if (err?.status === 409) this.toastMessage = 'วันนี้บันทึกซ้ำ: อาจเช็คอินไปแล้ว';
      else if (err?.status === 404 && this.att.mode === 'OUT') this.toastMessage = 'ยังไม่มี Check-in ของวันนี้';
      else this.toastMessage = 'บันทึกไม่สำเร็จ';
      this.showToast = true; setTimeout(() => (this.showToast = false), 3000);
    } finally { this.isLoading = false; }
  }

  // ===== Assign / Job detail =====
  openAssignModal(emp?: Employee) {
    this.assign = {
      employeeId: emp?.id ?? this.selectedEmployee?.id ?? null,
      date: this.formatYMD(),
      time: this.formatHM(),
      title: '',
      where: '',
      note: ''
    };
    this.showAssign = true;
  }
  closeAssignModal() { this.showAssign = false; }

  async submitAssign() {
    this.isLoading = true;
    try {
      const a = this.assign;
      if (!a.employeeId || !a.date || !a.time || !a.title || !a.where) {
        this.toastMessage = 'กรุณากรอกข้อมูลที่มี * ให้ครบ';
        this.showToast = true; setTimeout(() => (this.showToast = false), 2500);
        return;
      }
      const description = this.buildAssignDescription();
      await firstValueFrom(this.jobSvc.create({ employeeId: a.employeeId!, description, assignedDate: a.date, source: 'MANUAL' }));
      await this.refreshDayStatuses();
      if (this.selectedEmployee?.id === a.employeeId) await this.loadJobHistory(a.employeeId);
      this.toastMessage = 'มอบหมายงานเรียบร้อย';
      this.showToast = true; setTimeout(() => (this.showToast = false), 3000);
      this.closeAssignModal();
    } catch (e) {
      console.error(e);
      this.toastMessage = 'มอบหมายงานไม่สำเร็จ';
      this.showToast = true; setTimeout(() => (this.showToast = false), 3000);
    } finally { this.isLoading = false; }
  }

  openJobModal(a: TodayAssignment) { this.jobModal = a; this.showJobModal = true; }
  closeJobModal() { this.showJobModal = false; }

  async loadJobHistory(employeeId: string) {
    try {
      const from = ''; const to = '';
      await firstValueFrom(this.jobSvc.history(employeeId, from, to));
    } catch (e) { console.error(e); }
  }

  async acceptJob(id: string) {
    try {
      await firstValueFrom(this.jobSvc.acceptById(id));
      await this.refreshDayStatuses();
      if (this.selectedEmployee?.id) await this.loadJobHistory(this.selectedEmployee.id);
      if (this.jobModal && this.jobModal.id === id) {
        this.jobModal = { ...this.jobModal, accepted_at: new Date().toISOString() } as TodayAssignment;
      }
      this.toastMessage = 'ตั้งสถานะรับงานแล้ว'; this.showToast = true; setTimeout(()=>this.showToast=false, 2500);
    } catch (e) { console.error(e); }
  }
  async completeJob(id: string) {
    this.isLoading = true;
    try {
      const resp = await firstValueFrom(this.jobSvc.completeById(id));
      const job = resp.job;
      if (this.jobModal && this.jobModal.id === id) this.jobModal = { ...this.jobModal, completed_at: job.completed_at || new Date().toISOString() };
      await this.refreshDayStatuses();
      this.toastMessage = 'ปิดงานเรียบร้อย'; this.showToast = true; setTimeout(() => (this.showToast = false), 2500);
    } catch (e) {
      console.error(e);
      this.toastMessage = 'ปิดงานไม่สำเร็จ'; this.showToast = true; setTimeout(() => (this.showToast = false), 3000);
    } finally { this.isLoading = false; }
  }
  async reopenJob(id: string) {
    this.isLoading = true;
    try {
      const resp = await firstValueFrom(this.jobSvc.reopenById(id));
      const job = resp.job;
      if (this.jobModal && this.jobModal.id === id) this.jobModal = { ...this.jobModal, completed_at: null };
      await this.refreshDayStatuses();
      this.toastMessage = 'ย้อนสถานะงานเรียบร้อย'; this.showToast = true; setTimeout(() => (this.showToast = false), 2500);
    } catch (e) {
      console.error(e);
      this.toastMessage = 'ย้อนสถานะไม่สำเร็จ'; this.showToast = true; setTimeout(() => (this.showToast = false), 3000);
    } finally { this.isLoading = false; }
  }
  async deleteAssignment(id: string) {
    if (!confirm('ลบงานนี้?')) return;
    await firstValueFrom(this.jobSvc.delete(id));
    if (this.selectedEmployee?.id) await this.loadJobHistory(this.selectedEmployee.id);
    await this.refreshDayStatuses();
    if (this.jobModal && this.jobModal.id === id) this.closeJobModal();
  }

  // ===== History (เต็มหน้า) =====
  goHistory(emp?: Employee) {
    this.historyFilter = { employeeId: emp?.id ?? '', q: '' };
    this.page = 1;
    this.view = 'history';
    this.loadHistory();
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
  }
  backToMain() { this.view = 'main'; }

  onHistoryFilterChange() {
    this.page = 1;
    this.loadHistory();
  }

  async loadHistory() {
    this.loadingCalls = true;
    try {
      const res: any = await firstValueFrom(this.callSvc.list({
        employeeId: this.historyFilter.employeeId || undefined,
        q: this.historyFilter.q || undefined,
        page: this.page,
        pageSize: this.pageSize
      }));

      this.calls = res?.items ?? [];

      if (typeof res?.total === 'number') {
        this.totalKnown = true;
        this.total = res.total;
        this.totalPages = Math.max(1, Math.ceil(this.total / this.pageSize));
        this.hasNext = this.page < this.totalPages;
      } else {
        this.totalKnown = false;
        this.totalPages = 1;
        this.hasNext = this.calls.length === this.pageSize;
      }
    } catch (e) {
      console.error(e);
      this.calls = [];
      this.totalKnown = false;
      this.hasNext = false;
    } finally {
      this.loadingCalls = false;
    }
  }

  nextPage() {
    if (this.totalKnown) { if (this.page < this.totalPages) { this.page++; this.loadHistory(); } }
    else { if (this.hasNext) { this.page++; this.loadHistory(); } }
  }
  prevPage() { if (this.page > 1) { this.page--; this.loadHistory(); } }

  startEdit(c: EmployeeCall) {
    this.editId = c.id;
    this.editBuf = {
      employeeId: c.employee_id,
      callDate: (c.call_date || '').slice(0, 10),
      message: c.message,
    };
  }
  cancelEdit() {
    this.editId = null;
    this.editBuf = { employeeId: '', callDate: '', message: '' };
  }
  async saveEdit(c: EmployeeCall) {
    if (!this.editId) return;
    const body: any = {};
    if (this.editBuf.employeeId) body.employeeId = this.editBuf.employeeId;
    if (this.editBuf.callDate) body.callDate = this.editBuf.callDate;
    body.message = this.editBuf.message ?? '';
    const updated = await firstValueFrom(this.callSvc.update(this.editId, body));
    const idx = this.calls.findIndex(x => x.id === c.id);
    if (idx >= 0) this.calls[idx] = updated as EmployeeCall;
    this.cancelEdit();
  }
  async removeCall(c: EmployeeCall) {
    if (!confirm('ลบรายการนี้ใช่หรือไม่?')) return;
    await firstValueFrom(this.callSvc.delete(c.id));
    this.calls = this.calls.filter(x => x.id !== c.id);
  }

  trackCall(_i: number, c: EmployeeCall) { return c.id; }
  empName(id?: string) {
    if (!id) return '';
    const e = this.employees.find(x => x.id === id);
    return e ? `${e.firstName ?? ''} ${e.lastName ?? ''}`.trim() : '';
  }

  // ===== Helpers =====
  private buildAssignDescription(a = this.assign): string {
    const date = a.date || '-';
    const time = a.time ? `${a.time} น.` : '--:-- น.';
    const where = a.where || '-';
    const note  = a.note?.trim() ? a.note.trim() : '-';
    const title = a.title || '-';
    return `งาน: ${title} • เวลา: ${time}  ${date} • สถานที่: ${where} • หมายเหตุ: ${note}`;
  }
}
