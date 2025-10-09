// src/app/services/job-assignment.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

export type TodayAssignment = {
  id: string;
  employee_id: string;
  job_description: string;
  assigned_date: string;
  source: 'LINE' | 'MANUAL' | string | null;
  accepted_at: string | null;

  completed_at: string | null;
  completed_by?: number | null;
  completed_note?: string | null;
};



type ByDateRow = { employee_id: string; assignment: TodayAssignment | null };
type AcceptResp = { ok: boolean; updated: TodayAssignment };
type CompleteResp = { ok: boolean; job: TodayAssignment };

@Injectable({ providedIn: 'root' })
export class JobAssignmentService {
  private base = '/api/job-assignments';

  constructor(private http: HttpClient) {}

  /** งานล่าสุดของแต่ละพนักงานในวันนั้น */
  byDate(date: string) {
    const params = new HttpParams().set('date', date);
    return this.http.get<ByDateRow[]>(`${this.base}/by-date`, { params });
  }

  /** ประวัติงานของพนักงาน (ช่วงวันที่) */
  history(employeeId: string, from?: string, to?: string) {
    let params = new HttpParams();
    if (from) params = params.set('from', from);
    if (to) params = params.set('to', to);
    return this.http.get<TodayAssignment[]>(`${this.base}/employee/${employeeId}/history`, { params });
  }

  /** สร้างงานใหม่ */
  create(data: { employeeId: string; description: string; assignedDate: string; source?: string }) {
    return this.http.post<TodayAssignment>(this.base, {
      employeeId: data.employeeId,
      description: data.description,
      assignedDate: data.assignedDate,
      source: data.source ?? 'MANUAL',
    });
  }

  /** อัปเดตงาน */
  update(
    id: string,
    patch: Partial<{
      employeeId: string;
      description: string;
      assignedDate: string;
      source: string;
      accepted_at: string | null;
      completed_at: string | null;
    }>
  ) {
    return this.http.put<TodayAssignment>(`${this.base}/${id}`, patch);
  }

  /** ลบงาน */
  delete(id: string) {
    return this.http.delete<{ ok: true }>(`${this.base}/${id}`);
  }

  /** ตั้งสถานะ "รับงาน" โดยอ้างอิง id งาน */
  acceptById(id: string) {
    return this.http.post<AcceptResp>(`${this.base}/${id}/accept`, {});
  }

  /** ตั้งสถานะ "รับงาน" สำหรับงานล่าสุดของวันนั้น (ของพนักงาน) */
  acceptLatest(employeeId: string, date?: string) {
    return this.http.post<AcceptResp>(`${this.base}/accept`, { employeeId, date });
  }

  /** ✅ ปิดงาน (บันทึก completed_at) */
  completeById(id: string, note?: string, staffId?: number) {
    return this.http.patch<CompleteResp>(`${this.base}/${id}/complete`, { note, staffId });
  }

  /** ✅ ย้อนสถานะงาน (ลบ completed_at) */
  reopenById(id: string) {
    return this.http.patch<CompleteResp>(`${this.base}/${id}/reopen`, {});
  }
}
