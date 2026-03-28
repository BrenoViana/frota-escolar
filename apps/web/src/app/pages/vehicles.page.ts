import { Component, DestroyRef, inject } from '@angular/core';
import { NgClass, NgFor } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Observable, forkJoin } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { VehiclesService } from '../services/vehicles.service';
import { VehicleSummary } from '../data/vehicles.data';
import { StatusLabelPipe } from '../shared/status-label.pipe';

@Component({
  selector: 'app-vehicles-page',
  standalone: true,
  imports: [NgFor, NgClass, RouterLink, StatusLabelPipe],
  templateUrl: './vehicles.page.html',
  styleUrl: './vehicles.page.css',
})
export class VehiclesPageComponent {
  readonly vehicles$: Observable<VehicleSummary[]> = this.vehiclesService.list();
  vehicles: VehicleSummary[] = [];
  loading = true;
  errorMessage = '';
  private readonly selectedIds = new Set<string>();
  private readonly destroyRef = inject(DestroyRef);

  constructor(private readonly vehiclesService: VehiclesService) {
    this.vehiclesService
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (vehicles) => {
          this.vehicles = vehicles;
          this.loading = false;
        },
        error: (error) => {
          this.errorMessage =
            error?.error?.message ?? error?.message ?? 'Falha ao carregar veículos.';
          this.loading = false;
        },
      });
  }

  statusClass(status: string): string {
    if (status.toLowerCase().includes('manut')) {
      return 'warning';
    }
    if (status.toLowerCase().includes('inativo')) {
      return 'danger';
    }
    return '';
  }

  get selectedCount(): number {
    return this.selectedIds.size;
  }

  allSelected(vehicles: VehicleSummary[]): boolean {
    return vehicles.length > 0 && vehicles.every((vehicle) => this.selectedIds.has(vehicle.id));
  }

  isSelected(id: string): boolean {
    return this.selectedIds.has(id);
  }

  toggleSelection(id: string): void {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
      return;
    }
    this.selectedIds.add(id);
  }

  toggleAll(vehicles: VehicleSummary[]): void {
    if (vehicles.length === 0) {
      return;
    }
    const allSelected = vehicles.every((vehicle) => this.selectedIds.has(vehicle.id));
    if (allSelected) {
      this.selectedIds.clear();
      return;
    }
    vehicles.forEach((vehicle) => this.selectedIds.add(vehicle.id));
  }

  deleteVehicle(vehicle: VehicleSummary): void {
    if (!confirm(`Excluir o veículo ${vehicle.plate}?`)) {
      return;
    }
    this.vehiclesService.delete(vehicle.id).subscribe({
      next: () => this.selectedIds.delete(vehicle.id),
    });
  }

  deleteSelected(): void {
    const ids = Array.from(this.selectedIds);
    if (!ids.length) {
      return;
    }
    if (!confirm(`Excluir ${ids.length} veículo(s) selecionado(s)?`)) {
      return;
    }
    forkJoin(ids.map((id) => this.vehiclesService.delete(id))).subscribe({
      next: () => this.selectedIds.clear(),
    });
  }
}
