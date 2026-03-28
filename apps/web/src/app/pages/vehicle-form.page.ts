import { Component, DestroyRef } from '@angular/core';
import { AsyncPipe, NgFor, NgIf } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { VehiclesService } from '../services/vehicles.service';
import { RoutesService } from '../services/routes.service';
import { VehicleFormData } from '../data/vehicles.data';
import { RouteSummary } from '../data/routes.data';
import { GeoService } from '../services/geo.service';
import { setupAddressAutofill } from '../shared/address-autofill';
import { formatCep, normalizeCep } from '../shared/address-utils';
import { cepValidator, latValidator, lngValidator } from '../shared/geo-validators';
import { StatusLabelPipe } from '../shared/status-label.pipe';

@Component({
  selector: 'app-vehicle-form-page',
  standalone: true,
  imports: [ReactiveFormsModule, NgIf, NgFor, AsyncPipe, RouterLink, StatusLabelPipe],
  templateUrl: './vehicle-form.page.html',
  styleUrl: './vehicle-form.page.css',
})
export class VehicleFormPageComponent {
  readonly statuses = ['Ativo', 'Disponivel', 'Manutencao'];
  readonly vehicleId: string | null;
  readonly isEdit: boolean;
  readonly routes$: Observable<RouteSummary[]> = this.routesService.list();

  readonly form = this.fb.nonNullable.group({
    plate: ['', [Validators.required, Validators.minLength(6)]],
    model: ['', Validators.required],
    capacity: [0, [Validators.required, Validators.min(0)]],
    status: ['Disponivel', Validators.required],
    routeId: [''],
    garageCep: ['', [Validators.required, cepValidator]],
    garageStreet: ['', Validators.required],
    garageNumber: ['', Validators.required],
    garageDistrict: ['', Validators.required],
    garageCity: ['', Validators.required],
    garageState: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(2)]],
    garageLat: ['' as string, [Validators.required, latValidator]],
    garageLng: ['' as string, [Validators.required, lngValidator]],
    notes: [''],
  });

  loading = false;
  saving = false;
  errorMessage = '';
  geoMessage = '';
  geoLoading = false;

  constructor(
    private readonly fb: FormBuilder,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly vehiclesService: VehiclesService,
    private readonly routesService: RoutesService,
    private readonly geoService: GeoService,
    private readonly destroyRef: DestroyRef
  ) {
    this.vehicleId = this.route.snapshot.paramMap.get('id');
    this.isEdit = !!this.vehicleId;

    if (this.isEdit && this.vehicleId) {
      this.loadVehicle(this.vehicleId);
    }

    setupAddressAutofill(
      this.form,
      this.geoService,
      this.destroyRef,
      {
        cep: 'garageCep',
        street: 'garageStreet',
        district: 'garageDistrict',
        number: 'garageNumber',
        city: 'garageCity',
        state: 'garageState',
        lat: 'garageLat',
        lng: 'garageLng',
      },
      (message) => {
        this.geoMessage = message;
      },
      (loading) => {
        this.geoLoading = loading;
      }
    );
  }

  submit(): void {
    this.errorMessage = '';

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const payload: VehicleFormData = {
      ...raw,
      garageCep: normalizeCep(raw.garageCep),
      garageState: raw.garageState?.toString().trim().toUpperCase() ?? '',
      garageDistrict: raw.garageDistrict?.toString().trim() ?? '',
      garageLat: raw.garageLat !== '' ? Number(raw.garageLat) : null,
      garageLng: raw.garageLng !== '' ? Number(raw.garageLng) : null,
    };
    if (!payload.routeId) {
      payload.routeId = null;
    }

    this.saving = true;

    const request$ = this.isEdit && this.vehicleId
      ? this.vehiclesService.update(this.vehicleId, payload)
      : this.vehiclesService.create(payload);

    request$.subscribe({
      next: (vehicle) => {
        this.saving = false;
        void this.router.navigate(['/veiculos', vehicle.id]);
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

  private loadVehicle(id: string): void {
    this.loading = true;
    this.errorMessage = '';

    this.vehiclesService.getById(id).subscribe({
      next: (vehicle) => {
        if (!vehicle) {
          this.errorMessage = 'Veículo não encontrado.';
          this.loading = false;
          return;
        }

        this.form.patchValue({
          plate: vehicle.plate,
          model: vehicle.model,
          capacity: vehicle.capacity,
          status: vehicle.status,
          routeId: vehicle.routeId ?? '',
          garageCep: formatCep(vehicle.garageCep ?? ''),
          garageStreet: vehicle.garageStreet ?? '',
          garageNumber: vehicle.garageNumber ?? '',
          garageDistrict: vehicle.garageDistrict ?? '',
          garageCity: vehicle.garageCity ?? '',
          garageState: vehicle.garageState ?? '',
          garageLat:
            vehicle.garageLat !== null && vehicle.garageLat !== undefined
              ? String(vehicle.garageLat)
              : '',
          garageLng:
            vehicle.garageLng !== null && vehicle.garageLng !== undefined
              ? String(vehicle.garageLng)
              : '',
          notes: vehicle.notes,
        }, { emitEvent: false });

        this.form.markAsPristine();
        this.loading = false;
      },
      error: () => {
        this.errorMessage = 'Não foi possível carregar os dados do veículo.';
        this.loading = false;
      },
    });
  }
}
