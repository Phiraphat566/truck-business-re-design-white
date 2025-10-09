import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService, Staff } from '../../services/auth.service';
import { StaffAdminService } from '../../services/staff-admin.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css']
})
export class ProfileComponent implements OnInit {
  // ===== โปรไฟล์ของผู้ใช้ปัจจุบัน =====
  currentUser: Staff | null = null;

  isEditing = false;
  editForm = { name: '', username: '', role: '' };

  pw = { oldPassword: '', newPassword: '', confirm: '' };

  // ===== อัปโหลดรูป =====
  uploading = false;
  error = '';

  // ===== แผงจัดการ Staff (สำหรับ admin) =====
  showStaffAdmin = false;            // เปิด/ปิดแผง
  saLoading = false;
  saQuery = '';
  saItems: Staff[] = [];
  saTotal = 0;
  saPage = 1;
  saPageSize = 50;

  saNew = { username: '', name: '', role: 'staff', password: '' };
  saEditingId: number | null = null;
  saEdit: Record<number, { username: string; name: string; role: string; password: string }> = {};

  constructor(
    private authService: AuthService,
    private router: Router,
    private staffAdmin: StaffAdminService
  ) {}

  ngOnInit() {
    this.authService.staff$.subscribe((user) => {
      this.currentUser = user;
      if (user) {
        this.editForm = {
          name: user.name ?? '',
          username: user.username ?? '',
          role: user.role ?? ''
        };
      }
    });

    if (!this.currentUser && this.authService.token) {
      this.authService.fetchMe().catch(() => {});
    }
  }

  // ===== โปรไฟล์ =====
  toggleEdit() {
    this.isEditing = !this.isEditing;
    if (!this.isEditing && this.currentUser) {
      this.editForm = {
        name: this.currentUser.name ?? '',
        username: this.currentUser.username ?? '',
        role: this.currentUser.role ?? ''
      };
    }
  }

  saveProfile() {
    const name = this.editForm.name?.trim();
    const username = this.editForm.username?.trim();
    if (!name || !username) return;

    this.authService.updateProfile({ name, username /*, role: this.editForm.role */ })
      .subscribe({
        next: (staff) => {
          this.currentUser = staff;
          this.isEditing = false;
          alert('อัปเดตโปรไฟล์สำเร็จ!');
        },
        error: (err) => alert(err?.error?.message || 'อัปเดตไม่สำเร็จ')
      });
  }

  goBack() { this.router.navigate(['/general']); }

  get userProfileImage(): string {
    return this.currentUser?.profile_image_path || 'assets/profile.jpg';
  }

  openFile(input?: HTMLInputElement) { input?.click(); }

  onFileSelected(evt: Event) {
    const input = evt.target as HTMLInputElement;
    if (!input.files?.length) return;

    const file = input.files[0];
    if (!/^image\//.test(file.type)) { this.error = 'กรุณาเลือกไฟล์รูปภาพ'; input.value=''; return; }
    if (file.size > 5 * 1024 * 1024) { this.error = 'ไฟล์ใหญ่เกิน 5MB'; input.value=''; return; }

    this.uploading = true; this.error = '';
    this.authService.uploadProfilePhoto(file).subscribe({
      next: () => { this.uploading = false; input.value = ''; },
      error: (err) => { this.uploading = false; this.error = err?.error?.message || 'อัปโหลดรูปไม่สำเร็จ'; input.value=''; }
    });
  }

  onImgError(e: Event) { (e.target as HTMLImageElement).src = 'assets/profile.jpg'; }

  changePw() {
    if (!this.pw.oldPassword || !this.pw.newPassword) return alert('กรอกรหัสผ่านเดิมและรหัสผ่านใหม่ให้ครบ');
    if (this.pw.newPassword !== this.pw.confirm) return alert('รหัสผ่านใหม่และยืนยันไม่ตรงกัน');

    this.authService.changePassword(this.pw.oldPassword, this.pw.newPassword)
      .subscribe((res: any) => {
        if (res?.success) {
          alert('เปลี่ยนรหัสผ่านสำเร็จ');
          this.pw = { oldPassword: '', newPassword: '', confirm: '' };
        } else {
          alert(res?.message || 'เปลี่ยนรหัสผ่านไม่สำเร็จ');
        }
      });
  }

  // ===== แผงจัดการ Staff (admin) =====
toggleStaffAdmin() {
  this.showStaffAdmin = !this.showStaffAdmin;
  this.isEditing = false;                 // ปิดโหมดแก้ไขโปรไฟล์ เผื่อเปิดทับกัน
  if (this.showStaffAdmin && this.currentUser?.role === 'admin' && this.saItems.length === 0) {
    this.saLoad();                        // โหลดรายการ staff ครั้งแรก
  }
  // เลื่อนขึ้นบนเล็กน้อยให้เห็นตารางชัด
  if (this.showStaffAdmin) {
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
  }
}


  saLoad() {
    this.saLoading = true;
    this.staffAdmin.list(this.saQuery, this.saPage, this.saPageSize).subscribe({
      next: (r) => { this.saItems = r.items; this.saTotal = r.total; this.saLoading = false; },
      error: () => { this.saLoading = false; }
    });
  }

  saResetNew() { this.saNew = { username: '', name: '', role: 'staff', password: '' }; }

  saCreate() {
    if (!this.saNew.username || !this.saNew.password) return alert('กรอก username/password');
    this.staffAdmin.create(this.saNew).subscribe({
      next: () => { this.saResetNew(); this.saLoad(); },
      error: (e) => alert(e?.error?.message || 'เพิ่มไม่สำเร็จ')
    });
  }

  saStartEdit(s: Staff) {
    this.saEditingId = s.staff_id;
    this.saEdit[s.staff_id] = { username: s.username, name: s.name || '', role: s.role, password: '' };
  }

  saCancelEdit() { this.saEditingId = null; }

  saSaveEdit(id: number) {
    const payload = { ...this.saEdit[id] };
    if (!payload.password) delete (payload as any).password;
    this.staffAdmin.update(id, payload).subscribe({
      next: () => { this.saEditingId = null; this.saLoad(); },
      error: (e) => alert(e?.error?.message || 'บันทึกไม่สำเร็จ')
    });
  }

  saRemove(id: number) {
    if (!confirm('ลบผู้ใช้นี้?')) return;
    this.staffAdmin.remove(id).subscribe({
      next: () => this.saLoad(),
      error: (e) => alert(e?.error?.message || 'ลบไม่สำเร็จ')
    });
  }
}
