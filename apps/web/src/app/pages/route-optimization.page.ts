import { Component, ElementRef, ViewChild } from '@angular/core';
import { AsyncPipe, DecimalPipe, NgFor, NgIf } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Observable, combineLatest, map, switchMap, tap } from 'rxjs';
import * as L from 'leaflet';
import { RoutesService } from '../services/routes.service';
import { OptimizationsService } from '../services/optimizations.service';
import { StudentsService } from '../services/students.service';
import { VehiclesService } from '../services/vehicles.service';
import { RouteDetail } from '../data/routes.data';
import {
  RouteOptimizationRequest,
  RouteOptimizationResult,
  RouteOptimizationStop,
  RouteOptimizationUpdateRequest,
} from '../data/optimizations.data';
import { StudentSummary } from '../data/students.data';
import { VehicleSummary } from '../data/vehicles.data';
import { StatusLabelPipe } from '../shared/status-label.pipe';

@Component({
  selector: 'app-route-optimization-page',
  standalone: true,
  imports: [ReactiveFormsModule, NgIf, NgFor, AsyncPipe, DecimalPipe, RouterLink, StatusLabelPipe],
  templateUrl: './route-optimization.page.html',
  styleUrl: './route-optimization.page.css',
})
export class RouteOptimizationPageComponent {
  readonly routeId: string;
  readonly route$: Observable<RouteDetail | null>;
  readonly vm$: Observable<{
    route: RouteDetail | null;
    students: StudentSummary[];
    vehicles: VehicleSummary[];
  }>;
  students: StudentSummary[] = [];
  vehicles: VehicleSummary[] = [];
  private initialized = false;
  private autoTriggered = false;
  private optimizationLoaded = false;
  private readonly autoOptimize: boolean;
  private readonly selectedIds = new Set<string>();
  private readonly selectedVehicleIds = new Set<string>();

  readonly form = this.fb.group({
    garageAddress: [''],
    garageLat: [''],
    garageLng: [''],
    departAt: [''],
  });

  loading = false;
  saving = false;
  recalculating = false;
  private recalcQueued = false;
  private recalcTimer?: ReturnType<typeof setTimeout>;
  private readonly recalcDelayMs = 400;
  showUpdatedBadge = false;
  private updatedTimer?: ReturnType<typeof setTimeout>;
  showEstimateBadge = false;
  errorMessage = '';
  result: RouteOptimizationResult | null = null;
  editing = false;
  private editSnapshot: RouteOptimizationResult | null = null;
  private dragSource: { planIndex: number; stopIndex: number } | null = null;
  private dragTarget: {
    planIndex: number;
    stopIndex: number;
    position: 'before' | 'after';
  } | null = null;
  showMap = false;
  private map?: L.Map;
  private routeLayer?: L.LayerGroup;

  @ViewChild('mapContainer') mapContainer?: ElementRef<HTMLDivElement>;

  constructor(
    private readonly fb: FormBuilder,
    private readonly route: ActivatedRoute,
    private readonly routesService: RoutesService,
    private readonly optimizationsService: OptimizationsService,
    private readonly studentsService: StudentsService,
    private readonly vehiclesService: VehiclesService
  ) {
    this.routeId = this.route.snapshot.paramMap.get('id') ?? '';
    this.autoOptimize = this.route.snapshot.queryParamMap.get('auto') === '1';
    this.route$ = this.route.paramMap.pipe(
      map((params) => params.get('id') ?? ''),
      switchMap((id) => this.routesService.getById(id))
    );

    this.vm$ = combineLatest([
      this.route$,
      this.studentsService.list(),
      this.vehiclesService.list(),
    ]).pipe(
      map(([routeData, students, vehicles]) => ({
        route: routeData,
        students,
        vehicles,
      })),
      tap((vm) => {
        this.students = vm.students;
        this.vehicles = vm.vehicles;
        if (!this.initialized && vm.route) {
          const initialStudents = vm.route.studentsList ?? [];
          initialStudents.forEach((student) => this.selectedIds.add(student.id));
          if (vm.route.vehicleId) {
            this.selectedVehicleIds.add(vm.route.vehicleId);
          }
          this.form.patchValue({ departAt: vm.route.startTime ?? '06:00' }, { emitEvent: false });
          this.initialized = true;
        }
        if (this.initialized && !this.optimizationLoaded) {
          this.optimizationLoaded = true;
          this.loadSavedOptimization();
        }
        if (this.autoOptimize && this.initialized && !this.autoTriggered) {
          this.autoTriggered = true;
          setTimeout(() => this.optimize(), 0);
        }
      })
    );
  }

