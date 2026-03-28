import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of, tap, throwError } from 'rxjs';
import {
  RouteDetail,
  RouteFormData,
  RouteSummary,
  ROUTE_SEED,
} from '../data/routes.data';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class RoutesService {
  readonly useApi = environment.useApi;
  private readonly baseUrl = environment.apiBase.replace(/\/$/, '');
  private mockStore: RouteDetail[] = ROUTE_SEED.map((route) => ({ ...route }));
  private readonly routesSubject = new BehaviorSubject<RouteSummary[]>([]);
  readonly routes$ = this.routesSubject.asObservable();
  private loaded = false;

  constructor(private readonly http: HttpClient) {
    if (!this.useApi) {
      this.refreshLocalList();
    }
  }

  list(): Observable<RouteSummary[]> {
    if (!this.loaded) {
      this.refreshList();
    }
    return this.routes$;
  }

  listBySchool(schoolId: string): Observable<RouteSummary[]> {
    if (this.useApi) {
      return this.http.get<RouteSummary[]>(
        `${this.baseUrl}/routes?schoolId=${encodeURIComponent(schoolId)}`
      );
    }

    return of(
      this.mockStore.filter(
        (route) =>
          route.schoolId === schoolId ||
          route.schools?.some((school) => school.id === schoolId)
      )
    );
  }

  getById(id: string): Observable<RouteDetail | null> {
    if (this.useApi) {
      return this.http.get<RouteDetail>(`${this.baseUrl}/routes/${id}`);
    }

    const route = this.mockStore.find((item) => item.id === id);
    return of(route ?? null);
  }

  create(payload: RouteFormData): Observable<RouteDetail> {
    if (this.useApi) {
      return this.http.post<RouteDetail>(`${this.baseUrl}/routes`, payload).pipe(
        tap((route) => {
          this.upsertSummary(route);
          this.refreshList();
        })
      );
    }

    const normalized = this.normalizePayload(payload);
    const id = this.uniqueId(normalized.name);
    const detail: RouteDetail = {
      id,
      name: normalized.name,
      schoolId: normalized.schoolId ?? null,
      schoolName: '',
      schools: [],
      shift: normalized.shift,
      status: normalized.status,
      startTime: normalized.startTime,
      endTime: normalized.endTime,
      capacity: normalized.capacity,
      vehicleId: normalized.vehicleId ?? null,
      students: 0,
      studentsList: [],
      vehicleLabel: '',
    };

    this.mockStore = [detail, ...this.mockStore];
    this.upsertSummary(detail);
    this.refreshLocalList();
    return of(detail);
  }

  update(id: string, payload: RouteFormData): Observable<RouteDetail> {
    if (this.useApi) {
      return this.http.put<RouteDetail>(`${this.baseUrl}/routes/${id}`, payload).pipe(
        tap((route) => {
          this.upsertSummary(route);
          this.refreshList();
        })
      );
    }

    const index = this.mockStore.findIndex((item) => item.id === id);
    if (index === -1) {
      return throwError(() => new Error('Route not found'));
    }

    const normalized = this.normalizePayload(payload);
    const current = this.mockStore[index];
    const updated: RouteDetail = {
      ...current,
      name: normalized.name,
      schoolId: normalized.schoolId ?? current.schoolId ?? null,
      shift: normalized.shift,
      status: normalized.status,
      startTime: normalized.startTime,
      endTime: normalized.endTime,
      capacity: normalized.capacity,
      vehicleId: normalized.vehicleId ?? null,
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
      return this.http.delete<void>(`${this.baseUrl}/routes/${id}`).pipe(
        tap(() => {
          this.removeSummary(id);
          this.refreshList();
        })
      );
    }

    const index = this.mockStore.findIndex((item) => item.id === id);
    if (index === -1) {
      return throwError(() => new Error('Route not found'));
    }

    this.mockStore = [
      ...this.mockStore.slice(0, index),
      ...this.mockStore.slice(index + 1),
    ];
    this.removeSummary(id);
    this.refreshLocalList();
    return of(void 0);
  }

  private normalizePayload(payload: RouteFormData): RouteFormData {
    return {
      ...payload,
      name: payload.name?.trim() ?? '',
      shift: payload.shift?.trim() ?? 'Manha',
      status: payload.status?.trim() ?? 'Ativa',
      startTime: payload.startTime?.trim() ?? '06:30',
      endTime: payload.endTime?.trim() ?? '07:15',
      capacity: Number(payload.capacity) || 0,
      vehicleId: payload.vehicleId ?? null,
      studentIds: payload.studentIds ?? [],
    };
  }

  private uniqueId(name: string): string {
    const base = this.slugify(name) || 'rota';
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
      this.http.get<RouteSummary[]>(`${this.baseUrl}/routes`).subscribe({
        next: (routes) => {
          this.routesSubject.next(this.sortByName(routes));
          this.loaded = true;
        },
      });
      return;
    }

    this.refreshLocalList();
  }

  private refreshLocalList(): void {
    this.routesSubject.next(this.sortByName(this.mockStore));
    this.loaded = true;
  }

  private upsertSummary(route: RouteDetail | RouteSummary): void {
    const schools: Array<{ id: string; name: string }> =
      (route as RouteSummary).schools ?? (route as any).schools ?? [];
    const schoolName =
      route.schoolName ??
      (schools.length ? schools.map((school: { id: string; name: string }) => school.name).join(' • ') : '');
    const summary: RouteSummary = {
      id: route.id,
      name: route.name,
      schoolId: route.schoolId ?? null,
      schoolName,
      schools,
      shift: route.shift,
      status: route.status,
      startTime: route.startTime,
      endTime: route.endTime,
      capacity: route.capacity,
      students: route.students ?? 0,
      vehicleId: route.vehicleId ?? null,
      vehicleLabel: (route as RouteDetail).vehicleLabel,
    };

    const current = this.routesSubject.value ?? [];
    const index = current.findIndex((item) => item.id === summary.id);
    const next =
      index === -1
        ? [summary, ...current]
        : [...current.slice(0, index), summary, ...current.slice(index + 1)];

    this.routesSubject.next(this.sortByName(next));
    this.loaded = true;
  }

  private removeSummary(id: string): void {
    const current = this.routesSubject.value ?? [];
    this.routesSubject.next(current.filter((item) => item.id !== id));
  }

  private sortByName(items: RouteSummary[]): RouteSummary[] {
    return [...items].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }
}
