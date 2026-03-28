import { Component, DestroyRef } from '@angular/core';
import { AsyncPipe, NgFor, NgIf } from '@angular/common';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { StudentsService } from '../services/students.service';
import { SchoolsService } from '../services/schools.service';
import { RoutesService } from '../services/routes.service';
import { StudentFormData } from '../data/students.data';
import { SchoolSummary } from '../data/schools.data';
import { RouteSummary } from '../data/routes.data';
import { GeoService } from '../services/geo.service';
import { setupAddressAutofill } from '../shared/address-autofill';
import { buildAddressLabel, formatCep, normalizeCep } from '../shared/address-utils';
import { cepValidator, latValidator, lngValidator } from '../shared/geo-validators';
import { ShiftLabelPipe } from '../shared/shift-label.pipe';

@Component({
  selector: 'app-student-form-page',
  standalone: true,
  imports: [ReactiveFormsModule, NgIf, NgFor, AsyncPipe, RouterLink, ShiftLabelPipe],
  templateUrl: './student-form.page.html',
  styleUrl: './student-form.page.css',
})
export class StudentFormPageComponent {
  readonly shifts = ['Manha', 'Tarde', 'Integral'];
  readonly statuses = ['Ativo', 'Pendente', 'Inativo'];
  readonly studentId: string | null;
  readonly isEdit: boolean;
  readonly useApi = this.studentsService.useApi;
  readonly schools$: Observable<SchoolSummary[]> = this.schoolsService.list();

