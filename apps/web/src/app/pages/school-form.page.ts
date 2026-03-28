import { Component, DestroyRef } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SchoolsService } from '../services/schools.service';
import { SchoolFormData } from '../data/schools.data';
import { GeoService } from '../services/geo.service';
import { setupAddressAutofill } from '../shared/address-autofill';
import { buildAddressLabel, formatCep, normalizeCep } from '../shared/address-utils';
import { cepValidator, latValidator, lngValidator } from '../shared/geo-validators';
import { ShiftLabelPipe } from '../shared/shift-label.pipe';

@Component({
  selector: 'app-school-form-page',
  standalone: true,
  imports: [ReactiveFormsModule, NgIf, NgFor, RouterLink, ShiftLabelPipe],
  templateUrl: './school-form.page.html',
  styleUrl: './school-form.page.css',
})
export class SchoolFormPageComponent {
  readonly shifts = ['Manha', 'Tarde', 'Integral'];
  readonly schoolId: string | null;
  readonly isEdit: boolean;
  readonly useApi = this.schoolsService.useApi;

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    district: ['', Validators.required],
    cep: ['', [Validators.required, cepValidator]],
    street: ['', Validators.required],
    number: ['', Validators.required],
    city: ['', Validators.required],
    state: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(2)]],
    lat: ['' as string, [Validators.required, latValidator]],
    lng: ['' as string, [Validators.required, lngValidator]],
    students: [0, [Validators.required, Validators.min(0)]],
    capacity: [0, [Validators.required, Validators.min(0)]],
    routes: [0, [Validators.min(0)]],
    shift: ['Manha', Validators.required],
    manager: ['', Validators.required],
    phone: ['', Validators.required],
    notes: [''],
  });

  loading = false;
  saving = false;
  saved = false;
  errorMessage = '';
  geoMessage = '';
  geoLoading = false;
  lastSavedName = '';

  constructor(
    private readonly fb: FormBuilder,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly schoolsService: SchoolsService,
    private readonly geoService: GeoService,
    private readonly destroyRef: DestroyRef
  ) {
    this.schoolId = this.route.snapshot.paramMap.get('id');
    this.isEdit = !!this.schoolId;

    if (this.isEdit && this.schoolId) {
      this.loadSchool(this.schoolId);
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

    const raw = this.form.getRawValue();
    const payload: SchoolFormData = {
      ...raw,
      cep: normalizeCep(raw.cep),
      state: raw.state?.toString().trim().toUpperCase() ?? '',
      lat: raw.lat !== '' ? Number(raw.lat) : null,
      lng: raw.lng !== '' ? Number(raw.lng) : null,
      address: buildAddressLabel(raw),
    };
    this.saving = true;

    const request$ = this.isEdit && this.schoolId
      ? this.schoolsService.update(this.schoolId, payload)
      : this.schoolsService.create(payload);

    request$.subscribe({
      next: (school) => {
        this.saved = true;
        this.lastSavedName = school.name;
        this.saving = false;
        void this.router.navigate(['/escolas', school.id]);
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

  private loadSchool(id: string): void {
    this.loading = true;
    this.errorMessage = '';

    this.schoolsService.getById(id).subscribe({
      next: (school) => {
        if (!school) {
          this.errorMessage = 'Escola não encontrada.';
          this.loading = false;
          return;
        }

        this.form.patchValue({
          name: school.name,
          district: school.district,
          cep: formatCep(school.cep ?? ''),
          street: school.street ?? '',
          number: school.number ?? '',
          city: school.city ?? '',
          state: school.state ?? '',
          lat: school.lat !== null && school.lat !== undefined ? String(school.lat) : '',
          lng: school.lng !== null && school.lng !== undefined ? String(school.lng) : '',
          students: school.students,
          capacity: school.capacity,
          routes: school.routes,
          shift: school.shift,
          manager: school.manager,
          phone: school.phone,
          notes: school.notes,
        }, { emitEvent: false });

        this.form.markAsPristine();
        this.loading = false;
      },
      error: () => {
        this.errorMessage = 'Não foi possível carregar os dados da escola.';
        this.loading = false;
      },
    });
  }
}
