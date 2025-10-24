import { Component, OnInit, OnDestroy } from '@angular/core';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { firstValueFrom, interval, Subscription } from 'rxjs';

type TruckStatus = 'AVAILABLE' | 'ON_JOB' | 'MAINTENANCE' | 'IDLE' | 'OFFLINE';

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
  fuel_date: string;
  round_number: number;
  liters: number;
  cost: number;
  price_per_liter: number | null;
};
type ApiDistanceLog = {
  id: number;
  truck_id: string;
  log_date: string;
  round_number: number;
  distance_km: number;
};
type DriverUI = { id: string; name: string; phone?: string | null };

/** ใช้เป็นฟอร์มฝั่ง UI สำหรับระยะทาง */
type DistanceForm = {
  id?: number;
  truck_id: string;
  log_date: string;
  round_number: number;
  distance_km: number;
};

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

  // UI
  searchTerm = '';
  editingMode = false;
  isLoading = false;

  // Toast
  showToast = false;
  toastMessage = '';

  // Trucks list
  trucks: TruckUI[] = [];
  currentIndex = 0;

  // Add/Edit
  showPopup = false;
  form: Partial<TruckUI> = {};
  drivers: DriverUI[] = [];
  blockedDriverIds = new Set<string>();

  // Delete truck
  showDeleteConfirm = false;
  deleteIndex: number | null = null;

  // ===== Distance / Fuel (รองรับแก้ไข: มี id ได้) =====
  showDistanceModal = false;
  distanceForm: DistanceForm = {
    truck_id: '',
    log_date: this.formatYMD(),
    round_number: 1,
    distance_km: 0,
  };

  showFuelModal = false;
  fuelForm: Partial<ApiFuelLog> = {
    truck_id: '',
    fuel_date: this.formatYMD(),
    round_number: 1,
    liters: 0,
    price_per_liter: 0,
    cost: 0,
  };

  // Detail
  showDetailPopup = false;
  selectedTruck: TruckUI | null = null;
  detailFuelLogs: ApiFuelLog[] = [];
  detailDistanceLogs: ApiDistanceLog[] = [];
  detailTotalFuelLiters = 0;
  detailTotalFuelCost = 0;
  detailTotalDistance = 0;

  // Maintenance
  showMaintModal = false;
  maintList: ApiMaintenance[] = [];
  maintForm = {
    id: null as number | null,
    truck_id: '',
    expense_date: this.formatYMD(),
    description: '',
    amount: 0,
  };

  // ===== Confirm Delete: Maintenance =====
  showMaintDelete = false;
  maintDeleteTarget: ApiMaintenance | null = null;

  // ===== Confirm Delete: Fuel =====
  showFuelDeleteConfirm = false;
  fuelDeleteTarget: ApiFuelLog | null = null;

  openFuelDelete(r: ApiFuelLog) {
    this.fuelDeleteTarget = r;
    this.showFuelDeleteConfirm = true;
  }
  closeFuelDelete() {
    this.showFuelDeleteConfirm = false;
    this.fuelDeleteTarget = null;
  }
  async confirmFuelDelete() {
    if (!this.fuelDeleteTarget) return;
    this.isLoading = true;
    try {
      await firstValueFrom(this.http.delete(`${this.apiBase}/fuel-logs/${this.fuelDeleteTarget.id}`));
      // อัปเดตใน modal & detail
      this.fuelHistory = this.fuelHistory.filter(x => x.id !== this.fuelDeleteTarget!.id);
      this.detailFuelLogs = this.detailFuelLogs.filter(x => x.id !== this.fuelDeleteTarget!.id);
      // รวมใหม่
      this.detailTotalFuelLiters = this.detailFuelLogs.reduce((s, r) => s + (r.liters || 0), 0);
      this.detailTotalFuelCost   = this.detailFuelLogs.reduce((s, r) => s + (r.cost   || 0), 0);
      this.toast('ลบรายการน้ำมันแล้ว');
    } catch {
      this.toast('ลบรายการน้ำมันไม่สำเร็จ');
    } finally {
      this.isLoading = false;
      this.closeFuelDelete();
    }
  }

  // ===== Confirm Delete: Distance (ใช้วิธี B) =====
  showDistanceDeleteConfirm = false;
  distanceDeleteTarget: ApiDistanceLog | null = null;

  openDistanceDelete(r: ApiDistanceLog) {
    this.distanceDeleteTarget = r;
    this.showDistanceDeleteConfirm = true;
  }
  closeDistanceDelete() {
    this.showDistanceDeleteConfirm = false;
    this.distanceDeleteTarget = null;
  }
  async confirmDistanceDelete() {
    if (!this.distanceDeleteTarget) return;
    const delId = this.distanceDeleteTarget.id;   // เก็บไว้ก่อน
    this.isLoading = true;
    try {
      // CUD ใช้ /distance-logs
      await firstValueFrom(this.http.delete(`${this.apiBase}/distance-logs/${delId}`));
      this.distanceHistory    = this.distanceHistory.filter(x => x.id !== delId);
      this.detailDistanceLogs = this.detailDistanceLogs.filter(x => x.id !== delId);
      this.toast('ลบรายการแล้ว');
    } catch {
      this.toast('ลบไม่สำเร็จ');
    } finally {
      this.isLoading = false;
      this.closeDistanceDelete();
    }
  }

  // ===== History (ตารางใหญ่) =====
  showFuelHistory = false;
  showDistanceHistory = false;
  fuelHistory: ApiFuelLog[] = [];
  distanceHistory: ApiDistanceLog[] = [];

  constructor(private http: HttpClient) {}

  /* ====== lifecycle ====== */
  ngOnInit() {
    this.loadTrucks();
    this.pollSub = interval(15000).subscribe(() => {
      if (this.selectedTruck) this.loadDetail(this.selectedTruck.id);
    });
  }
  ngOnDestroy() {
    this.pollSub?.unsubscribe();
  }

  /* ====== summary ====== */
  get totalTrucks(): number {
    return this.trucks.length;
  }
  get onJobCount(): number {
    return this.trucks.filter((t) => t.status === 'ON_JOB').length;
  }
  get maintenanceCount(): number {
    return this.trucks.filter((t) => t.status === 'MAINTENANCE').length;
  }

  get filteredTrucks(): TruckUI[] {
    const term = (this.searchTerm || '').trim().toLowerCase();
    if (!term) return this.trucks;
    const noDriverKeywords = ['ไม่มีคนขับ', 'no driver', 'ว่าง'];
    return this.trucks.filter(
      (t) =>
        (t.plate ?? '').toLowerCase().includes(term) ||
        (t.model ?? '').toLowerCase().includes(term) ||
        (t.id ?? '').toLowerCase().includes(term) ||
        (t.driver?.name ?? '').toLowerCase().includes(term) ||
        (!t.driver && noDriverKeywords.some((k) => term.includes(k))) ||
        (t.driver?.phone ?? '').toLowerCase().includes(term),
    );
  }

  /* ====== maintenance ====== */
  openMaintModal(t: TruckUI) {
    this.maintForm = {
      id: null,
      truck_id: t.id,
      expense_date: this.formatYMD(),
      description: '',
      amount: 0,
    };
    this.showMaintModal = true;
    this.loadMaint(t.id);
  }
  closeMaintModal() {
    this.showMaintModal = false;
  }

  async loadMaint(truckId: string) {
    try {
      this.maintList = await firstValueFrom(
        this.http.get<ApiMaintenance[]>(`${this.apiBase}/truck-expenses`, { params: { truck_id: truckId } }),
      );
    } catch {
      this.maintList = [];
    }
  }
  editMaint(row: ApiMaintenance) {
    this.maintForm = {
      id: row.id,
      truck_id: row.truck_id,
      expense_date: (row.expense_date || '').slice(0, 10),
      description: row.description || '',
      amount: Number(row.amount) || 0,
    };
  }
  async saveMaint() {
    this.isLoading = true;
    try {
      const f = this.maintForm;
      if (f.id == null) {
        await firstValueFrom(
          this.http.post(`${this.apiBase}/truck-expenses`, {
            truck_id: f.truck_id,
            expense_date: f.expense_date,
            description: f.description?.trim() || null,
            amount: Number(f.amount) || 0,
          }),
        );
      } else {
        await firstValueFrom(
          this.http.put(`${this.apiBase}/truck-expenses/${f.id}`, {
            expense_date: f.expense_date,
            description: f.description?.trim() || null,
            amount: Number(f.amount) || 0,
          }),
        );
      }
      await this.loadMaint(f.truck_id);
      this.toast('บันทึกประวัติซ่อมเรียบร้อย');
      this.maintForm = {
        id: null,
        truck_id: f.truck_id,
        expense_date: this.formatYMD(),
        description: '',
        amount: 0,
      };
    } catch {
      this.toast('บันทึกประวัติซ่อมไม่สำเร็จ');
    } finally {
      this.isLoading = false;
    }
  }

  openMaintDelete(row: ApiMaintenance) {
    this.maintDeleteTarget = row;
    this.showMaintDelete = true;
  }
  closeMaintDelete() {
    this.showMaintDelete = false;
    this.maintDeleteTarget = null;
  }
  async confirmMaintDelete() {
    if (!this.maintDeleteTarget) return;
    this.isLoading = true;
    try {
      await firstValueFrom(this.http.delete(`${this.apiBase}/truck-expenses/${this.maintDeleteTarget.id}`));
      await this.loadMaint(this.maintDeleteTarget.truck_id);
      this.toast('ลบรายการแล้ว');
    } catch {
      this.toast('ลบไม่สำเร็จ');
    } finally {
      this.isLoading = false;
      this.closeMaintDelete();
    }
  }

  /* ====== CRUD trucks ====== */
  openAddPopup() {
    this.editingMode = false;
    this.form = {};
    this.showPopup = true;
    this.loadDrivers();
    this.rebuildBlockedIds();
  }
  openEditPopupFor(index: number) {
    this.currentIndex = index;
    this.editingMode = true;
    this.form = { ...this.trucks[index] };
    this.showPopup = true;
    this.loadDrivers();
    this.rebuildBlockedIds(this.trucks[index].id);
  }
  closePopup() {
    this.showPopup = false;
  }

  confirmDelete(index: number) {
    this.deleteIndex = index;
    this.showDeleteConfirm = true;
  }
  async deleteTruck(index: number) {
    this.isLoading = true;
    try {
      const id = this.trucks[index].id;
      await firstValueFrom(this.http.delete(`${this.apiBase}/trucks/${id}`));
      this.trucks.splice(index, 1);
      this.toast('ลบข้อมูลรถเรียบร้อยแล้ว');
    } catch {
      this.toast('ลบไม่สำเร็จ');
    } finally {
      this.isLoading = false;
      this.showDeleteConfirm = false;
      this.deleteIndex = null;
    }
  }

  async submitForm() {
    this.isLoading = true;
    try {
      if (this.editingMode) {
        const id = this.form.id!;
        const oldDriverId = this.trucks[this.currentIndex]?.driver?.id ?? null;
        const newDriverId = this.form.driver?.id ?? null;

        const payload: any = this.buildPayload(this.form);
        delete payload.current_driver_id;
        await firstValueFrom(this.http.put(`${this.apiBase}/trucks/${id}`, payload));

        if (oldDriverId !== newDriverId) await this.setTruckDriver(id, newDriverId);

        await this.loadTrucks();
        this.toast('บันทึกการแก้ไขรถเรียบร้อย');
      } else {
        const payload: any = this.buildPayload(this.form);
        delete payload.current_driver_id;
        const created = await firstValueFrom(
          this.http.post<ApiTruckWithDriver>(`${this.apiBase}/trucks`, payload),
        );
        const newDriverId = this.form.driver?.id ?? null;
        if (newDriverId) await this.setTruckDriver(created.truck_id, newDriverId);
        await this.loadTrucks();
        this.toast('เพิ่มรถใหม่เรียบร้อย');
      }
      this.closePopup();
    } catch {
      this.toast('บันทึกไม่สำเร็จ');
    } finally {
      this.isLoading = false;
    }
  }

  private async setTruckDriver(truckId: string, employeeId: string | null) {
    try {
      await firstValueFrom(
        this.http.put(`${this.apiBase}/trucks/${truckId}/driver`, { employee_id: employeeId }),
      );
    } catch (err: any) {
      if (err?.status === 409) this.toast('คนขับคนนี้ถูกใช้อยู่กับรถคันอื่นแล้ว');
      throw err;
    }
  }
  private buildPayload(form: Partial<TruckUI>) {
    return {
      plate: form.plate ?? '',
      model: form.model ?? null,
      total_distance: form.totalDistance ?? null,
      fuel_efficiency_km_per_liter: form.efficiencyKmPerL ?? null,
    };
  }

  onSelectDriver(id: string | null) {
    if (!id) {
      this.form.driver = undefined;
      return;
    }
    const found = this.drivers.find((d) => d.id === id);
    if (found) this.form.driver = { id: found.id, name: found.name, phone: found.phone ?? null };
  }

  /* ====== distance / fuel ====== */
  openDistanceModal(t: TruckUI) {
    this.distanceForm = {
      id: undefined,
      truck_id: t.id,
      log_date: this.formatYMD(),
      round_number: 1,
      distance_km: 0,
    };
    this.showDistanceModal = true;
  }
  closeDistanceModal() {
    this.showDistanceModal = false;
  }
