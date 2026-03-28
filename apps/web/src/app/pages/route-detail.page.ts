import { Component, ElementRef, ViewChild } from '@angular/core';
import { AsyncPipe, DecimalPipe, NgClass, NgFor, NgIf } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Observable, map, switchMap, tap } from 'rxjs';
import * as L from 'leaflet';
import { RoutesService } from '../services/routes.service';
import { OptimizationsService } from '../services/optimizations.service';
import { RouteDetail } from '../data/routes.data';
import { RouteOptimizationResult, RouteOptimizationStop } from '../data/optimizations.data';
import { ShiftLabelPipe } from '../shared/shift-label.pipe';
import { StatusLabelPipe } from '../shared/status-label.pipe';

@Component({
  selector: 'app-route-detail-page',
  standalone: true,
  imports: [
    NgIf,
    NgFor,
    NgClass,
    RouterLink,
    AsyncPipe,
    DecimalPipe,
    ShiftLabelPipe,
    StatusLabelPipe,
  ],
  templateUrl: './route-detail.page.html',
  styleUrl: './route-detail.page.css',
})
export class RouteDetailPageComponent {
  readonly routeId$: Observable<string>;
  readonly route$: Observable<RouteDetail | null>;
  routeId = '';
  optimization: RouteOptimizationResult | null = null;
  optimizationLoading = true;
  optimizationError = '';
  private map?: L.Map;
  private routeLayer?: L.LayerGroup;

