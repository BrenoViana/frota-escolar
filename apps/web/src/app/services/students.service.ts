import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of, tap, throwError } from 'rxjs';
import {
  StudentDetail,
  StudentFormData,
  StudentImportResult,
  StudentSummary,
  STUDENT_SEED,
  toStudentSummary,
} from '../data/students.data';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class StudentsService {
  readonly useApi = environment.useApi;
  private readonly baseUrl = environment.apiBase.replace(/\/$/, '');
  private mockStore: StudentDetail[] = STUDENT_SEED.map((student) => ({ ...student }));
  private readonly studentsSubject = new BehaviorSubject<StudentSummary[]>([]);
  readonly students$ = this.studentsSubject.asObservable();
  private loaded = false;

  constructor(private readonly http: HttpClient) {
    if (!this.useApi) {
      this.refreshLocalList();
    }
  }

  list(): Observable<StudentSummary[]> {
    if (!this.loaded) {
      this.refreshList();
    }

    return this.students$;
  }

  getById(id: string): Observable<StudentDetail | null> {
    if (this.useApi) {
      return this.http.get<StudentDetail>(`${this.baseUrl}/students/${id}`);
    }

    const student = this.mockStore.find((item) => item.id === id);
    return of(student ?? null);
  }

  create(payload: StudentFormData): Observable<StudentDetail> {
    if (this.useApi) {
      return this.http
        .post<StudentDetail>(`${this.baseUrl}/students`, payload)
        .pipe(
          tap((student) => {
            this.upsertSummary(student);
            this.refreshList();
          })
        );
    }

    const normalized = this.normalizePayload(payload);
    const id = this.uniqueId(normalized.name);
    const detail: StudentDetail = {
      id,
      name: normalized.name,
      schoolId: normalized.schoolId,
      schoolName: normalized.schoolName ?? '',
      routeId: normalized.routeId ?? null,
      routeName: normalized.routeName,
      shift: normalized.shift,
      status: normalized.status,
      guardian: normalized.guardian,
      phone: normalized.phone,
      address: normalized.address,
      district: normalized.district ?? null,
      entryTime: normalized.entryTime ?? null,
      cep: normalized.cep ?? null,
      street: normalized.street ?? null,
      number: normalized.number ?? null,
      city: normalized.city ?? null,
      state: normalized.state ?? null,
      lat: normalized.lat ?? null,
      lng: normalized.lng ?? null,
      notes: normalized.notes,
    };

    this.mockStore = [detail, ...this.mockStore];
    this.upsertSummary(detail);
    this.refreshLocalList();
    return of(detail);
  }

  update(id: string, payload: StudentFormData): Observable<StudentDetail> {
    if (this.useApi) {
      return this.http
        .put<StudentDetail>(`${this.baseUrl}/students/${id}`, payload)
        .pipe(
          tap((student) => {
            this.upsertSummary(student);
            this.refreshList();
          })
        );
    }

    const index = this.mockStore.findIndex((item) => item.id === id);
    if (index === -1) {
      return throwError(() => new Error('Student not found'));
    }

    const normalized = this.normalizePayload(payload);
    const current = this.mockStore[index];
    const updated: StudentDetail = {
      ...current,
      name: normalized.name,
      schoolId: normalized.schoolId,
      schoolName: normalized.schoolName ?? '',
      routeId: normalized.routeId ?? null,
      routeName: normalized.routeName,
      shift: normalized.shift,
      status: normalized.status,
      guardian: normalized.guardian,
      phone: normalized.phone,
      address: normalized.address,
      district: normalized.district ?? null,
      entryTime: normalized.entryTime ?? null,
      cep: normalized.cep ?? null,
      street: normalized.street ?? null,
      number: normalized.number ?? null,
      city: normalized.city ?? null,
      state: normalized.state ?? null,
      lat: normalized.lat ?? null,
      lng: normalized.lng ?? null,
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

  import(items: StudentFormData[]): Observable<StudentImportResult> {
    if (this.useApi) {
      return this.http
        .post<StudentImportResult>(`${this.baseUrl}/students/import`, { items })
        .pipe(
          tap(() => {
            this.refreshList();
          })
        );
    }

    const created: StudentSummary[] = [];
    const errors: { index: number; message: string }[] = [];

    items.forEach((item, index) => {
      try {
        const normalized = this.normalizePayload(item);
        const id = this.uniqueId(normalized.name);
        const detail: StudentDetail = {
          id,
          name: normalized.name,
          schoolId: normalized.schoolId,
          schoolName: normalized.schoolName ?? '',
          routeId: normalized.routeId ?? null,
          routeName: normalized.routeName,
          shift: normalized.shift,
          status: normalized.status,
          guardian: normalized.guardian,
          phone: normalized.phone,
          address: normalized.address,
          district: normalized.district ?? null,
          entryTime: normalized.entryTime ?? null,
          cep: normalized.cep ?? null,
          street: normalized.street ?? null,
          number: normalized.number ?? null,
          city: normalized.city ?? null,
          state: normalized.state ?? null,
          lat: normalized.lat ?? null,
          lng: normalized.lng ?? null,
          notes: normalized.notes,
        };
        this.mockStore = [detail, ...this.mockStore];
        created.push(toStudentSummary(detail));
      } catch (error) {
        errors.push({
          index,
          message: error instanceof Error ? error.message : 'Erro ao importar.',
        });
      }
    });

    this.refreshLocalList();
    return of({ created, errors });
  }

  private uniqueId(name: string): string {
    const base = this.slugify(name) || 'aluno';
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

  private normalizePayload(payload: StudentFormData): StudentFormData {
    if (!payload.schoolId || !payload.name) {
      throw new Error('Nome e escola sao obrigatorios.');
    }

    const cep = payload.cep?.toString().replace(/\D/g, '') ?? '';
    const street = payload.street?.trim() ?? '';
    const number = payload.number?.toString().trim() ?? '';
    const district = payload.district?.trim() ?? '';
    const entryTime = payload.entryTime?.toString().trim() ?? '';
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
      throw new Error('Bairro do aluno não informado.');
    }
    if (!entryTime) {
      throw new Error('Horário de entrada do aluno não informado.');
    }
    if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(entryTime)) {
      throw new Error('Horário de entrada do aluno inválido.');
    }

    return {
      ...payload,
      name: payload.name.trim(),
      routeName: payload.routeName?.trim() ?? '',
      shift: payload.shift?.trim() ?? 'Manha',
      status: payload.status?.trim() ?? 'Ativo',
      entryTime: entryTime,
      guardian: payload.guardian?.trim() ?? '',
      phone: payload.phone?.trim() ?? '',
      address: formattedAddress,
      district: district || payload.district || null,
      cep: cep || payload.cep || null,
      street: street || payload.street || null,
      number: number || payload.number || null,
      city: city || payload.city || null,
      state: state || payload.state || null,
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      notes: payload.notes ?? '',
      schoolName: payload.schoolName ?? '',
      routeId: payload.routeId ?? null,
    };
  }

  private refreshList(): void {
    if (this.useApi) {
      this.http.get<StudentSummary[]>(`${this.baseUrl}/students`).subscribe({
        next: (students) => {
          this.studentsSubject.next(this.sortByName(students));
          this.loaded = true;
        },
      });
      return;
    }

    this.refreshLocalList();
  }

  private refreshLocalList(): void {
    this.studentsSubject.next(this.sortByName(this.mockStore.map(toStudentSummary)));
    this.loaded = true;
  }

  private upsertSummary(detail: StudentDetail): void {
    const summary = toStudentSummary(detail);
    const current = this.studentsSubject.value ?? [];
    const index = current.findIndex((item) => item.id === summary.id);
    const next =
      index === -1
        ? [summary, ...current]
        : [...current.slice(0, index), summary, ...current.slice(index + 1)];

    this.studentsSubject.next(this.sortByName(next));
    this.loaded = true;
  }

  delete(id: string): Observable<void> {
    if (this.useApi) {
      return this.http.delete<void>(`${this.baseUrl}/students/${id}`).pipe(
        tap(() => {
          this.removeSummary(id);
          this.refreshList();
        })
      );
    }

    const index = this.mockStore.findIndex((item) => item.id === id);
    if (index === -1) {
      return throwError(() => new Error('Student not found'));
    }

    this.mockStore = [
      ...this.mockStore.slice(0, index),
      ...this.mockStore.slice(index + 1),
    ];
    this.removeSummary(id);
    this.refreshLocalList();
    return of(void 0);
  }

  private removeSummary(id: string): void {
    const current = this.studentsSubject.value ?? [];
    this.studentsSubject.next(current.filter((item) => item.id !== id));
  }

  private sortByName(items: StudentSummary[]): StudentSummary[] {
    return [...items].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }
}
