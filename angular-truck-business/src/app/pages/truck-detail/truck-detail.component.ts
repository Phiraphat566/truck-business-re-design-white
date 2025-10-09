import { Component, OnInit, OnDestroy } from '@angular/core';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { firstValueFrom, interval, Subscription } from 'rxjs';

/** ====== ชนิดข้อมูลสอดคล้อง DB/API ======
 * Truck: truck_id, plate, model, total_distance, fuel_efficiency_km_per_liter
 * TruckDistanceLog: id, truck_id, log_date, round_number, distance_km
 * FuelLog: id, truck_id, fuel_date, round_number, liters, cost, price_per_liter
 */

type TruckStatus = 'AVAILABLE' | 'ON_JOB' | 'MAINTENANCE' | 'IDLE' | 'OFFLINE';

// (เผื่อบางที่อ้างถึงชื่อเดิม)
type ApiTruckExpense = {
  id: number;
  truck_id: string;
  expense_date: string;          // 'YYYY-MM-DD' หรือ ISO
  description: string | null;
  amount: number;
};

type ApiMaintenance = {
  id: number;
  truck_id: string;
  expense_date: string;
  description: string | null;
  amount: number;
};

type TruckUI = {
  id: string;
  plate: string;
  model?: string | null;
  totalDistance?: number | null;
  efficiencyKmPerL?: number | null;
  imageUrl?: string;
  status?: TruckStatus;
  driver?: { id: string; name: string; phone?: string | null };
};

type ApiTruckBasic = {
  truck_id: string;
  plate: string;
  model: string | null;
  total_distance: number | null;
  fuel_efficiency_km_per_liter: number | null;
};

type ApiTruckWithDriver = ApiTruckBasic & {
  currentDriver?: { id: string; name: string; phone?: string | null } | null;
};

type ApiFuelLog = {
  id: number;
  truck_id: string;
  fuel_date: string;      // YYYY-MM-DD or ISO
  round_number: number;
  liters: number;
  cost: number;
  price_per_liter: number | null;
};

type ApiDistanceLog = {
  id: number;
  truck_id: string;
  log_date: string;       // YYYY-MM-DD or ISO
  round_number: number;
  distance_km: number;
};

// === Driver type for UI ===
type DriverUI = { id: string; name: string; phone?: string | null };

@Component({
  standalone: true,
  selector: 'app-truck-detail',
  templateUrl: './truck-detail.component.html',
  styleUrls: ['./truck-detail.component.css'],
  imports: [RouterModule, FormsModule, CommonModule, HttpClientModule],
})
export class TruckDetailComponent implements OnInit, OnDestroy {
  private apiBase = '/api';
  private pollSub?: Subscription;

  // ===== Theme / UI state =====
  isDark = localStorage.getItem('theme') === 'dark';
  searchTerm = '';
  editingMode = false;
  isLoading = false;

  // Toast
  showToast = false;
  toastMessage = '';

  // Delete confirm
  showDeleteConfirm = false;
  deleteIndex: number | null = null;

  // Add/Edit Truck
  showPopup = false;
  form: Partial<TruckUI> = {};
  selectedFile: File | null = null;
  imagePreview: string | null = null;

  // ===== Maintenance (ซ่อมบำรุง) =====
  showMaintModal = false;
  maintList: ApiMaintenance[] = [];
  maintForm = {
    id: null as number | null,
    truck_id: '',
    expense_date: this.formatYMD(),
    description: '',
    amount: 0
  };

  // รายการรถ
  trucks: TruckUI[] = [];
  currentIndex = 0;

  // ===== Modals เพิ่มระยะทาง/น้ำมัน =====
  showDistanceModal = false;
  distanceForm = {
    truck_id: '',
    log_date: this.formatYMD(),
    round_number: 1,
    distance_km: 0
  };

  showFuelModal = false;
  fuelForm = {
    truck_id: '',
    fuel_date: this.formatYMD(),
    round_number: 1,
    liters: 0,
    price_per_liter: 0,
    cost: 0
  };

  // ===== Detail modal =====
  showDetailPopup = false;
  selectedTruck: TruckUI | null = null;

  detailFuelLogs: ApiFuelLog[] = [];
  detailDistanceLogs: ApiDistanceLog[] = [];
  detailTotalFuelLiters = 0;
  detailTotalFuelCost = 0;
  detailTotalDistance = 0;

  // ===== Drivers =====
  drivers: DriverUI[] = [];

