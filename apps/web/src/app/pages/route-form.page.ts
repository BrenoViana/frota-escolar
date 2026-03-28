import { Component } from '@angular/core';
import { AsyncPipe, NgFor, NgIf } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable, combineLatest, map, tap } from 'rxjs';
import { RoutesService } from '../services/routes.service';
import { StudentsService } from '../services/students.service';
import { SchoolsService } from '../services/schools.service';
import { VehiclesService } from '../services/vehicles.service';
import { RouteFormData } from '../data/routes.data';
import { StudentSummary } from '../data/students.data';
import { SchoolSummary } from '../data/schools.data';
import { VehicleSummary } from '../data/vehicles.data';
import { ShiftLabelPipe } from '../shared/shift-label.pipe';
import { StatusLabelPipe } from '../shared/status-label.pipe';

@Component({
  selector: 'app-route-form-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    NgIf,
    NgFor,
    AsyncPipe,
    RouterLink,
    ShiftLabelPipe,
    StatusLabelPipe,
  ],
  templateUrl: './route-form.page.html',
  styleUrl: './route-form.page.css',
})
export class RouteFormPageComponent {
  readonly shifts = ['Manha', 'Tarde', 'Integral'];
  readonly statuses = ['Ativa', 'Pendente', 'Revisao'];
  readonly routeId: string | null;
  readonly isEdit: boolean;
  readonly students$: Observable<StudentSummary[]> = this.studentsService.list();
  readonly schools$: Observable<SchoolSummary[]> = this.schoolsService.list();
  readonly vehicles$: Observable<VehicleSummary[]> = this.vehiclesService.list();
  readonly vm$: Observable<{
    students: StudentSummary[];
    schools: SchoolSummary[];
    vehicles: VehicleSummary[];
  }>;
  private readonly selectedIds = new Set<string>();
  students: StudentSummary[] = [];
  schools: SchoolSummary[] = [];
  vehicles: VehicleSummary[] = [];

  readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    shift: ['Manha', Validators.required],
    status: ['Ativa', Validators.required],
    startTime: ['06:30', Validators.required],
    endTime: ['07:15', Validators.required],
    capacity: [0, [Validators.required, Validators.min(0)]],
    vehicleId: [''],
  });

  loading = false;
  saving = false;
  errorMessage = '';
  private postSaveAction: 'detail' | 'optimize' = 'detail';

  constructor(
    private readonly fb: FormBuilder,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly routesService: RoutesService,
    private readonly studentsService: StudentsService,
    private readonly schoolsService: SchoolsService,
    private readonly vehiclesService: VehiclesService
  ) {
    this.routeId = this.route.snapshot.paramMap.get('id');
    this.isEdit = !!this.routeId;

    this.vm$ = combineLatest([this.students$, this.schools$, this.vehicles$]).pipe(
      map(([students, schools, vehicles]) => ({ students, schools, vehicles })),
      tap((vm) => {
        this.students = vm.students;
        this.schools = vm.schools;
        this.vehicles = vm.vehicles;
      })
    );

    if (this.isEdit && this.routeId) {
      this.loadRoute(this.routeId);
    }
  }

  submit(): void {
    this.errorMessage = '';

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const payload = this.form.getRawValue() as RouteFormData;
    if (!payload.vehicleId) {
      payload.vehicleId = null;
    }
    payload.studentIds = Array.from(this.selectedIds);

    if (!payload.studentIds.length) {
      this.errorMessage = 'Selecione ao menos um aluno para a rota.';
      return;
    }

    this.saving = true;

    const request$ = this.isEdit && this.routeId
      ? this.routesService.update(this.routeId, payload)
      : this.routesService.create(payload);

    request$.subscribe({
      next: (route) => {
        this.saving = false;
        const shouldOptimize = this.postSaveAction === 'optimize';
        const target = shouldOptimize
          ? ['/rotas', route.id, 'otimizar']
          : ['/rotas', route.id];
        this.postSaveAction = 'detail';
        void this.router.navigate(target, {
          queryParams: shouldOptimize ? { auto: '1' } : undefined,
        });
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

  submitAndOptimize(): void {
    this.postSaveAction = 'optimize';
    this.submit();
  }

  private loadRoute(id: string): void {
    this.loading = true;
    this.errorMessage = '';

    this.routesService.getById(id).subscribe({
      next: (route) => {
        if (!route) {
          this.errorMessage = 'Rota não encontrada.';
          this.loading = false;
          return;
        }

        this.form.patchValue({
          name: route.name,
          shift: route.shift,
          status: route.status,
          startTime: route.startTime,
          endTime: route.endTime,
          capacity: route.capacity,
          vehicleId: route.vehicleId ?? '',
        });
        this.selectedIds.clear();
        route.studentsList?.forEach((student) => this.selectedIds.add(student.id));

        this.form.markAsPristine();
        this.loading = false;
      },
      error: () => {
        this.errorMessage = 'Não foi possível carregar os dados da rota.';
        this.loading = false;
      },
    });
  }

  get selectedCount(): number {
    return this.selectedIds.size;
  }

  allSelected(): boolean {
    return this.students.length > 0 && this.selectedIds.size === this.students.length;
  }

  isSelected(id: string): boolean {
    return this.selectedIds.has(id);
  }

  toggleStudent(id: string): void {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
      return;
    }
    this.selectedIds.add(id);
  }

  toggleAllStudents(): void {
    if (!this.students.length) {
      return;
    }
    if (this.allSelected()) {
      this.selectedIds.clear();
      return;
    }
    this.students.forEach((student) => this.selectedIds.add(student.id));
  }

  selectedSchools(): { id: string; name: string; address: string }[] {
    const schoolById = new Map(this.schools.map((school) => [school.id, school]));
    const map = new Map<string, { id: string; name: string; address: string }>();

    this.students.forEach((student) => {
      if (!this.selectedIds.has(student.id) || !student.schoolId) {
        return;
      }
      const school =
        schoolById.get(student.schoolId) ?? {
          id: student.schoolId,
          name: student.schoolName ?? student.schoolId,
          address: '',
        };
      map.set(student.schoolId, {
        id: school.id,
        name: school.name,
        address: school.address ?? '',
      });
    });

    return Array.from(map.values());
  }
}
