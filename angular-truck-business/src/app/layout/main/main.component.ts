import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { AuthService, Staff } from '../../services/auth.service';
import { Observable, Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';

type MenuItem = { label: string; icon: string; path: string; key?: string; roles?: string[] };

@Component({
  selector: 'app-main',
  templateUrl: './main.component.html',
  styleUrls: ['./main.component.css'],
})
export class MainComponent implements OnInit, OnDestroy {
  // ยังเคารพธีมเดิมของระบบ (ไม่มีปุ่มสลับแล้ว)
  isDark = true;

  // โหมดย่อถาวร + กางชั่วคราวเมื่อ hover (peek)
  isCollapsed = false;
  private isPeek = false;
  get expanded() { return !this.isCollapsed || this.isPeek; }

  showMobileMenu = false;
  showLogoutConfirm = false;

  user$: Observable<Staff | null> = this.auth.currentUser$;
  avatarFallback = false;
  currentRole?: string;

  // 👇 เมนูอยู่ "ภายในคลาส" เท่านั้น
  menu: MenuItem[] = [
    { label: 'General',            icon: 'grid',     path: '/general' },
    { label: 'Time in / Time out', icon: 'clock',    path: '/time-in-out' },
    { label: 'Employee',           icon: 'user',     path: '/employee' },
    { label: 'Billing',            icon: 'coins',    path: '/billing' },
    { label: 'Income',             icon: 'calendar', path: '/income' },
    { label: 'Truck Detail',       icon: 'truck',    path: '/truck-detail' },
    { label: 'Chat Call',          icon: 'phone',    path: '/chat-call' },
  ];

  private sub?: Subscription;

  constructor(public router: Router, public auth: AuthService) {}

  ngOnInit() {
    const savedTheme = localStorage.getItem('theme');
    this.isDark = savedTheme ? savedTheme === 'dark' : true;
    document.documentElement.classList.toggle('dark', this.isDark);

    this.isCollapsed = localStorage.getItem('sidebarCollapsed') === '1';

    if (this.auth.isLoggedIn()) this.auth.fetchMe().catch(() => {});
    this.user$.subscribe(u => {
      this.avatarFallback = !u?.profile_image_path;
      this.currentRole = (u as any)?.role || undefined;
    });

    this.sub = this.router.events.pipe(filter(e => e instanceof NavigationEnd))
      .subscribe((e: any) => {
        const url = e.urlAfterRedirects || e.url;
        localStorage.setItem('lastRoute', url);
        const active = this.menu.find(m => this.router.isActive(m.path, false));
        if (active) document.title = `${active.label} · Truck Business`;
      });

    if (this.router.url === '/') {
      const last = localStorage.getItem('lastRoute');
      if (last) this.router.navigateByUrl(last);
    }
  }

  ngOnDestroy() { this.sub?.unsubscribe(); }

  // Hover expand
  startPeek() { if (this.isCollapsed) this.isPeek = true; }
  endPeek()   { if (this.isCollapsed) this.isPeek = false; }

  // Actions
  toggleSidebar() {
    this.isCollapsed = !this.isCollapsed;
    if (!this.isCollapsed) this.isPeek = false;
    localStorage.setItem('sidebarCollapsed', this.isCollapsed ? '1' : '0');
  }
  openMobile() { this.showMobileMenu = true; }
  closeMobile() { this.showMobileMenu = false; }
  confirmLogout() { this.showLogoutConfirm = true; }
  doLogout() { this.showLogoutConfirm = false; this.logout(); }
  logout() {
    this.auth.clearSession();
    this.router.navigate(['/login'], { replaceUrl: true });
  }
  goProfile() { this.router.navigate(['/profile']); }
  useFallback() { this.avatarFallback = true; }

  initial(u: Staff | null): string {
    const ch = (u?.name?.[0] || u?.username?.[0] || 'U');
    return ch.toUpperCase();
  }

  filteredMenu(): MenuItem[] {
    const role = this.currentRole;
    return this.menu.filter(m => !m.roles || (role && m.roles.includes(role)));
  }

  navigateTo(path: string) {
    this.router.navigate([path]);
    this.closeMobile();
  }

  @HostListener('window:keydown', ['$event'])
  onKeydown(ev: KeyboardEvent) {
    const ctrl = ev.ctrlKey || ev.metaKey;
    const key = ev.key.toLowerCase();
    if (ctrl && key === 'b') { ev.preventDefault(); this.toggleSidebar(); }
    if (key === 'escape') { this.closeMobile(); this.showLogoutConfirm = false; }
  }
}