  // รายชื่อคนขับที่ถูกใช้งานโดยรถคันอื่น (เอาไว้ disable ใน <select>)
  blockedDriverIds = new Set<string>();

  constructor(private http: HttpClient) {}

  /* ====================== Lifecycle ====================== */

  ngOnInit() {
    this.applyTheme();
    this.loadTrucks();
    // รีเฟรชรายการใน detail เป็นระยะ (ถ้าเปิดอยู่)
    this.pollSub = interval(15000).subscribe(() => {
      if (this.selectedTruck) this.loadDetail(this.selectedTruck.id);
    });
  }
  ngOnDestroy() { this.pollSub?.unsubscribe(); }

  /* ====================== Theme ====================== */

  toggleTheme() { this.isDark = !this.isDark; this.applyTheme(); }
  private applyTheme() {
    document.documentElement.classList.toggle('dark', this.isDark);
    localStorage.setItem('theme', this.isDark ? 'dark' : 'light');
  }

  /* ====================== Summary / Filter ====================== */

  get totalTrucks(): number { return this.trucks.length; }
  get onJobCount(): number { return this.trucks.filter(t => t.status === 'ON_JOB').length; }
  get maintenanceCount(): number { return this.trucks.filter(t => t.status === 'MAINTENANCE').length; }

  get filteredTrucks(): TruckUI[] {
    const term = (this.searchTerm || '').trim().toLowerCase();
    if (!term) return this.trucks;

    const noDriverKeywords = ['ไม่มีคนขับ', 'no driver', 'ว่าง'];
    return this.trucks.filter(t =>
      (t.plate ?? '').toLowerCase().includes(term) ||
      (t.model ?? '').toLowerCase().includes(term) ||
      (t.id ?? '').toLowerCase().includes(term) ||
      (t.driver?.name ?? '').toLowerCase().includes(term) ||
      (!t.driver && noDriverKeywords.some(k => term.includes(k))) ||
      (t.driver?.phone ?? '').toLowerCase().includes(term)
    );
  }

  /* ====================== Maintenance modal ====================== */

  openMaintModal(t: TruckUI) {
    this.maintForm = {
      id: null,
      truck_id: t.id,
      expense_date: this.formatYMD(),
      description: '',
      amount: 0
    };
    this.showMaintModal = true;
    this.loadMaint(t.id);
  }

  closeMaintModal() { this.showMaintModal = false; }

  async loadMaint(truckId: string) {
    try {
      this.maintList = await firstValueFrom(
        this.http.get<ApiMaintenance[]>(`${this.apiBase}/truck-expenses`, { params: { truck_id: truckId } })
      );
    } catch (e) {
      console.error(e);
      this.maintList = [];
    }
  }

  editMaint(row: ApiMaintenance) {
    this.maintForm = {
      id: row.id,
      truck_id: row.truck_id,
      expense_date: (row.expense_date || '').slice(0, 10),
      description: row.description || '',
      amount: Number(row.amount) || 0
    };
  }

  async saveMaint() {
    this.isLoading = true;
    try {
      const f = this.maintForm;
      if (f.id == null) {
        await firstValueFrom(this.http.post(`${this.apiBase}/truck-expenses`, {
          truck_id: f.truck_id,
          expense_date: f.expense_date,
          description: f.description?.trim() || null,
          amount: Number(f.amount) || 0
        }));
      } else {
        await firstValueFrom(this.http.put(`${this.apiBase}/truck-expenses/${f.id}`, {
          expense_date: f.expense_date,
          description: f.description?.trim() || null,
          amount: Number(f.amount) || 0
        }));
      }
      await this.loadMaint(f.truck_id);
      this.toastMessage = 'บันทึกประวัติซ่อมเรียบร้อย';
      this.flashToast();
      // reset form (ยังอยู่คันเดิม)
      this.maintForm = { id: null, truck_id: f.truck_id, expense_date: this.formatYMD(), description: '', amount: 0 };
    } catch (e) {
      console.error(e);
      this.toastMessage = 'บันทึกประวัติซ่อมไม่สำเร็จ';
      this.flashToast();
    } finally {
      this.isLoading = false;
    }
  }

  async deleteMaint(row: ApiMaintenance) {
    if (!confirm('ลบรายการนี้หรือไม่?')) return;
    this.isLoading = true;
    try {
      await firstValueFrom(this.http.delete(`${this.apiBase}/truck-expenses/${row.id}`));
      await this.loadMaint(row.truck_id);
      this.toastMessage = 'ลบรายการแล้ว';
      this.flashToast();
    } catch (e) {
      console.error(e);
      this.toastMessage = 'ลบไม่สำเร็จ';
      this.flashToast();
    } finally {
      this.isLoading = false;
    }
  }

