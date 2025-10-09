import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MainComponent } from './layout/main/main.component';
import { authGuard } from './guards/auth.guard'; // ปรับ path ให้ตรงของคุณ

const routes: Routes = [
  // หน้าแรกของแอป → login เสมอ
  { path: '', redirectTo: 'login', pathMatch: 'full' },

  // หน้า Login (อยู่นอก layout)
  { path: 'login', loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent) },

  // โซนด้านในทั้งหมด → ต้องล็อกอินก่อน
  {
    path: '',
    component: MainComponent,
    canActivate: [authGuard],        // กันเข้าทั้งโหนด
    canActivateChild: [authGuard],   // กันทุกหน้าลูก
    children: [
      // หน้าแรก "ด้านใน" (หลังล็อกอิน) → general
      { path: '', redirectTo: 'general', pathMatch: 'full' },
      { path: 'general',      loadComponent: () => import('./pages/general/general.component').then(m => m.GeneralComponent) },
      { path: 'time-in-out',  loadComponent: () => import('./pages/time-in-out/time-in-out.component').then(m => m.TimeInOutComponent) },
      { path: 'employee',     loadComponent: () => import('./pages/employee/employee.component').then(m => m.EmployeeComponent) },
      { path: 'billing',      loadComponent: () => import('./pages/billing/billing.component').then(m => m.BillingComponent) },
      { path: 'income',       loadComponent: () => import('./pages/income/income.component').then(m => m.IncomeComponent) },
      { path: 'truck-detail', loadComponent: () => import('./pages/truck-detail/truck-detail.component').then(m => m.TruckDetailComponent) },
      { path: 'chat-call',    loadComponent: () => import('./pages/chat-call/chat-call.component').then(m => m.ChatCallComponent) },
      { path: 'profile',      loadComponent: () => import('./pages/profile/profile.component').then(m => m.ProfileComponent) },
    ]
  },

  // route ไหนไม่ตรงเลย → กลับ login
  { path: '**', redirectTo: 'login' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { scrollPositionRestoration: 'enabled' })],
  exports: [RouterModule]
})
export class AppRoutingModule {}
