import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of, tap, throwError } from 'rxjs';
import {
  SchoolDetail,
  SchoolFormData,
  SchoolSummary,
  SCHOOL_SEED,
  toSchoolSummary,
} from '../data/schools.data';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SchoolsService {
  readonly useApi = environment.useApi;
  private readonly baseUrl = environment.apiBase.replace(/\/$/, '');
  private mockStore: SchoolDetail[] = SCHOOL_SEED.map((school) => ({
    ...school,
    routeList: [...school.routeList],
    contacts: [...school.contacts],
  }));
  private readonly schoolsSubject = new BehaviorSubject<SchoolSummary[]>([]);
  readonly schools$ = this.schoolsSubject.asObservable();
  private loaded = false;

  constructor(private readonly http: HttpClient) {
    if (!this.useApi) {
      this.refreshLocalList();
    }
  }

  list(): Observable<SchoolSummary[]> {
    if (!this.loaded) {
      this.refreshList();
    }

    return this.schools$;
  }

  getById(id: string): Observable<SchoolDetail | null> {
    if (this.useApi) {
      return this.http.get<SchoolDetail>(`${this.baseUrl}/schools/${id}`);
    }

    const school = this.mockStore.find((item) => item.id === id);
    return of(school ?? null);
  }

  create(payload: SchoolFormData): Observable<SchoolDetail> {
    if (this.useApi) {
      return this.http
        .post<SchoolDetail>(`${this.baseUrl}/schools`, payload)
        .pipe(
          tap((school) => {
            this.upsertSummary(school);
            this.refreshList();
          })
        );
    }

    const normalized = this.normalizePayload(payload);
    const id = this.uniqueId(normalized.name);
    const detail: SchoolDetail = {
      id,
      name: normalized.name,
      district: normalized.district,
      address: normalized.address,
      cep: normalized.cep ?? null,
      street: normalized.street ?? null,
      number: normalized.number ?? null,
      city: normalized.city ?? null,
      state: normalized.state ?? null,
      lat: normalized.lat ?? null,
      lng: normalized.lng ?? null,
      students: normalized.students,
      capacity: normalized.capacity,
      routes: normalized.routes,
      status: 'Ativa',
      tone: '',
      shift: normalized.shift,
      pickupWindow: '06:30 - 07:15',
      dropoffWindow: '12:10 - 12:45',
      manager: normalized.manager,
      phone: normalized.phone,
      notes: normalized.notes,
      routeList: [],
      contacts: [
        { role: 'Diretora', name: normalized.manager, phone: normalized.phone },
      ],
    };

    this.mockStore = [detail, ...this.mockStore];
    this.upsertSummary(detail);
    this.refreshLocalList();
    return of(detail);
  }

  update(id: string, payload: SchoolFormData): Observable<SchoolDetail> {
    if (this.useApi) {
      return this.http
        .put<SchoolDetail>(`${this.baseUrl}/schools/${id}`, payload)
        .pipe(
          tap((school) => {
            this.upsertSummary(school);
            this.refreshList();
          })
        );
    }

    const index = this.mockStore.findIndex((item) => item.id === id);
    if (index === -1) {
      return throwError(() => new Error('School not found'));
    }

    const normalized = this.normalizePayload(payload);
    const current = this.mockStore[index];
    const updated: SchoolDetail = {
      ...current,
      name: normalized.name,
      district: normalized.district,
      address: normalized.address,
      cep: normalized.cep ?? null,
      street: normalized.street ?? null,
      number: normalized.number ?? null,
      city: normalized.city ?? null,
      state: normalized.state ?? null,
      lat: normalized.lat ?? null,
      lng: normalized.lng ?? null,
      students: normalized.students,
      capacity: normalized.capacity,
      routes: normalized.routes,
      shift: normalized.shift,
      manager: normalized.manager,
      phone: normalized.phone,
      notes: normalized.notes,
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
      return this.http.delete<void>(`${this.baseUrl}/schools/${id}`).pipe(
        tap(() => {
          this.removeSummary(id);
          this.refreshList();
        })
      );
    }

    const index = this.mockStore.findIndex((item) => item.id === id);
    if (index === -1) {
      return throwError(() => new Error('School not found'));
    }

    this.mockStore = [
      ...this.mockStore.slice(0, index),
      ...this.mockStore.slice(index + 1),
    ];
    this.removeSummary(id);
    this.refreshLocalList();
    return of(void 0);
  }

  private uniqueId(name: string): string {
    const base = this.slugify(name) || 'escola';
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

  private normalizePayload(payload: SchoolFormData): SchoolFormData {
    const district = payload.district?.trim() ?? '';
    const cep = payload.cep?.toString().replace(/\D/g, '') ?? '';
    const street = payload.street?.trim() ?? '';
    const number = payload.number?.toString().trim() ?? '';
    const city = payload.city?.trim() ?? '';
    const state = payload.state?.trim().toUpperCase() ?? '';
    const lat =
      payload.lat !== undefined && payload.lat !== null ? Number(payload.lat) : null;
    const lng =
      payload.lng !== undefined && payload.lng !== null ? Number(payload.lng) : null;
    const formattedAddress =
      street && number && city && state
        ? `${street}, ${number} - ${city}/${state}`
        : payload.address?.trim() ?? '';

    if (!district) {
      throw new Error('Bairro da escola não informado.');
    }

    return {
      ...payload,
      district,
      address: formattedAddress,
      cep: cep || payload.cep || null,
      street: street || payload.street || null,
      number: number || payload.number || null,
      city: city || payload.city || null,
      state: state || payload.state || null,
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      students: Number(payload.students) || 0,
      capacity: Number(payload.capacity) || 0,
      routes: Number(payload.routes) || 0,
      notes: payload.notes ?? '',
    };
  }

  private refreshList(): void {
    if (this.useApi) {
      this.http.get<SchoolSummary[]>(`${this.baseUrl}/schools`).subscribe({
        next: (schools) => {
          this.schoolsSubject.next(this.sortByName(schools));
          this.loaded = true;
        },
      });
      return;
    }

    this.refreshLocalList();
  }

  private refreshLocalList(): void {
    this.schoolsSubject.next(this.sortByName(this.mockStore.map(toSchoolSummary)));
    this.loaded = true;
  }

  private upsertSummary(detail: SchoolDetail): void {
    const summary = toSchoolSummary(detail);
    const current = this.schoolsSubject.value ?? [];
    const index = current.findIndex((item) => item.id === summary.id);
    const next =
      index === -1
        ? [summary, ...current]
        : [...current.slice(0, index), summary, ...current.slice(index + 1)];

    this.schoolsSubject.next(this.sortByName(next));
    this.loaded = true;
  }

  private removeSummary(id: string): void {
    const current = this.schoolsSubject.value ?? [];
    this.schoolsSubject.next(current.filter((item) => item.id !== id));
  }

  private sortByName(items: SchoolSummary[]): SchoolSummary[] {
    return [...items].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }
}