  // เผื่อ template เก่าเรียก removeMaint(id)
  async removeMaint(id: number) {
    const row = this.maintList.find(r => r.id === id);
    if (!row) return;
    return this.deleteMaint(row);
    // หรือจะลบตรงๆ ก็ได้:
    // if (!confirm('ลบรายการนี้หรือไม่?')) return;
    // this.isLoading = true;
    // try {
    //   await firstValueFrom(this.http.delete(`${this.apiBase}/truck-expenses/${id}`));
    //   await this.loadMaint(this.maintForm.truck_id);
    //   this.toastMessage = 'ลบรายการแล้ว';
    //   this.flashToast();
    // } finally { this.isLoading = false; }
  }

  /* ====================== CRUD Trucks ====================== */

  openAddPopup() {
    this.editingMode = false;
    this.form = {};
    this.showPopup = true;
    this.loadDrivers();          // โหลดรายชื่อคนขับ
    this.rebuildBlockedIds();    // บล็อกทุกคนที่ถูกใช้อยู่ (เพิ่มรถใหม่ ไม่มีคันยกเว้น)
  }

  openEditPopupFor(index: number) {
    this.currentIndex = index;
    this.editingMode = true;
    this.form = { ...this.trucks[index] };
    this.showPopup = true;
    this.loadDrivers();
    this.rebuildBlockedIds(this.trucks[index].id); // อนุญาตให้เลือก “คนขับเดิม” ของคันนี้ได้
  }

  closePopup() { this.showPopup = false; }

  confirmDelete(index: number) { this.deleteIndex = index; this.showDeleteConfirm = true; }

  async deleteTruck(index: number) {
    this.isLoading = true;
    try {
      const id = this.trucks[index].id;
      await firstValueFrom(this.http.delete(`${this.apiBase}/trucks/${id}`));
      this.trucks.splice(index, 1);
      this.toastMessage = 'ลบข้อมูลรถเรียบร้อยแล้ว';
    } catch (e) {
      console.error(e);
      this.toastMessage = 'ลบไม่สำเร็จ';
    } finally {
      this.isLoading = false;
      this.showDeleteConfirm = false;
      this.deleteIndex = null;
      this.flashToast();
    }
  }

  async submitForm() {
    this.isLoading = true;
    try {
      if (this.editingMode) {
        const id = this.form.id!;
        const oldDriverId = this.trucks[this.currentIndex]?.driver?.id ?? null;
        const newDriverId = this.form.driver?.id ?? null;

        // 1) อัปเดตรถ (ตัด current_driver_id ออก ไม่ให้ส่งไปกับ /trucks/:id)
        const updatePayload: any = this.buildUpdatePayload(this.form);
        delete updatePayload.current_driver_id;

        await firstValueFrom(this.http.put(`${this.apiBase}/trucks/${id}`, updatePayload));

        // 2) ถ้าคนขับเปลี่ยน → เรียก endpoint ใหม่
        if (oldDriverId !== newDriverId) {
          await this.setTruckDriver(id, newDriverId);
        }

        await this.loadTrucks();
        this.toastMessage = 'บันทึกการแก้ไขรถเรียบร้อย';
      } else {
        // เพิ่มรถใหม่
        const createPayload: any = this.buildCreatePayload(this.form);
        const newDriverId = this.form.driver?.id ?? null;
        delete createPayload.current_driver_id; // ให้ไปตั้งผ่าน endpoint ใหม่

        const created = await firstValueFrom(
          this.http.post<ApiTruckWithDriver>(`${this.apiBase}/trucks`, createPayload)
        );

        // ตั้งคนขับเริ่มต้นให้มีประวัติ assignment
        if (newDriverId) {
          await this.setTruckDriver(created.truck_id, newDriverId);
        }

        await this.loadTrucks();
        this.toastMessage = 'เพิ่มรถใหม่เรียบร้อย';
      }

      this.closePopup();
      this.flashToast();
    } catch (e) {
      console.error(e);
      this.toastMessage = 'บันทึกไม่สำเร็จ';
      this.flashToast();
    } finally {
      this.isLoading = false;
    }
  }