  @ViewChild('mapContainer') mapContainer?: ElementRef<HTMLDivElement>;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly routesService: RoutesService,
    private readonly optimizationsService: OptimizationsService
  ) {
    this.routeId$ = this.route.paramMap.pipe(
      map((params) => params.get('id') ?? ''),
      tap((id) => {
        this.routeId = id;
      })
    );

    this.route$ = this.routeId$.pipe(switchMap((id) => this.routesService.getById(id)));

    this.routeId$
      .pipe(
        tap(() => {
          this.optimizationLoading = true;
          this.optimizationError = '';
          this.optimization = null;
        }),
        switchMap((id) => this.optimizationsService.getOptimization(id))
      )
      .subscribe({
        next: (result) => {
          this.optimization = result;
          this.optimizationLoading = false;
          if (this.optimization?.routes?.length) {
            this.optimization.routes.forEach((plan) => this.recalculatePlanArrivals(plan));
            setTimeout(() => this.renderMap(), 0);
          }
        },
        error: (error) => {
          this.optimizationError =
            error?.error?.message ?? error?.message ?? 'Falha ao carregar a otimização.';
          this.optimizationLoading = false;
        },
      });
  }

  statusClass(status: string): string {
    if (status.toLowerCase().includes('pend') || status.toLowerCase().includes('revis')) {
      return 'warning';
    }
    if (status.toLowerCase().includes('crit') || status.toLowerCase().includes('atras')) {
      return 'danger';
    }
    return '';
  }

  totalDistance(result: RouteOptimizationResult): number {
    return result.routes.reduce((acc, route) => acc + (route.totalDistanceKm || 0), 0);
  }

  totalDuration(result: RouteOptimizationResult): number {
    return result.routes.reduce((acc, route) => acc + this.planDuration(route), 0);
  }

  displayStops(plan: RouteOptimizationResult['routes'][number]): DisplayStop[] {
    return this.buildGroupedStops(plan);
  }

  planDuration(plan: RouteOptimizationResult['routes'][number]): number {
    if (!plan.stops?.length) {
      return plan.totalDurationMin || 0;
    }
    const startMin = this.parseTimeToMinutes(plan.stops[0]?.arrival);
    const lastArrival = this.parseTimeToMinutes(plan.stops[plan.stops.length - 1]?.arrival);
    if (startMin === null || lastArrival === null) {
      return plan.totalDurationMin || 0;
    }
    let diff = lastArrival - startMin;
    if (diff < 0) {
      diff += 24 * 60;
    }
    return diff;
  }

  private serviceMinutes(
    type: RouteOptimizationResult['routes'][number]['stops'][number]['type']
  ): number {
    if (type === 'pickup') {
      return 1;
    }
    if (type === 'delivery') {
      return 2;
    }
    return 0;
  }

  private recalculatePlanArrivals(plan: RouteOptimizationResult['routes'][number]): void {
    let currentMin = this.parseTimeToMinutes(plan.stops[0]?.arrival) ?? 0;
    const avgSpeedKmh = 30;

    plan.stops.forEach((stop, index) => {
      if (index === 0) {
        stop.arrival = this.formatMinutes(currentMin);
        return;
      }

      let durationMin = stop.durationMin ?? 0;
      if (durationMin === 0 && stop.distanceKm !== undefined && stop.distanceKm > 0) {
        durationMin = (stop.distanceKm / avgSpeedKmh) * 60;
      }

      currentMin += durationMin;
      stop.arrival = this.formatMinutes(currentMin);
      const serviceMin = this.serviceMinutes(stop.type);
      if (serviceMin > 0) {
        currentMin += serviceMin;
      }
    });
  }

  private buildGroupedStops(plan: RouteOptimizationResult['routes'][number]): DisplayStop[] {
    if (!plan.stops?.length) {
      return [];
    }

    const grouped: DisplayStop[] = [];
    let index = 0;
    while (index < plan.stops.length) {
      const current = plan.stops[index];
      if (current.type !== 'delivery') {
        grouped.push(current);
        index += 1;
        continue;
      }

      const key = this.stopGroupKey(current);
      const group: RouteOptimizationStop[] = [current];
      let nextIndex = index + 1;

      while (nextIndex < plan.stops.length) {
        const candidate = plan.stops[nextIndex];
        if (candidate.type !== 'delivery' || this.stopGroupKey(candidate) !== key) {
          break;
        }
        group.push(candidate);
        nextIndex += 1;
      }

      if (group.length === 1) {
        grouped.push(current);
        index = nextIndex;
        continue;
      }

      const studentNames = group
        .map((stop) => stop.studentName)
        .filter((name): name is string => !!name);
      const totalDistance = group.reduce((sum, stop) => sum + (stop.distanceKm ?? 0), 0);
      const totalDuration = group.reduce((sum, stop) => sum + (stop.durationMin ?? 0), 0);
      const labelSuffix = studentNames.length ? ` (${studentNames.length} alunos)` : '';

      grouped.push({
        ...current,
        label: `${current.label}${labelSuffix}`,
        distanceKm: totalDistance,
        durationMin: totalDuration,
        studentId: undefined,
        studentName: undefined,
        groupedStudents: studentNames,
        groupedCount: studentNames.length,
      });

      index = nextIndex;
    }

    return grouped;
  }

  private stopGroupKey(stop: RouteOptimizationStop): string {
    const address = this.normalizeAddress(stop.address);
    const coords =
      stop.lat !== undefined && stop.lng !== undefined
        ? `${stop.lat.toFixed(6)},${stop.lng.toFixed(6)}`
        : '';
    return `${stop.type}|${stop.schoolId ?? ''}|${address}|${coords}`;
  }

  private normalizeAddress(value?: string): string {
    return value?.toLowerCase().replace(/\s+/g, ' ').trim() ?? '';
  }

  private parseTimeToMinutes(value?: string | null): number | null {
    if (!value) {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const [rawHour, rawMinute] = trimmed.split(':');
    const hour = Number(rawHour);
    const minute = Number(rawMinute);
    if (Number.isNaN(hour) || Number.isNaN(minute)) {
      return null;
    }
    return hour * 60 + minute;
  }

  private formatMinutes(totalMinutes: number): string {
    const safe = Math.max(0, Math.round(totalMinutes));
    const hours = Math.floor(safe / 60) % 24;
    const minutes = safe % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  private renderMap(): void {
    if (!this.mapContainer || !this.optimization) {
      return;
    }

    if (!this.map) {
      this.map = L.map(this.mapContainer.nativeElement, {
        zoomControl: true,
        attributionControl: true,
      });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap',
      }).addTo(this.map);

      const iconBase = 'https://unpkg.com/leaflet@1.9.4/dist/images/';
      L.Icon.Default.mergeOptions({
        iconUrl: `${iconBase}marker-icon.png`,
        shadowUrl: `${iconBase}marker-shadow.png`,
      });
    }

    this.routeLayer?.remove();
    this.routeLayer = L.layerGroup();

    const polylines: L.Polyline[] = [];
    this.optimization.routes.forEach((plan) => {
      const points = plan.geometry?.length
        ? plan.geometry.map((point) => [point.lat, point.lng] as L.LatLngExpression)
        : plan.stops
            .filter((stop) => stop.lat !== undefined && stop.lng !== undefined)
            .map((stop) => [stop.lat as number, stop.lng as number] as L.LatLngExpression);
      if (points.length < 2) {
        return;
      }

      const line = L.polyline(points, { color: '#d96a3b', weight: 4, opacity: 0.9 });
      polylines.push(line);
      line.addTo(this.routeLayer!);

      plan.stops.forEach((stop) => {
        if (stop.lat === undefined || stop.lng === undefined) {
          return;
        }
        const marker = L.marker([stop.lat, stop.lng], {
          title: `${stop.sequence}. ${stop.label}`,
          icon: this.buildStopIcon(stop.type),
        });
        const tooltip = this.buildStopTooltip(stop);
        if (tooltip) {
          marker.bindTooltip(tooltip, {
            direction: 'top',
            offset: [0, -8],
            opacity: 0.9,
          });
        }
        marker.addTo(this.routeLayer!);
      });
    });

    if (polylines.length > 0) {
      const bounds = polylines[0].getBounds();
      polylines.slice(1).forEach((line) => bounds.extend(line.getBounds()));
      this.routeLayer.addTo(this.map);
      this.map.fitBounds(bounds.pad(0.2));
    } else {
      this.routeLayer.addTo(this.map);
      this.map.setView([-15.77972, -47.92972], 5);
    }

    this.map.invalidateSize();
  }

  private stopColor(type: RouteOptimizationResult['routes'][number]['stops'][number]['type']): string {
    if (type === 'start') {
      return '#2f9e44';
    }
    if (type === 'end') {
      return '#6c757d';
    }
    if (type === 'delivery') {
      return '#d96a3b';
    }
    return '#2b6cb0';
  }

  private buildStopIcon(
    type: RouteOptimizationResult['routes'][number]['stops'][number]['type']
  ): L.DivIcon {
    const color = this.stopColor(type);
    const style = [
      `background:${color}`,
      'width:12px',
      'height:12px',
      'border-radius:999px',
      'border:2px solid #fff',
      'display:block',
      'box-shadow:0 0 0 1px rgba(0,0,0,0.2)',
    ].join(';');
    return L.divIcon({
      className: 'stop-marker',
      html: `<span style="${style}"></span>`,
      iconSize: [12, 12],
      iconAnchor: [6, 6],
    });
  }

  private buildStopTooltip(
    stop: RouteOptimizationResult['routes'][number]['stops'][number]
  ): string {
    const parts: string[] = [];
    if (stop.label) {
      parts.push(stop.label);
    }
    if (stop.distanceKm !== undefined) {
      parts.push(`${stop.distanceKm.toFixed(1)} km`);
    }
    if (stop.durationMin !== undefined) {
      parts.push(`${Math.round(stop.durationMin)} min`);
    }
    return parts.join(' • ');
  }
}

type DisplayStop = RouteOptimizationStop & {
  groupedStudents?: string[];
  groupedCount?: number;
};
