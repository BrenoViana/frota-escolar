import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of, tap, throwError } from 'rxjs';
import {
  VehicleDetail,
  VehicleFormData,
  VehicleSummary,
  VEHICLE_SEED,
} from '../data/vehicles.data';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class VehiclesService {
  readonly useApi = environment.useApi;
  private readonly baseUrl = environment.apiBase.replace(/\/$/, '');
  private mockStore: VehicleDetail[] = VEHICLE_SEED.map((vehicle) => ({ ...vehicle }));
  private readonly vehiclesSubject = new BehaviorSubject<VehicleSummary[]>([]);
  readonly vehicles$ = this.vehiclesSubject.asObservable();
  private loaded = false;

  constructor(private readonly http: HttpClient) {
    if (!this.useApi) {
      this.refreshLocalList();
    }
  }

  list(): Observable<VehicleSummary[]> {
    if (!this.loaded) {
      this.refreshList();
    }
    return this.vehicles$;
  }

  getById(id: string): Observable<VehicleDetail | null> {
    if (this.useApi) {
      return this.http.get<VehicleDetail>(`${this.baseUrl}/vehicles/${id}`);
    }

    const vehicle = this.mockStore.find((item) => item.id === id);
    return of(vehicle ?? null);
  }

  create(payload: VehicleFormData): Observable<VehicleDetail> {
    if (this.useApi) {
      return this.http.post<VehicleDetail>(`${this.baseUrl}/vehicles`, payload).pipe(
        tap((vehicle) => {
          this.upsertSummary(vehicle);
          this.refreshList();
        })
      );
    }

    const normalized = this.normalizePayload(payload);
    const id = this.uniqueId(`${normalized.plate}-${normalized.model}`);
    const detail: VehicleDetail = {
      id,
      ...normalized,
      routeName: '',
      schoolName: '',
    };

    this.mockStore = [detail, ...this.mockStore];
    this.upsertSummary(detail);
    this.refreshLocalList();
    return of(detail);
  }

  update(id: string, payload: VehicleFormData): Observable<VehicleDetail> {
    if (this.useApi) {
      return this.http.put<VehicleDetail>(`${this.baseUrl}/vehicles/${id}`, payload).pipe(
        tap((vehicle) => {
          this.upsertSummary(vehicle);
          this.refreshList();
        })
      );
    }

    const index = this.mockStore.findIndex((item) => item.id === id);
    if (index === -1) {
      return throwError(() => new Error('Vehicle not found'));
    }

    const normalized = this.normalizePayload(payload);
    const current = this.mockStore[index];
    const updated: VehicleDetail = {
      ...current,
      ...normalized,
    };

    this.mockStore = [
      ...this.mockStore.slice(0, index),
      updated,
      ...this.mockStore.slice(index + 1),
    ];
    this.upsertSummary(updated);
    this.refreshLocalList();
    return of(updated);
  }

  delete(id: string): Observable<void> {
    if (this.useApi) {
      return this.http.delete<void>(`${this.baseUrl}/vehicles/${id}`).pipe(
        tap(() => {
          this.removeSummary(id);
          this.refreshList();
        })
      );
    }

    const index = this.mockStore.findIndex((item) => item.id === id);
    if (index === -1) {
      return throwError(() => new Error('Vehicle not found'));
    }

    this.mockStore = [
      ...this.mockStore.slice(0, index),
      ...this.mockStore.slice(index + 1),
    ];
    this.removeSummary(id);
    this.refreshLocalList();
    return of(void 0);
  }

  private normalizePayload(payload: VehicleFormData): VehicleFormData {
    const cep = payload.garageCep?.toString().replace(/\D/g, '') ?? '';
    const street = payload.garageStreet?.trim() ?? '';
    const number = payload.garageNumber?.toString().trim() ?? '';
    const district = payload.garageDistrict?.trim() ?? '';
    const city = payload.garageCity?.trim() ?? '';
    const state = payload.garageState?.trim().toUpperCase() ?? '';
    const lat =
      payload.garageLat !== undefined && payload.garageLat !== null
        ? Number(payload.garageLat)
        : null;
    const lng =
      payload.garageLng !== undefined && payload.garageLng !== null
        ? Number(payload.garageLng)
        : null;

    if (!district) {
      throw new Error('Bairro da garagem não informado.');
    }

    return {
      plate: payload.plate?.trim().toUpperCase() ?? '',
      model: payload.model?.trim() ?? '',
      capacity: Number(payload.capacity) || 0,
      status: payload.status?.trim() ?? 'Disponivel',
      notes: payload.notes ?? '',
      routeId: payload.routeId ?? null,
      garageCep: cep || payload.garageCep || null,
      garageStreet: street || payload.garageStreet || null,
      garageNumber: number || payload.garageNumber || null,
      garageDistrict: district || payload.garageDistrict || null,
      garageCity: city || payload.garageCity || null,
      garageState: state || payload.garageState || null,
      garageLat: Number.isFinite(lat) ? lat : null,
      garageLng: Number.isFinite(lng) ? lng : null,
    };
  }

  private uniqueId(value: string): string {
    const base = this.slugify(value) || 'veiculo';
    let candidate = base;
    let counter = 1;

    while (this.mockStore.some((item) => item.id === candidate)) {
      candidate = `${base}-${counter}`;
      counter += 1;
    }

    return candidate;
  }

  private slugify(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  private refreshList(): void {
    if (this.useApi) {
      this.http.get<VehicleSummary[]>(`${this.baseUrl}/vehicles`).subscribe({
        next: (vehicles) => {
          this.vehiclesSubject.next(this.sortByPlate(vehicles));
          this.loaded = true;
        },
      });
      return;
    }

    this.refreshLocalList();
  }

  private refreshLocalList(): void {
    this.vehiclesSubject.next(this.sortByPlate(this.mockStore));
    this.loaded = true;
  }

  private upsertSummary(detail: VehicleDetail | VehicleSummary): void {
    const summary: VehicleSummary = {
      id: detail.id,
      plate: detail.plate,
      model: detail.model,
      capacity: detail.capacity,
      status: detail.status,
      routeId: detail.routeId ?? null,
      routeName: (detail as VehicleDetail).routeName,
      schoolName: (detail as VehicleDetail).schoolName,
    };

    const current = this.vehiclesSubject.value ?? [];
    const index = current.findIndex((item) => item.id === summary.id);
    const next =
      index === -1
        ? [summary, ...current]
        : [...current.slice(0, index), summary, ...current.slice(index + 1)];

    this.vehiclesSubject.next(this.sortByPlate(next));
    this.loaded = true;
  }

  private removeSummary(id: string): void {
    const current = this.vehiclesSubject.value ?? [];
    this.vehiclesSubject.next(current.filter((item) => item.id !== id));
  }

  private sortByPlate(items: VehicleSummary[]): VehicleSummary[] {
    return [...items].sort((a, b) => a.plate.localeCompare(b.plate, 'pt-BR'));
  }
}
