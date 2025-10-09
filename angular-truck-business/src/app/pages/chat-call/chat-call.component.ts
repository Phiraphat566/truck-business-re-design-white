import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { LineTaskService, LineTaskPayload } from '../../services/line-task.service';
import { EmployeeCallService, EmployeeCall } from '../../services/employee-call.service';
import { EmployeeService, Employee } from '../../services/employee.service';

type TimelineMsg = { role: 'me' | 'bot'; text: string; ts: string };
type ViewMode = 'compose' | 'history';

@Component({
  standalone: true,
  selector: 'app-chat-call',
  templateUrl: './chat-call.component.html',
  styleUrls: ['./chat-call.component.css'],
  imports: [CommonModule, FormsModule, HttpClientModule],
})
export class ChatCallComponent implements OnInit {
  // ===== THEME =====
  isDark = false;
  toggleTheme() { this.isDark = !this.isDark; }

  // ===== VIEW =====
  view: ViewMode = 'compose';

  // ===== FORM =====
  form = { title: '', employeeId: '', date: '', time: '', where: '', note: '' };

  // ===== EMPLOYEES =====
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

  // ===== HISTORY (ทั้งหมด + แบ่งหน้า) =====
  historyFilter = { employeeId: '', q: '' };
  calls: EmployeeCall[] = [];
  loadingCalls = false;

  // pagination state (10/หน้า)
  page = 1;
  pageSize = 10;
  total = 0;
  totalPages = 1;
  totalKnown = false;      // true ถ้า API คืน total
  hasNext = false;         // ใช้ปิดปุ่ม "ถัดไป" เมื่อไม่รู้ total

  // แก้ไขแถว
  editId: number | null = null;
  editBuf: { employeeId: string; callDate: string; message: string } = { employeeId: '', callDate: '', message: '' };

  constructor(
    private lineSvc: LineTaskService,
    private callSvc: EmployeeCallService,
    private empSvc: EmployeeService
  ) {}

  async ngOnInit(): Promise<void> {
    this.add('bot', 'ขั้นตอน: กรอกฟอร์ม → “สร้างตัวอย่างด้านล่าง” → “ยืนยันส่งไป LINE”');
    try { this.employees = await firstValueFrom(this.empSvc.getAll()); } catch {}
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

  /* ===== Load history (ทั้งหมด) ===== */
  async loadHistory() {
    this.loadingCalls = true;
    try {
      const res: any = await firstValueFrom(this.callSvc.list({
        employeeId: this.historyFilter.employeeId || undefined,
        q: this.historyFilter.q || undefined,
        page: this.page,
        pageSize: this.pageSize,
        // ไม่ส่ง from/to = ดึงทั้งหมด (ขึ้นกับ backend ของคุณ)
      }));

      this.calls = res?.items ?? [];

      if (typeof res?.total === 'number') {
        this.totalKnown = true;
        this.total = res.total;
        this.totalPages = Math.max(1, Math.ceil(this.total / this.pageSize));
        this.hasNext = this.page < this.totalPages;
      } else {
        // ถ้า API ไม่ได้คืน total มาก็ใช้ heuristic:
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

  /* ===== Row edit/delete ===== */
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