  get selectedCount(): number {
    return this.selectedIds.size;
  }

  get allSelected(): boolean {
    return this.students.length > 0 && this.selectedIds.size === this.students.length;
  }

  get selectedVehicleCount(): number {
    return this.selectedVehicleIds.size;
  }

  get allVehiclesSelected(): boolean {
    return this.vehicles.length > 0 && this.selectedVehicleIds.size === this.vehicles.length;
  }

  isSelected(id: string): boolean {
    return this.selectedIds.has(id);
  }

  isVehicleSelected(id: string): boolean {
    return this.selectedVehicleIds.has(id);
  }

  toggleStudent(id: string): void {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
      return;
    }
    this.selectedIds.add(id);
  }

  selectAll(): void {
    this.students.forEach((student) => this.selectedIds.add(student.id));
  }

  clearSelection(): void {
    this.selectedIds.clear();
  }

  toggleVehicle(id: string): void {
    if (this.selectedVehicleIds.has(id)) {
      this.selectedVehicleIds.delete(id);
      return;
    }
    this.selectedVehicleIds.add(id);
  }

  selectAllVehicles(): void {
    this.vehicles.forEach((vehicle) => this.selectedVehicleIds.add(vehicle.id));
  }

  clearVehicles(): void {
    this.selectedVehicleIds.clear();
  }

  totalDistance(result: RouteOptimizationResult): number {
    return result.routes.reduce((acc, route) => acc + (route.totalDistanceKm || 0), 0);
  }

  totalDuration(result: RouteOptimizationResult): number {
    return result.routes.reduce((acc, route) => acc + this.planDuration(route), 0);
  }

  displayStops(plan: RouteOptimizationResult['routes'][number]): DisplayStop[] {
    if (this.editing) {
      return plan.stops;
    }
    return this.buildGroupedStops(plan);
  }

  planDuration(plan: RouteOptimizationResult['routes'][number]): number {
    if (!plan.stops?.length) {
      return plan.totalDurationMin || 0;
    }
    const departAt = this.form.value.departAt?.toString().trim() ?? '';
    const startMin =
      this.parseTimeToMinutes(departAt) ?? this.parseTimeToMinutes(plan.stops[0]?.arrival);
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

  private loadSavedOptimization(): void {
    if (!this.routeId || this.result) {
      return;
    }

    this.optimizationsService.getOptimization(this.routeId).subscribe({
      next: (result) => {
        if (result?.routes?.length) {
          this.result = result;
          this.result.routes.forEach((plan) => this.recalculatePlanArrivals(plan));
          this.showEstimateBadge = false;
          if (this.showMap) {
            setTimeout(() => this.renderMap(), 0);
          }
        }
      },
      error: () => {
        // Sem otimização salva ainda.
      },
    });
  }

  startEdit(): void {
    if (!this.result) {
      return;
    }
    this.editSnapshot = JSON.parse(JSON.stringify(this.result)) as RouteOptimizationResult;
    this.editing = true;
    this.errorMessage = '';
    this.showEstimateBadge = false;
    this.resetDrag();
  }

  cancelEdit(): void {
    if (this.editSnapshot) {
      this.result = this.editSnapshot;
    }
    this.editSnapshot = null;
    this.editing = false;
    this.showEstimateBadge = false;
    this.resetDrag();
    if (this.showMap) {
      setTimeout(() => this.renderMap(), 0);
    }
  }

  saveEdit(): void {
    if (!this.result) {
      return;
    }
    this.errorMessage = '';

    const payload = this.buildUpdatePayload(true);
    if (!payload) {
      return;
    }

    this.saving = true;
    this.optimizationsService.updateOptimization(this.routeId, payload).subscribe({
      next: (result) => {
        this.result = result;
        this.result.routes.forEach((plan) => this.recalculatePlanArrivals(plan));
        this.editing = false;
        this.editSnapshot = null;
        this.showEstimateBadge = false;
        this.saving = false;
        if (this.showMap) {
          setTimeout(() => this.renderMap(), 0);
        }
      },
      error: (error) => {
        this.errorMessage =
          error?.error?.message ?? error?.message ?? 'Não foi possível salvar ajustes.';
        this.saving = false;
      },
    });
  }

  isDraggableStop(stop: RouteOptimizationResult['routes'][number]['stops'][number]): boolean {
    if (!this.editing) {
      return false;
    }
    return stop.type !== 'start' && stop.type !== 'end';
  }

  isDragging(planIndex: number, stopIndex: number): boolean {
    return (
      this.dragSource?.planIndex === planIndex &&
      this.dragSource?.stopIndex === stopIndex
    );
  }

  isDragOver(planIndex: number, stopIndex: number): boolean {
    return (
      this.dragTarget?.planIndex === planIndex &&
      this.dragTarget?.stopIndex === stopIndex
    );
  }

  isDragOverBefore(planIndex: number, stopIndex: number): boolean {
    return (
      this.dragTarget?.planIndex === planIndex &&
      this.dragTarget?.stopIndex === stopIndex &&
      this.dragTarget?.position === 'before'
    );
  }

  isDragOverAfter(planIndex: number, stopIndex: number): boolean {
    return (
      this.dragTarget?.planIndex === planIndex &&
      this.dragTarget?.stopIndex === stopIndex &&
      this.dragTarget?.position === 'after'
    );
  }

  onDragStart(planIndex: number, stopIndex: number, event: DragEvent): void {
    const plan = this.result?.routes[planIndex];
    const stop = plan?.stops[stopIndex];
    if (!plan || !stop || !this.isDraggableStop(stop)) {
      event.preventDefault();
      return;
    }
    this.dragSource = { planIndex, stopIndex };
    this.dragTarget = null;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', `${planIndex}:${stopIndex}`);
    }
  }

  onDragOver(planIndex: number, stopIndex: number, event: DragEvent): void {
    if (!this.dragSource) {
      return;
    }
    const plan = this.result?.routes[planIndex];
    const stop = plan?.stops[stopIndex];
    if (!plan || !stop || !this.isDraggableStop(stop)) {
      return;
    }
    if (this.dragSource.planIndex !== planIndex) {
      return;
    }
    const target = event.currentTarget as HTMLElement | null;
    if (!target) {
      return;
    }
    const rect = target.getBoundingClientRect();
    const halfway = rect.top + rect.height / 2;
    const position = event.clientY < halfway ? 'before' : 'after';
    event.preventDefault();
    this.dragTarget = { planIndex, stopIndex, position };
  }

  onDrop(planIndex: number, stopIndex: number, event: DragEvent): void {
    if (!this.dragSource) {
      return;
    }
    const plan = this.result?.routes[planIndex];
    const stop = plan?.stops[stopIndex];
    if (!plan || !stop || !this.isDraggableStop(stop)) {
      this.resetDrag();
      return;
    }
    if (this.dragSource.planIndex !== planIndex) {
      this.resetDrag();
      return;
    }
    event.preventDefault();
    const fromIndex = this.dragSource.stopIndex;
    const position = this.dragTarget?.position ?? 'before';
    const toIndex = stopIndex + (position === 'after' ? 1 : 0);
    if (fromIndex === toIndex || fromIndex + 1 === toIndex) {
      this.resetDrag();
      return;
    }

    const nextStops = [...plan.stops];
    const [moved] = nextStops.splice(fromIndex, 1);
    const insertIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
    nextStops.splice(insertIndex, 0, moved);
    plan.stops = nextStops.map((item, index) => ({ ...item, sequence: index + 1 }));
    this.recalculatePlanSegments(plan);
    this.recalculatePlanArrivals(plan);
    this.showEstimateBadge = true;
    this.queueBackendRecalculate();
    this.resetDrag();
  }

  onDragEnd(): void {
    this.resetDrag();
  }

  private resetDrag(): void {
    this.dragSource = null;
    this.dragTarget = null;
  }

  private serviceMinutes(type: RouteOptimizationResult['routes'][number]['stops'][number]['type']): number {
    if (type === 'pickup') {
      return 1;
    }
    if (type === 'delivery') {
      return 2;
    }
    return 0;
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

  private queueBackendRecalculate(): void {
    if (!this.editing || !this.result) {
      return;
    }
    if (this.recalcTimer) {
      clearTimeout(this.recalcTimer);
    }
    this.recalcTimer = setTimeout(() => {
      this.recalcTimer = undefined;
      this.requestBackendRecalculate();
    }, this.recalcDelayMs);
  }

  private buildUpdatePayload(showError: boolean): RouteOptimizationUpdateRequest | null {
    if (!this.result) {
      return null;
    }

    const payload: RouteOptimizationUpdateRequest = {
      routes: this.result.routes.map((plan) => {
        const stopIds = plan.stops
          .map((stop) => stop.stopId)
          .filter((id): id is string => !!id);
        return {
          vehicleId: plan.vehicleId ?? null,
          stopIds,
        };
      }),
    };

    const hasMissingStop = payload.routes.some(
      (routeItem, index) =>
        routeItem.stopIds.length !== (this.result?.routes[index]?.stops.length ?? 0)
    );
    if (hasMissingStop) {
      if (showError) {
        this.errorMessage = 'Alguns pontos não podem ser reordenados. Refaça a otimização.';
      }
      return null;
    }

    return payload;
  }

  private requestBackendRecalculate(): void {
    if (!this.editing || !this.result) {
      return;
    }
    const payload = this.buildUpdatePayload(false);
    if (!payload) {
      return;
    }
    if (this.recalculating) {
      this.recalcQueued = true;
      return;
    }
    this.recalculating = true;

    this.optimizationsService.updateOptimization(this.routeId, payload).subscribe({
      next: (result) => {
        this.result = result;
        this.result.routes.forEach((plan) => this.recalculatePlanArrivals(plan));
        this.showUpdatedBadge = true;
        this.showEstimateBadge = false;
        if (this.updatedTimer) {
          clearTimeout(this.updatedTimer);
        }
        this.updatedTimer = setTimeout(() => {
          this.showUpdatedBadge = false;
        }, 2500);
        this.recalculating = false;
        if (this.recalcQueued) {
          this.recalcQueued = false;
          this.requestBackendRecalculate();
        }
        if (this.showMap) {
          setTimeout(() => this.renderMap(), 0);
        }
      },
      error: (error) => {
        this.errorMessage =
          error?.error?.message ?? error?.message ?? 'Falha ao recalcular distâncias.';
        this.recalculating = false;
      },
    });
  }

  private recalculatePlanSegments(plan: RouteOptimizationResult['routes'][number]): void {
    const avgSpeedKmh = 30;
    let totalDistance = 0;
    let totalDuration = 0;

    plan.stops = plan.stops.map((stop, index) => {
      if (index === 0) {
        return {
          ...stop,
          distanceKm: 0,
          durationMin: 0,
        };
      }

      const prev = plan.stops[index - 1];
      let distanceKm =
        prev.lat !== undefined &&
        prev.lng !== undefined &&
        stop.lat !== undefined &&
        stop.lng !== undefined
          ? this.distanceKm(prev.lat, prev.lng, stop.lat, stop.lng)
          : stop.distanceKm;

      if (distanceKm === undefined || Number.isNaN(distanceKm)) {
        distanceKm = 0;
      }

      let durationMin =
        distanceKm > 0 ? (distanceKm / avgSpeedKmh) * 60 : stop.durationMin ?? 0;

      if (durationMin === undefined || Number.isNaN(durationMin)) {
        durationMin = 0;
      }

      totalDistance += distanceKm;
      totalDuration += durationMin;

      return {
        ...stop,
        distanceKm,
        durationMin,
      };
    });

    plan.totalDistanceKm = totalDistance;
    plan.totalDurationMin = totalDuration;
  }

  private recalculatePlanArrivals(plan: RouteOptimizationResult['routes'][number]): void {
    const departAt = this.form.value.departAt?.toString().trim() ?? '';
    let currentMin =
      this.parseTimeToMinutes(departAt) ??
      this.parseTimeToMinutes(plan.stops[0]?.arrival) ??
      0;
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

  private distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lng2 - lng1);
    const rLat1 = toRad(lat1);
    const rLat2 = toRad(lat2);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return 6371 * c;
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

  optimize(): void {
    this.errorMessage = '';
    this.result = null;
    this.editing = false;
    this.editSnapshot = null;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (!this.selectedIds.size) {
      this.errorMessage = 'Selecione pelo menos um aluno para otimizar.';
      return;
    }

    const payload: RouteOptimizationRequest = {
      garageAddress: this.form.value.garageAddress?.trim() ?? undefined,
      garageLat: this.form.value.garageLat ? Number(this.form.value.garageLat) : undefined,
      garageLng: this.form.value.garageLng ? Number(this.form.value.garageLng) : undefined,
      departAt: this.form.value.departAt?.trim() ?? undefined,
      studentIds: Array.from(this.selectedIds),
      vehicleIds: this.selectedVehicleIds.size ? Array.from(this.selectedVehicleIds) : undefined,
    };

    this.loading = true;
    this.optimizationsService.optimizeRoute(this.routeId, payload).subscribe({
      next: (result) => {
        this.result = result;
        this.result.routes.forEach((plan) => this.recalculatePlanArrivals(plan));
        this.loading = false;
        this.showEstimateBadge = false;
        if (this.showMap) {
          setTimeout(() => this.renderMap(), 0);
        }
      },
      error: (error) => {
        this.errorMessage =
          error?.error?.message ??
          error?.message ??
          'Não foi possível otimizar agora. Tente novamente.';
        this.loading = false;
      },
    });
  }

  get hasManualGarage(): boolean {
    const address = this.form.value.garageAddress?.toString().trim() ?? '';
    const lat = this.form.value.garageLat?.toString().trim() ?? '';
    const lng = this.form.value.garageLng?.toString().trim() ?? '';
    return !!address || !!lat || !!lng;
  }

  clearGarageFields(): void {
    this.form.patchValue(
      { garageAddress: '', garageLat: '', garageLng: '' },
      { emitEvent: false }
    );
  }

  toggleMap(): void {
    this.showMap = !this.showMap;
    if (this.showMap) {
      setTimeout(() => this.renderMap(), 0);
    } else {
      this.destroyMap();
    }
  }

  private renderMap(): void {
    if (!this.mapContainer || !this.result) {
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
    this.result.routes.forEach((plan) => {
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
      this.map.setView([ -15.77972, -47.92972 ], 5);
    }

    this.map.invalidateSize();
  }

  private destroyMap(): void {
    if (this.map) {
      this.map.remove();
      this.map = undefined;
      this.routeLayer = undefined;
    }
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

  stopChipLabel(
    type: RouteOptimizationResult['routes'][number]['stops'][number]['type']
  ): string {
    if (type === 'start') {
      return 'Garagem';
    }
    if (type === 'end') {
      return 'Retorno';
    }
    if (type === 'delivery') {
      return 'Entrega';
    }
    return 'Coleta';
  }

  private buildStopIcon(type: RouteOptimizationResult['routes'][number]['stops'][number]['type']): L.DivIcon {
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
