import { Component } from '@angular/core';
import { AsyncPipe, NgClass, NgIf } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Observable, map, switchMap } from 'rxjs';
import { VehiclesService } from '../services/vehicles.service';
import { VehicleDetail } from '../data/vehicles.data';
import { StatusLabelPipe } from '../shared/status-label.pipe';

@Component({
  selector: 'app-vehicle-detail-page',
  standalone: true,
  imports: [NgIf, NgClass, RouterLink, AsyncPipe, StatusLabelPipe],
  templateUrl: './vehicle-detail.page.html',
  styleUrl: './vehicle-detail.page.css',
})
export class VehicleDetailPageComponent {
  readonly vehicle$: Observable<VehicleDetail | null>;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly vehiclesService: VehiclesService
  ) {
    this.vehicle$ = this.route.paramMap.pipe(
      map((params) => params.get('id') ?? ''),
      switchMap((id) => this.vehiclesService.getById(id))
    );
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
}
