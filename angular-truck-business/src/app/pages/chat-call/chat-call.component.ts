// frontend component: chat-call.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { JobAssignmentService } from '../../services/job-assignment.service';

import { LineTaskService, LineTaskPayload } from '../../services/line-task.service';
import { EmployeeCallService, EmployeeCall } from '../../services/employee-call.service';
import { EmployeeService, Employee } from '../../services/employee.service';

type TimelineMsg = { role: 'me' | 'bot'; text: string; ts: string };
type ViewMode = 'compose' | 'history';
type Availability = Record<string, 'FREE'|'PENDING'|'IN_PROGRESS'>;

@Component({
  standalone: true,
  selector: 'app-chat-call',
  templateUrl: './chat-call.component.html',
  styleUrls: ['./chat-call.component.css'],
  imports: [CommonModule, FormsModule, HttpClientModule],
})
export class ChatCallComponent implements OnInit {

  // ===== AVAILABILITY =====
  avail: Availability = {};

  // ===== VIEW =====
  view: ViewMode = 'compose';

  // ===== FORM (compose) =====
  form = { title: '', employeeId: '', date: '', time: '', where: '', note: '' };

  // ===== DATA =====
  employees: Employee[] = [];

  // ===== PREVIEW/SEND =====
  previewVisible = false;
  previewText = '';
  canConfirm = false;
  sending = false;
  successBanner = false;
  errorBanner = '';
  lastPayload: LineTaskPayload | null = null;

  // ===== TIMELINE =====
  messages: TimelineMsg[] = [];

  // ===== HISTORY + paging =====
  historyFilter = { employeeId: '', q: '' };
  calls: EmployeeCall[] = [];
  loadingCalls = false;
  page = 1;
  pageSize = 10;
  total = 0;
  totalPages = 1;
  totalKnown = false;
  hasNext = false;

  // ===== EDIT MODAL STATE =====
  showEditModal = false;
  savingEdit = false;
  editing: EmployeeCall | null = null;
  editForm: { employeeId: string; callDate: string; message: string } = {
    employeeId: '',
    callDate: '',
    message: '',
  };

  // ===== DELETE MODAL STATE =====
  showDeleteModal = false;
  deleting = false;
  deletingTarget: EmployeeCall | null = null;

  constructor(
    private lineSvc: LineTaskService,
    private callSvc: EmployeeCallService,
    private empSvc: EmployeeService,
    private jobSvc: JobAssignmentService
  ) {}

