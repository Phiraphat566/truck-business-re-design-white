import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export type EmployeeCall = {
  id: number;
  employee_id: string;
  call_date: string;  // ISO (date-only ok)
  message: string;
  created_at?: string;
  Employee?: { id: string; name: string; position?: string };
};

export type EmployeeCallList = {
  items: EmployeeCall[];
  total: number;
  page: number;
  pageSize: number;
};

@Injectable({ providedIn: 'root' })
export class EmployeeCallService {
  private base = '/api/employee-calls';

  constructor(private http: HttpClient) {}

  list(params: { employeeId?: string; q?: string; from?: string; to?: string; page?: number; pageSize?: number }): Observable<EmployeeCallList> {
    let p = new HttpParams();
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') p = p.set(k, String(v));
    });
    return this.http.get<EmployeeCallList>(this.base, { params: p });
  }

  create(body: { employeeId: string; callDate: string; message: string }) {
    return this.http.post<EmployeeCall>(this.base, body);
  }

  update(id: number, body: Partial<{ employeeId: string; callDate: string; message: string }>) {
    return this.http.put<EmployeeCall>(`${this.base}/${id}`, body);
  }

  delete(id: number) {
    return this.http.delete<{ ok: boolean }>(`${this.base}/${id}`);
  }
}