async submitDistance() {
  this.isLoading = true;
  try {
    const f = this.distanceForm;
    const tid = f.truck_id || this.selectedTruck?.id;
    if (!tid) throw new Error('missing truck_id');

    const payload = {
      truck_id: tid,
      log_date: f.log_date,
      round_number: f.round_number,
      distance_km: f.distance_km,
    };

    if (f.id) {
      // แก้ไข => ใช้ PUT (เพราะแบ็กเอนด์ไม่มี PATCH)
      await firstValueFrom(
        this.http.put(`${this.apiBase}/distance-logs/${f.id}`, payload)
      );
    } else {
      // เพิ่มใหม่
      await firstValueFrom(
        this.http.post(`${this.apiBase}/distance-logs`, payload)
      );
    }

    this.toast('บันทึกระยะทางเรียบร้อย');
    await this.loadDetail(tid);
    this.closeDistanceModal();
  } catch {
    this.toast('บันทึกระยะทางไม่สำเร็จ');
  } finally {
    this.isLoading = false;
  }
}


  openFuelModal(t: TruckUI) {
    this.fuelForm = {
      id: undefined,
      truck_id: t.id,
      fuel_date: this.formatYMD(),
      round_number: 1,
      liters: 0,
      price_per_liter: 0,
      cost: 0,
    };
    this.showFuelModal = true;
  }
  closeFuelModal() {
    this.showFuelModal = false;
  }
  onFuelInputChange() {
    const { liters, price_per_liter } = this.fuelForm;
    if (liters && price_per_liter)
      this.fuelForm.cost = +(Number(liters) * Number(price_per_liter)).toFixed(2);
  }
  async submitFuel() {
    this.isLoading = true;
    try {
      const f: any = this.fuelForm;
      const payload = {
        truck_id: f.truck_id,
        fuel_date: f.fuel_date,
        round_number: Number(f.round_number || 1),
        liters: Number(f.liters || 0),
        cost: Number(f.cost || 0),
        price_per_liter: f.price_per_liter ?? null,
      };

      if (f.id) {
        await firstValueFrom(this.http.patch(`${this.apiBase}/fuel-logs/${f.id}`, payload));
        this.toast('อัปเดตน้ำมันเรียบร้อย');
      } else {
        await firstValueFrom(this.http.post(`${this.apiBase}/fuel-logs`, payload));
        this.toast('บันทึกน้ำมันเรียบร้อย');
      }

      if (this.selectedTruck?.id === payload.truck_id) {
        await this.loadDetail(payload.truck_id);
      }
      this.closeFuelModal();
    } catch {
      this.toast('บันทึกน้ำมันไม่สำเร็จ');
    } finally {
      this.isLoading = false;
    }
  }

  /* ====== detail ====== */
  async showDetail(t: TruckUI) {
    this.selectedTruck = t;
    await this.loadDetail(t.id);
    this.showDetailPopup = true;
  }
  closeDetailPopup() {
    this.showDetailPopup = false;
  }
  private recomputeDetailTotals() {
    this.detailTotalFuelLiters = this.detailFuelLogs.reduce((s, r) => s + (r.liters || 0), 0);
    this.detailTotalFuelCost = this.detailFuelLogs.reduce((s, r) => s + (r.cost || 0), 0);
    this.detailTotalDistance = this.detailDistanceLogs.reduce(
      (s, r) => s + (r.distance_km || 0),
      0,
    );
  }
  private async loadDetail(truckId: string) {
    try {
      const [fuelLogs, distLogs] = await Promise.all([
        firstValueFrom(
          this.http.get<ApiFuelLog[]>(`${this.apiBase}/fuel-logs`, { params: { truck_id: truckId } }),
        ),
        firstValueFrom(
          // list ใช้ /truck-distance-logs
          this.http.get<ApiDistanceLog[]>(`${this.apiBase}/truck-distance-logs`, {
            params: { truck_id: truckId },
          }),
        ),
      ]);
      this.detailFuelLogs = fuelLogs;
      this.detailDistanceLogs = distLogs;
      this.recomputeDetailTotals();
    } catch {
      this.detailFuelLogs = [];
      this.detailDistanceLogs = [];
      this.recomputeDetailTotals();
    }
  }

  /* ====== history modal handlers ====== */
  openFuelHistory() {
    this.fuelHistory = [...(this.detailFuelLogs ?? [])].sort(
      (a, b) => new Date(b.fuel_date).getTime() - new Date(a.fuel_date).getTime(),
    );
    this.showFuelHistory = true;
  }
  openDistanceHistory() {
    this.distanceHistory = [...(this.detailDistanceLogs ?? [])].sort(
      (a, b) => new Date(b.log_date).getTime() - new Date(a.log_date).getTime(),
    );
    this.showDistanceHistory = true;
  }

  editFuel(r: any) {
    this.showFuelHistory = false;
    this.fuelForm = {
      id: r.id,
      truck_id: this.selectedTruck!.id,
      fuel_date: this.ymd(r.fuel_date),
      round_number: r.round_number,
      liters: Number(r.liters),
      price_per_liter: r.price_per_liter ?? null,
      cost: Number(r.cost),
    };
    this.showFuelModal = true;
  }

  editDistance(r: any) {
    this.distanceForm = {
      id: r.id,
      truck_id: this.selectedTruck?.id || '', // ใช้ id ของ TruckUI เท่านั้น
      log_date: this.ymd(r.log_date),
      round_number: Number(r.round_number || 1),
      distance_km: Number(r.distance_km || 0),
    };
    this.showDistanceModal = true;
  }

  // (ยังคงปุ่ม confirm แบบเดิมไว้เผื่อใช้งานที่อื่น แต่ชี้ endpoint ให้ตรงกับวิธี B)
  async deleteFuel(r: ApiFuelLog) {
    if (!confirm('ต้องการลบรายการน้ำมันนี้ใช่ไหม?')) return;
    this.isLoading = true;
    try {
      await firstValueFrom(this.http.delete(`${this.apiBase}/fuel-logs/${r.id}`));
      this.detailFuelLogs = this.detailFuelLogs.filter((x) => x.id !== r.id);
      this.fuelHistory = this.fuelHistory.filter((x) => x.id !== r.id);
      this.recomputeDetailTotals();
    } finally {
      this.isLoading = false;
    }
  }
  async deleteDistance(r: ApiDistanceLog) {
    if (!confirm('ต้องการลบรายการระยะทางนี้ใช่ไหม?')) return;
    this.isLoading = true;
    try {
      await firstValueFrom(this.http.delete(`${this.apiBase}/distance-logs/${r.id}`));
      this.detailDistanceLogs = this.detailDistanceLogs.filter((x) => x.id !== r.id);
      this.distanceHistory = this.distanceHistory.filter((x) => x.id !== r.id);
      this.recomputeDetailTotals();
    } finally {
      this.isLoading = false;
    }
  }

  /* ====== drivers ====== */
  async loadDrivers() {
    try {
      const list = await firstValueFrom(this.http.get<any[]>(`${this.apiBase}/employees`));
      const onlyDrivers = list.filter(
        (e) =>
          (e.position || '').includes('ขับ') ||
          (e.position || '').toLowerCase().includes('driver'),
      );
      this.drivers = onlyDrivers.map((e: any) => ({
        id: e.id ?? e.employee_id,
        name: e.name,
        phone: e.phone ?? null,
      }));
    } catch {
      this.drivers = [];
    }
  }
  isDriverTaken(id?: string | null): boolean {
    return !!id && this.blockedDriverIds.has(id!);
  }
  private rebuildBlockedIds(allowedTruckId?: string) {
    const allowId = allowedTruckId ?? (this.form.id ?? null);
    this.blockedDriverIds = new Set(
      this.trucks.filter((t) => !!t.driver && t.id !== allowId).map((t) => t.driver!.id),
    );
  }

  /* ====== load list & map ====== */
  async loadTrucks() {
    try {
      const list = await firstValueFrom(
        this.http.get<(ApiTruckBasic | ApiTruckWithDriver)[]>(`${this.apiBase}/trucks`),
      );
      this.trucks = list.map((t) => this.mapTruck(t));
      this.rebuildBlockedIds(this.editingMode ? this.form.id : undefined);
    } catch {
      this.toast('โหลดรายการรถไม่สำเร็จ');
    }
  }
  private mapTruck(t: ApiTruckBasic | ApiTruckWithDriver): TruckUI {
    const base: TruckUI = {
      id: t.truck_id,
      plate: t.plate,
      model: t.model ?? null,
      totalDistance: t.total_distance ?? null,
      efficiencyKmPerL: t.fuel_efficiency_km_per_liter ?? null,
      status: 'AVAILABLE',
    };
    const d = (t as ApiTruckWithDriver).currentDriver;
    if (d) base.driver = { id: d.id, name: d.name, phone: d.phone ?? null };
    return base;
  }

  /* ====== utils ====== */
  formatDate(input?: string): string {
    if (!input) return '-';
    let d = new Date(input);
    if (isNaN(d.getTime()) && /^\d{4}-\d{2}-\d{2}$/.test(input))
      d = new Date(input + 'T00:00:00');
    if (isNaN(d.getTime())) return input;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }
  formatYMD(d = new Date()): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }
  toast(msg: string) {
    this.toastMessage = msg;
    this.showToast = true;
    setTimeout(() => (this.showToast = false), 3000);
  }
  private ymd(d: Date | string) {
    const dd = new Date(d);
    return dd.toISOString().slice(0, 10);
  }
}