  /** helper: YYYY-MM-DD (ตามเวลาเครื่องผู้ใช้/เบราว์เซอร์) */
  private todayYMDLocal(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  async ngOnInit(): Promise<void> {
    this.add('bot', 'ขั้นตอน: กรอกฟอร์ม → “สร้างตัวอย่างด้านล่าง” → “ยืนยันส่งไป LINE”');
    try { this.employees = await firstValueFrom(this.empSvc.getAll()); } catch {}

    // โหลดความพร้อมวันนี้ (ใช้วันที่ local ไม่ใช่ toISOString)
    const today = this.todayYMDLocal();
    try {
      const rows: any = await firstValueFrom(this.jobSvc.byDate(today));
      this.avail = {};
      (rows || []).forEach((r: any) => this.avail[r.employee_id] = r.status);
    } catch {}
  }

  isUnavailable(id: string) {
    const s = this.avail[id];
    return s === 'PENDING' || s === 'IN_PROGRESS';
  }

  /* ===== Compose ===== */
  buildPreview() {
    this.clearBanners();
    const { title, date, time } = this.form;
    const where = this.form.where.trim();
    const note  = this.form.note.trim();
    const employeeId = this.form.employeeId || '';

    if (!title.trim() || !date || !time || !where) {
      this.errorBanner = 'กรุณากรอกข้อมูลที่มี * ให้ครบ';
      this.previewVisible = false;
      this.canConfirm = false;
      return;
    }
    if (employeeId && this.isUnavailable(employeeId)) {
      this.errorBanner = 'พนักงานคนนี้มีงานค้าง/กำลังทำอยู่ ไม่สามารถสั่งงานซ้อนได้';
      this.previewVisible = false;
      this.canConfirm = false;
      return;
    }

    const when = this.toThaiDDMMYYYYWithPeriod(date, time);
    const empName = this.getEmpName(employeeId);
    const text = this.buildPlain(title.trim(), when, where, note, empName, employeeId);

    this.previewVisible = true;
    this.previewText = text;

    this.lastPayload = {
      title: title.trim(),
      when,
      where,
      note: note || undefined,
      date,
      employeeId: employeeId || undefined,
    };

    this.canConfirm = true;
    this.add('me', text);
  }

  async confirmSend() {
    if (!this.lastPayload) return;
    this.clearBanners();
    this.sending = true;
    try {
      const res = await firstValueFrom(this.lineSvc.sendTask(this.lastPayload));
      if ((res as any)?.error) throw new Error((res as any).error);
      this.successBanner = true;
      this.add('bot', 'ส่งสำเร็จ ✓');
    } catch (err: any) {
      this.errorBanner = 'ผิดพลาด: ' + (err?.message || 'ส่งไม่สำเร็จ');
    } finally {
      this.sending = false;
    }
  }

  /* ===== View switching ===== */
  backToCompose() { this.view = 'compose'; }
  goHistory() {
    this.view = 'history';
    this.page = 1;
    this.loadHistory();
  }

  onFilterChange() {
    this.page = 1;
       this.loadHistory();
  }

  /* ===== Load history ===== */
  async loadHistory() {
    this.loadingCalls = true;
    try {
      const res: any = await firstValueFrom(this.callSvc.list({
        employeeId: this.historyFilter.employeeId || undefined,
        q: this.historyFilter.q || undefined,
        page: this.page,
        pageSize: this.pageSize,
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
    } catch {
      this.calls = [];
      this.totalKnown = false;
      this.hasNext = false;
    } finally {
      this.loadingCalls = false;
    }
  }

  nextPage() {
    if (this.totalKnown) {
      if (this.page < this.totalPages) { this.page++; this.loadHistory(); }
    } else {
      if (this.hasNext) { this.page++; this.loadHistory(); }
    }
  }
  prevPage() {
    if (this.page > 1) { this.page--; this.loadHistory(); }
  }

  /* ===== Edit Modal ===== */
  openEditModal(c: EmployeeCall) {
    this.editing = c;
    this.editForm = {
      employeeId: c.employee_id,
      callDate: (c.call_date || '').slice(0, 10),
      message: c.message ?? '',
    };
    this.showEditModal = true;
  }
  closeEditModal() {
    this.showEditModal = false;
    this.savingEdit = false;
    this.editing = null;
  }
  async saveEditModal() {
    if (!this.editing) return;
    this.savingEdit = true;
    try {
      const body: any = {
        employeeId: this.editForm.employeeId || undefined,
        callDate: this.editForm.callDate || undefined,
        message: this.editForm.message ?? '',
      };
      const updated = await firstValueFrom(this.callSvc.update(this.editing.id, body));
      const idx = this.calls.findIndex(x => x.id === this.editing!.id);
      if (idx >= 0) this.calls[idx] = updated as EmployeeCall;
      this.closeEditModal();
    } catch {
      this.savingEdit = false;
    }
  }

  /* ===== Delete Modal ===== */
  openDeleteModal(c: EmployeeCall) {
    this.deletingTarget = c;
    this.showDeleteModal = true;
  }
  closeDeleteModal() {
    this.showDeleteModal = false;
    this.deleting = false;
    this.deletingTarget = null;
  }
  async confirmDelete() {
    if (!this.deletingTarget) return;
    this.deleting = true;
    try {
      await firstValueFrom(this.callSvc.delete(this.deletingTarget.id));
      this.calls = this.calls.filter(x => x.id !== this.deletingTarget!.id);
      this.closeDeleteModal();
    } catch {
      this.deleting = false;
    }
  }

  /* ===== Utils ===== */
  private clearBanners() { this.successBanner = false; this.errorBanner = ''; }
  private add(role: 'me' | 'bot', text: string) {
    this.messages.push({ role, text, ts: new Date().toISOString() });
    setTimeout(() => {
      const el = document.getElementById('timeline-scroll');
      el?.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }, 0);
  }
  private thaiPeriod(h: number) {
    if (h >= 5 && h <= 11) return 'เช้า';
    if (h >= 12 && h <= 15) return 'บ่าย';
    if (h >= 16 && h <= 18) return 'เย็น';
    if (h >= 19 || h <= 3) return 'กลางคืน';
    return 'ดึก';
  }
  private toThaiDDMMYYYYWithPeriod(dateStr: string, timeStr: string) {
    const [y, m, d] = dateStr.split('-').map(v => parseInt(v, 10));
    const [hh, mm] = timeStr.slice(0, 5).split(':').map(v => parseInt(v, 10));
    const period = this.thaiPeriod(hh);
    const dd = String(d).padStart(2, '0');
    const MM = String(m).padStart(2, '0');
    const yyyy = String(y);
    const hhmm = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
    return `${period} ${hhmm} น. ${dd}/${MM}/${yyyy}`;
  }
  private getEmpName(id?: string) {
    if (!id) return '';
    return this.employees.find(e => e.id === id)?.name || '';
  }
  private buildPlain(title: string, whenStr: string, where: string, note?: string, empName?: string, empId?: string) {
    const lines = [];
    if (empName) lines.push(`พนักงาน: ${empName}${empId ? ` (${empId})` : ''}`);
    lines.push(`งาน: ${title}`);
    lines.push(`เวลา: ${whenStr}`);
    lines.push(`สถานที่: ${where}`);
    if (note && note.trim()) lines.push(`หมายเหตุ: ${note.trim()}`);
    return lines.join('\n');
  }
}