  private schoolsCache: SchoolSummary[] = [];
  private routesCache: RouteSummary[] = [];

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    schoolId: ['', Validators.required],
    routeName: [''],
    shift: ['Manha', Validators.required],
    status: ['Ativo', Validators.required],
    entryTime: ['', [Validators.required, Validators.pattern(/^([01]?\d|2[0-3]):[0-5]\d$/)]],
    guardian: [''],
    phone: [''],
    cep: ['', [Validators.required, cepValidator]],
    street: ['', Validators.required],
    number: ['', Validators.required],
    district: ['', Validators.required],
    city: ['', Validators.required],
    state: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(2)]],
    lat: ['' as string, [Validators.required, latValidator]],
    lng: ['' as string, [Validators.required, lngValidator]],
    notes: [''],
  });

  routeOptions: RouteSummary[] = [];
  selectedSchoolName = '';
  loading = false;
  saving = false;
  saved = false;
  errorMessage = '';
  geoMessage = '';
  geoLoading = false;
  coordMessage = '';
  lastSavedName = '';
  private selectedSchoolCoords: { lat: number | null; lng: number | null; name: string } | null = null;

  constructor(
    private readonly fb: FormBuilder,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly studentsService: StudentsService,
    private readonly schoolsService: SchoolsService,
    private readonly routesService: RoutesService,
    private readonly geoService: GeoService,
    private readonly destroyRef: DestroyRef
  ) {
    this.studentId = this.route.snapshot.paramMap.get('id');
    this.isEdit = !!this.studentId;

    this.schools$.subscribe((schools) => {
      this.schoolsCache = schools;
      this.selectedSchoolName = this.resolveSchoolName(this.form.controls.schoolId.value || '');
    });

    this.form.controls.schoolId.valueChanges.subscribe((schoolId) => {
      const resolvedId = schoolId || '';
      this.selectedSchoolName = this.resolveSchoolName(resolvedId);
      this.loadRouteOptions(resolvedId);
      if (resolvedId) {
        this.schoolsService.getById(resolvedId).subscribe({
          next: (school) => {
            this.selectedSchoolCoords = school
              ? { lat: school.lat ?? null, lng: school.lng ?? null, name: school.name }
              : null;
            this.checkCoordConflict();
          },
          error: () => {
            this.selectedSchoolCoords = null;
            this.checkCoordConflict();
          },
        });
      } else {
        this.selectedSchoolCoords = null;
        this.checkCoordConflict();
      }
    });

    this.form.controls.lat.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.checkCoordConflict());
    this.form.controls.lng.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.checkCoordConflict());

    if (this.isEdit && this.studentId) {
      this.loadStudent(this.studentId);
    }

    setupAddressAutofill(
      this.form,
      this.geoService,
      this.destroyRef,
      undefined,
      (message) => {
        this.geoMessage = message;
      },
      (loading) => {
        this.geoLoading = loading;
      }
    );
  }

  submit(): void {
    this.saved = false;
    this.errorMessage = '';

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (this.hasCoordConflict()) {
      this.errorMessage = 'Coordenadas do aluno iguais às da escola. Revise o endereço.';
      return;
    }

    const raw = this.form.getRawValue();
    const payload: StudentFormData = {
      ...raw,
      cep: normalizeCep(raw.cep),
      state: raw.state?.toString().trim().toUpperCase() ?? '',
      district: raw.district?.toString().trim() ?? '',
      entryTime: raw.entryTime?.toString().trim() || null,
      lat: raw.lat !== '' ? Number(raw.lat) : null,
      lng: raw.lng !== '' ? Number(raw.lng) : null,
      address: buildAddressLabel(raw),
    };
    payload.routeId = this.resolveRouteId(payload.routeName, payload.schoolId);
    if (!this.useApi) {
      payload.schoolName = this.resolveSchoolName(payload.schoolId);
    }

    this.saving = true;

    const request$ = this.isEdit && this.studentId
      ? this.studentsService.update(this.studentId, payload)
      : this.studentsService.create(payload);

    request$.subscribe({
      next: (student) => {
        this.saved = true;
        this.lastSavedName = student.name;
        this.saving = false;
        void this.router.navigate(['/alunos', student.id]);
      },
      error: (error) => {
        this.errorMessage =
          error?.error?.message ??
          error?.message ??
          'Não foi possível salvar agora. Tente novamente.';
        this.saving = false;
      },
    });
  }

  private loadStudent(id: string): void {
    this.loading = true;
    this.errorMessage = '';

    this.studentsService.getById(id).subscribe({
      next: (student) => {
        if (!student) {
          this.errorMessage = 'Aluno não encontrado.';
          this.loading = false;
          return;
        }

        this.form.patchValue({
          name: student.name,
          schoolId: student.schoolId,
          routeName: student.routeName,
          shift: student.shift,
          status: student.status,
          entryTime: student.entryTime ?? '',
          guardian: student.guardian,
          phone: student.phone,
          cep: formatCep(student.cep ?? ''),
          street: student.street ?? '',
          number: student.number ?? '',
          district: student.district ?? '',
          city: student.city ?? '',
          state: student.state ?? '',
          lat: student.lat !== null && student.lat !== undefined ? String(student.lat) : '',
          lng: student.lng !== null && student.lng !== undefined ? String(student.lng) : '',
          notes: student.notes,
        }, { emitEvent: false });

        this.loadRouteOptions(student.schoolId);
        this.form.markAsPristine();
        this.loading = false;
      },
      error: () => {
        this.errorMessage = 'Não foi possível carregar os dados do aluno.';
        this.loading = false;
      },
    });
  }

  private loadRouteOptions(schoolId: string): void {
    if (!schoolId) {
      this.routeOptions = [];
      return;
    }

    this.routesService.listBySchool(schoolId).subscribe({
      next: (routes) => {
        this.routeOptions = routes;
        this.routesCache = routes;
      },
      error: () => {
        this.routeOptions = [];
        this.routesCache = [];
      },
    });
  }

  private resolveSchoolName(schoolId: string): string {
    return this.schoolsCache.find((school) => school.id === schoolId)?.name ?? '';
  }

  private resolveRouteId(routeName: string, schoolId: string): string | null {
    if (!routeName) {
      return null;
    }

    const match = this.routesCache.find(
      (route) =>
        route.schoolId === schoolId &&
        route.name.toLowerCase() === routeName.toLowerCase()
    );
    return match?.id ?? null;
  }

  private hasCoordConflict(): boolean {
    const schoolLat = this.selectedSchoolCoords?.lat;
    const schoolLng = this.selectedSchoolCoords?.lng;
    const rawLat = this.form.controls.lat.value;
    const rawLng = this.form.controls.lng.value;
    const studentLat = rawLat !== '' ? Number(rawLat) : null;
    const studentLng = rawLng !== '' ? Number(rawLng) : null;

    if (
      schoolLat === null ||
      schoolLat === undefined ||
      schoolLng === null ||
      schoolLng === undefined ||
      studentLat === null ||
      studentLat === undefined ||
      studentLng === null ||
      studentLng === undefined
    ) {
      return false;
    }

    const epsilon = 1e-7;
    const sameLat = Math.abs(studentLat - schoolLat) < epsilon;
    const sameLng = Math.abs(studentLng - schoolLng) < epsilon;
    return sameLat && sameLng;
  }

  private checkCoordConflict(): void {
    if (this.hasCoordConflict()) {
      this.coordMessage = `Coordenadas do aluno iguais as da escola ${this.selectedSchoolCoords?.name ?? ''}.`;
      const errors = { ...(this.form.errors ?? {}), sameCoords: true };
      this.form.setErrors(errors);
      return;
    }

    this.coordMessage = '';
    const errors = { ...(this.form.errors ?? {}) };
    if (errors['sameCoords']) {
      delete errors['sameCoords'];
    }
    this.form.setErrors(Object.keys(errors).length ? errors : null);
  }
}
