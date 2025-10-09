import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { AuthService, Staff } from './auth.service';

export interface StaffListResp { items: Staff[]; total: number; page: number; pageSize: number; }

@Injectable({ providedIn: 'root' })
export class StaffAdminService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private BASE = '/api/staff';

  private headers(): HttpHeaders {
    const t = this.auth.token;
    return t ? new HttpHeaders({ Authorization: `Bearer ${t}` }) : new HttpHeaders();
  }

  list(q = '', page = 1, pageSize = 50): Observable<StaffListResp> {
    const params = { q, page, pageSize } as any;
    return this.http.get<StaffListResp>(this.BASE, { headers: this.headers(), params });
  }

  create(payload: { username: string; name?: string; role: string; password: string }): Observable<Staff> {
    return this.http.post<{ staff: Staff }>(this.BASE, payload, { headers: this.headers() })
      .pipe(map(r => r.staff));
  }

  update(id: number, payload: Partial<{ username: string; name: string; role: string; password: string }>): Observable<Staff> {
    return this.http.put<{ staff: Staff }>(`${this.BASE}/${id}`, payload, { headers: this.headers() })
      .pipe(map(r => r.staff));
  }

  remove(id: number) {
    return this.http.delete<{ success: boolean }>(`${this.BASE}/${id}`, { headers: this.headers() });
  }
}
