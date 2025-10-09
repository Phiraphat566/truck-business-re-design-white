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

  loading = false;
  error = '';

  currentYear = new Date().getFullYear();

  constructor(
    private http: HttpClient,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    // ถ้ามี token อยู่แล้ว ให้เข้าแอปเลย
    const token = localStorage.getItem('token');
    if (token) this.router.navigate(['/general']);
  }

  toggleShow() {
    this.showPassword = !this.showPassword;
  }

async login() {
  if (!this.username || !this.password) return;

  this.loading = true;
  this.error = '';
  try {
    // เรียก backend จริง (เปลี่ยน path ให้ตรงของคุณ ถ้าไม่ได้ใช้ proxy)
    const res = await firstValueFrom(
      this.http.post<{ token: string }>(
        '/api/auth/login',
        { username: this.username, password: this.password }
      )
    );

    // ได้ JWT จริงจาก backend
    localStorage.setItem('token', res.token);

    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/general';
    this.router.navigate([returnUrl], { replaceUrl: true });
  } catch (err: any) {
    this.error = err?.error?.message || 'เข้าสู่ระบบไม่สำเร็จ';
  } finally {
    this.loading = false;
  }
}

}