  private async setTruckDriver(truckId: string, employeeId: string | null) {
    try {
      await firstValueFrom(
        this.http.put(`${this.apiBase}/trucks/${truckId}/driver`, { employee_id: employeeId })
      );
    } catch (err: any) {
      if (err?.status === 409) {
        this.toastMessage = 'คนขับคนนี้ถูกใช้อยู่กับรถคันอื่นแล้ว';
        this.flashToast();
      }
      throw err; // ให้ submitForm จับต่อ
    }
  }

  private buildCreatePayload(form: Partial<TruckUI>) {
    return {
      plate: form.plate ?? '',
      model: form.model ?? null,
      total_distance: form.totalDistance ?? null,
      fuel_efficiency_km_per_liter: form.efficiencyKmPerL ?? null,
      // current_driver_id: (ตัดออก)
    };
  }
  private buildUpdatePayload(form: Partial<TruckUI>) {
    return {
      plate: form.plate ?? '',
      model: form.model ?? null,
      total_distance: form.totalDistance ?? null,
      fuel_efficiency_km_per_liter: form.efficiencyKmPerL ?? null,
      // current_driver_id: (ตัดออก)
    };
  }

  // map ค่าจาก select ให้เป็น form.driver
  onSelectDriver(id: string | null) {
    if (!id) { this.form.driver = undefined; return; }
    const found = this.drivers.find(d => d.id === id);
    if (found) this.form.driver = { id: found.id, name: found.name, phone: found.phone ?? null };
  }

  /* ====================== ระยะทาง / น้ำมัน ====================== */

  openDistanceModal(t: TruckUI) {
    this.distanceForm = {
      truck_id: t.id,
      log_date: this.formatYMD(),
      round_number: 1,
      distance_km: 0
    };
    this.showDistanceModal = true;
  }
  closeDistanceModal() { this.showDistanceModal = false; }

  async submitDistance() {
    this.isLoading = true;
    try {
      const payload = { ...this.distanceForm };
      await firstValueFrom(this.http.post(`${this.apiBase}/truck-distance-logs`, payload));
      this.toastMessage = 'บันทึกระยะทางเรียบร้อย';
      if (this.selectedTruck?.id === payload.truck_id) await this.loadDetail(payload.truck_id);
      this.flashToast();
      this.closeDistanceModal();
    } catch (e) {
      console.error(e);
      this.toastMessage = 'บันทึกระยะทางไม่สำเร็จ';
      this.flashToast();
    } finally { this.isLoading = false; }
  }

  openFuelModal(t: TruckUI) {
    this.fuelForm = {
      truck_id: t.id,
      fuel_date: this.formatYMD(),
      round_number: 1,
      liters: 0,
      price_per_liter: 0,
      cost: 0
    };
    this.showFuelModal = true;
  }
  closeFuelModal() { this.showFuelModal = false; }

  onFuelInputChange() {
    const { liters, price_per_liter } = this.fuelForm;
    if (liters && price_per_liter) this.fuelForm.cost = +(liters * price_per_liter).toFixed(2);
  }

  async submitFuel() {
    this.isLoading = true;
    try {
      const payload = { ...this.fuelForm };
      await firstValueFrom(this.http.post(`${this.apiBase}/fuel-logs`, payload));
      this.toastMessage = 'บันทึกน้ำมันเรียบร้อย';
      if (this.selectedTruck?.id === payload.truck_id) await this.loadDetail(payload.truck_id);
      this.flashToast();
      this.closeFuelModal();
    } catch (e) {
      console.error(e);
      this.toastMessage = 'บันทึกน้ำมันไม่สำเร็จ';
      this.flashToast();
    } finally { this.isLoading = false; }
  }

  /* ====================== Detail modal ====================== */

  async showDetail(t: TruckUI) {
    this.selectedTruck = t;
    await this.loadDetail(t.id);
    this.showDetailPopup = true;
  }
  closeDetailPopup() { this.showDetailPopup = false; }

  private async loadDetail(truckId: string) {
    try {
      const [fuelLogs, distLogs] = await Promise.all([
        firstValueFrom(this.http.get<ApiFuelLog[]>(`${this.apiBase}/fuel-logs`, { params: { truck_id: truckId } })),
        firstValueFrom(this.http.get<ApiDistanceLog[]>(`${this.apiBase}/truck-distance-logs`, { params: { truck_id: truckId } })),
      ]);
      this.detailFuelLogs = fuelLogs;
      this.detailDistanceLogs = distLogs;

      this.detailTotalFuelLiters = fuelLogs.reduce((s, r) => s + (r.liters || 0), 0);
      this.detailTotalFuelCost   = fuelLogs.reduce((s, r) => s + (r.cost || 0), 0);
      this.detailTotalDistance   = distLogs.reduce((s, r) => s + (r.distance_km || 0), 0);
    } catch (e) {
      console.error(e);
      this.detailFuelLogs = [];
      this.detailDistanceLogs = [];
      this.detailTotalFuelLiters = this.detailTotalFuelCost = this.detailTotalDistance = 0;
    }
  }

