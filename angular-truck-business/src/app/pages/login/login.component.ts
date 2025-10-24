import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { Router, ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';

@Component({
  standalone: true,
  selector: 'app-login',
  templateUrl: './login.component.html',
  imports: [CommonModule, FormsModule, HttpClientModule],
})
export class LoginComponent implements OnInit {
  username = '';
  password = '';
  remember = true;
  showPassword = false;

  // โหมดเข้าสู่ระบบ: ปกติ / กู้คืน
  mode: 'normal' | 'recovery' = 'normal';
  recoveryCode = '';

  loading = false;
  error = '';

  currentYear = new Date().getFullYear();

  constructor(
    private http: HttpClient,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    const token = localStorage.getItem('token');
    if (token) this.router.navigate(['/general']);
  }

  toggleShow() {
    this.showPassword = !this.showPassword;
  }

  toggleMode() {
    this.mode = this.mode === 'normal' ? 'recovery' : 'normal';
    this.error = '';
    // เคลียร์ฟิลด์อีกโหมดกันสับสน
    if (this.mode === 'normal') this.recoveryCode = '';
    else this.password = '';
  }

  async login() {
    if (!this.username) return;
    if (this.mode === 'normal' && !this.password) return;
    if (this.mode === 'recovery' && !this.recoveryCode) return;

    this.loading = true;
    this.error = '';
    try {
      let res: { token: string };

      if (this.mode === 'normal') {
        res = await firstValueFrom(
          this.http.post<{ token: string }>(
            '/api/auth/login',
            { username: this.username, password: this.password }
          )
        );
      } else {
        // ล็อกอินด้วยรหัสกู้คืน
        res = await firstValueFrom(
          this.http.post<{ token: string }>(
            '/api/auth/recovery/login',
            { username: this.username, code: this.recoveryCode }
          )
        );
      }

      localStorage.setItem('token', res.token);

      // ถ้าเป็นโหมดกู้คืน ให้เด้งไปหน้าตั้งรหัสใหม่ทันที
      const returnUrl =
  this.route.snapshot.queryParamMap.get('returnUrl') || '/general';

this.router.navigate([returnUrl], { replaceUrl: true });

      this.router.navigate([returnUrl], { replaceUrl: true });
    } catch (err: any) {
      this.error = err?.error?.message || 'เข้าสู่ระบบไม่สำเร็จ';
    } finally {
      this.loading = false;
    }
  }
}
