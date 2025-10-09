import { inject } from '@angular/core';
import { CanActivateChildFn, Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

const checkAuth = async (stateUrl: string) => {
  const router = inject(Router);
  const auth = inject(AuthService);
  const token = auth.token || localStorage.getItem('token');

  if (!token) {
    router.navigate(['/login'], { queryParams: { returnUrl: stateUrl } });
    return false;
  }
  try {
    await auth.fetchMe(); // โหลดโปรไฟล์จาก token เมื่อรีเฟรช
    return true;
  } catch {
    auth.clearSession();
    router.navigate(['/login'], { queryParams: { returnUrl: stateUrl } });
    return false;
  }
};

export const authGuard: CanActivateChildFn & CanActivateFn = (route, state) => {
  return checkAuth(state.url);
};