  /* ====================== Drivers ====================== */

  async loadDrivers() {
    try {
      // ปรับ endpoint ตามระบบของคุณ
      const list = await firstValueFrom(this.http.get<any[]>(`${this.apiBase}/employees`));
      const onlyDrivers = list.filter(e =>
        (e.position || '').includes('ขับ') || (e.position || '').toLowerCase().includes('driver')
      );
      this.drivers = onlyDrivers.map((e: any) => ({
        id: e.id ?? e.employee_id,
        name: e.name,
        phone: e.phone ?? null
      }));
    } catch (e) {
      console.error(e);
      this.drivers = [];
    }
  }

  // ไม่ให้เลือกคนขับซ้ำกับคันอื่น (ยกเว้นคนขับเดิมของคันที่กำลังแก้ไข)
  isDriverTaken(id?: string | null): boolean {
    return !!id && this.blockedDriverIds.has(id);
  }

  // สร้างชุด id คนขับที่ต้อง “บล็อก” (ยกเว้นรถคันที่กำลังแก้ไข)
  private rebuildBlockedIds(allowedTruckId?: string) {
    const allowId = allowedTruckId ?? (this.form.id ?? null);
    const ids = this.trucks
      .filter(t => !!t.driver && t.id !== allowId)
      .map(t => t.driver!.id);
    this.blockedDriverIds = new Set(ids);
  }

  /* ====================== Load list ====================== */

  async loadTrucks() {
    try {
      const list = await firstValueFrom(this.http.get<(ApiTruckBasic | ApiTruckWithDriver)[]>(`${this.apiBase}/trucks`));
      this.trucks = list.map(t => this.mapTruck(t));
      this.rebuildBlockedIds(this.editingMode ? (this.form.id ?? undefined) : undefined);
    } catch (e) {
      console.error(e);
      this.toastMessage = 'โหลดรายการรถไม่สำเร็จ';
      this.flashToast();
    }
  }

  /* ====================== Map / Utils ====================== */

  private mapTruck(t: ApiTruckBasic | ApiTruckWithDriver): TruckUI {
    const base: TruckUI = {
      id: t.truck_id,
      plate: t.plate,
      model: t.model ?? null,
      totalDistance: t.total_distance ?? null,
      efficiencyKmPerL: t.fuel_efficiency_km_per_liter ?? null,
      status: 'AVAILABLE'
    };
    const withDriver = (t as ApiTruckWithDriver).currentDriver;
    if (withDriver) {
      base.driver = withDriver ? {
        id: withDriver.id,
        name: withDriver.name,
        phone: withDriver.phone ?? null
      } : undefined;
    }
    return base;
  }

  formatDate(input?: string): string {
    if (!input) return '-';
    let d = new Date(input);
    if (isNaN(d.getTime()) && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
      d = new Date(input + 'T00:00:00');
    }
    if (isNaN(d.getTime())) return input;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  trackByIndex(i: number) { return i; }

  formatYMD(d = new Date()): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  flashToast() { this.showToast = true; setTimeout(() => (this.showToast = false), 3000); }

  statusDotClass(s?: TruckStatus) {
    switch (s) {
      case 'AVAILABLE':   return 'bg-emerald-500 dark:bg-emerald-400';
      case 'ON_JOB':      return 'bg-sky-500    dark:bg-sky-400';
      case 'MAINTENANCE': return 'bg-amber-500  dark:bg-amber-400';
      case 'IDLE':        return 'bg-slate-400  dark:bg-slate-500';
      case 'OFFLINE':     return 'bg-rose-500   dark:bg-rose-400';
      default:            return 'bg-slate-400  dark:bg-slate-500';
    }
  }
  statusLabel(s?: TruckStatus) {
    switch (s) {
      case 'AVAILABLE':   return 'พร้อมใช้งาน';
      case 'ON_JOB':      return 'ออกงานอยู่';
      case 'MAINTENANCE': return 'ซ่อมบำรุง';
      case 'IDLE':        return 'ว่าง';
      case 'OFFLINE':     return 'งดใช้งาน';
      default:            return 'ไม่ทราบสถานะ';
    }
  }
}
