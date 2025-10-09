// src/app/services/auth.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { Router } from '@angular/router';

export interface Staff {
  staff_id: number;
  username: string;
  name?: string | null;
  role: string;
  profile_image_path?: string | null;
  created_at?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  

  // === แก้ endpoint ตรงนี้ถ้าหลังบ้านใช้ path อื่น ===
  private readonly LOGIN_PATH = '/api/auth/login'; // ถ้า backend เดิมเป็น /api/staff/login ให้เปลี่ยนตรงนี้
  private readonly ME_PATH    = '/api/auth/me';     // fallback จะลอง /api/auth/profile ให้อัตโนมัติด้านล่าง
  private readonly PHOTO_UPLOAD_PATH = '/api/auth/me/photo'; 

  private readonly TOKEN_KEY = 'token';
  private readonly USER_KEY  = 'staff';

  private readonly UPDATE_ME_PATH = '/api/auth/me';

  private authHeaders(): HttpHeaders {
  const t = this.token;
  return t ? new HttpHeaders({ Authorization: `Bearer ${t}` }) : new HttpHeaders();
}


  private staffSub = new BehaviorSubject<Staff | null>(null);
  public  staff$   = this.staffSub.asObservable();

  public currentUser$ = this.staff$;

  // ===== Utils =====
/** รองรับหลายรูปแบบที่ backend อาจส่งคืนมา */
// ในคลาส AuthService
private normalizeLoginResponse(res: any): { token?: string; staff?: Staff; message?: string } {
  if (!res) return {};
  if (res.token && res.staff) return { token: res.token, staff: res.staff, message: res.message };
  if (res.success && (res.user || res.staff)) return { token: res.token, staff: res.user || res.staff, message: res.message };
  if (res.access_token && res.user) return { token: res.access_token, staff: res.user, message: res.message };
  return {};
}



  constructor() {
    // โหลด session จาก localStorage
    const token = localStorage.getItem(this.TOKEN_KEY);
    const raw   = localStorage.getItem(this.USER_KEY);
    if (token && raw) {
      try { this.staffSub.next(JSON.parse(raw)); }
      catch { this.clearSession(); }
    }
  }

  // ===== Session helpers =====
  get token(): string | null { return localStorage.getItem(this.TOKEN_KEY); }


  

  private setSession(token: string, staff: Staff) {
    localStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem(this.USER_KEY, JSON.stringify(staff));
    this.staffSub.next(staff);
  }

  clearSession() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    this.staffSub.next(null);
  }

  logout() {
    this.clearSession();
    this.router.navigate(['/login']);
  }

  isLoggedIn(): boolean { return !!this.token; }
  hasRole(role: string): boolean { return !!this.staffSub.value && this.staffSub.value.role === role; }
  isAdmin(): boolean { return this.hasRole('admin'); }

  // ===== Auth calls =====
async login(username: string, password: string): Promise<Staff> {
  const res = await firstValueFrom(
    this.http.post<any>(this.LOGIN_PATH, { username, password })
  );
  const norm = this.normalizeLoginResponse(res);
  if (!norm.token || !norm.staff) throw new Error('Invalid login response');
  this.setSession(norm.token, norm.staff);
  return norm.staff;
}

 // ✅ ใช้ header ทุกครั้งที่เรียก endpoint ที่ requireAuth

async fetchMe(): Promise<Staff> {
  try {
    const res = await firstValueFrom(
      this.http.get<{ staff: Staff }>(this.ME_PATH, { headers: this.authHeaders() })
    );
    this.staffSub.next(res.staff);
    localStorage.setItem(this.USER_KEY, JSON.stringify(res.staff));
    return res.staff;
  } catch (err: any) {
    if (err?.status === 401) this.clearSession();
    throw err;
  }
}


changePassword(oldPassword: string, newPassword: string) {
  return this.http.post(
    '/api/auth/change-password',
    { oldPassword, newPassword },
    { headers: this.authHeaders() }                  // 👈 เพิ่ม
  ).pipe(
    catchError(error => {
      console.error('Change password error:', error);
      return of({ success: false, message: error?.error?.message || 'เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน' });
    })
  );
}

uploadProfilePhoto(file: File) {
  const form = new FormData();
  form.append('photo', file);
  return this.http.post<{ ok?: boolean; path?: string; url?: string; staff?: Staff }>(
    this.PHOTO_UPLOAD_PATH,
    form,
    { headers: this.authHeaders() }                  // 👈 เพิ่ม (อย่า set Content-Type เอง)
  ).pipe(
    map(res => {
      const newSrc = res?.url || res?.path;
      if (res.staff) {
        this.staffSub.next(res.staff);
        localStorage.setItem(this.USER_KEY, JSON.stringify(res.staff));
      } else if (newSrc && this.staffSub.value) {
        const updated = { ...this.staffSub.value, profile_image_path: newSrc };
        this.staffSub.next(updated);
        localStorage.setItem(this.USER_KEY, JSON.stringify(updated));
      }
      return res;
    })
  );
}

updateProfile(payload: Partial<Pick<Staff,'name'|'username'|'role'>>) {
  return this.http.put<{ staff: Staff }>(
    this.UPDATE_ME_PATH,
    payload,
    { headers: this.authHeaders() }                  // 👈 เพิ่ม
  ).pipe(
    map(res => {
      const staff = res.staff;
      this.staffSub.next(staff);
      localStorage.setItem(this.USER_KEY, JSON.stringify(staff));
      return staff;
    })
  );
}


}
