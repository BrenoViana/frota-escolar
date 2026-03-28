import { Component } from '@angular/core';
import { AsyncPipe, NgClass, NgFor, NgIf } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable, map, switchMap } from 'rxjs';
import { SchoolsService } from '../services/schools.service';
import { SchoolContact, SchoolDetail, SchoolRoute } from '../data/schools.data';
import { ShiftLabelPipe } from '../shared/shift-label.pipe';
import { StatusLabelPipe } from '../shared/status-label.pipe';

type SchoolDetailVm = {
  school: SchoolDetail;
  stats: { label: string; value: string; meta: string }[];
  routes: SchoolRoute[];
  contacts: SchoolContact[];
  occupancy: string;
};

@Component({
  selector: 'app-school-detail-page',
  standalone: true,
  imports: [NgIf, NgFor, NgClass, RouterLink, AsyncPipe, ShiftLabelPipe, StatusLabelPipe],
  templateUrl: './school-detail.page.html',
  styleUrl: './school-detail.page.css',
})
export class SchoolDetailPageComponent {
  readonly vm$: Observable<SchoolDetailVm | null>;
  deleting = false;
  errorMessage = '';

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly schoolsService: SchoolsService
  ) {
    this.vm$ = this.route.paramMap.pipe(
      map((params) => params.get('id') ?? ''),
      switchMap((id) => this.schoolsService.getById(id)),
      map((school) => this.buildVm(school))
    );
  }

  private buildVm(school: SchoolDetail | null): SchoolDetailVm | null {
    if (!school) {
      return null;
    }

    const occupancyValue = school.capacity
      ? Math.round((school.students / school.capacity) * 100)
      : 0;
    const occupancy = `${occupancyValue}%`;

    return {
      school,
      occupancy,
      stats: [
        {
          label: 'Alunos cadastrados',
          value: school.students.toString(),
          meta: `Capacidade ${school.capacity}`,
        },
        {
          label: 'Rotas ativas',
          value: school.routes.toString(),
          meta: '2 rotas extras em planejamento',
        },
        {
          label: 'Taxa de ocupação',
          value: occupancy,
          meta: 'Últimos 7 dias',
        },
        {
          label: 'Gestão local',
          value: school.manager,
          meta: 'Contato principal',
        },
      ],
      routes: school.routeList,
      contacts: school.contacts,
    };
  }

  confirmDelete(id: string): void {
    if (!confirm('Tem certeza que deseja excluir esta escola? Esta ação não pode ser desfeita.')) {
      return;
    }

    this.deleting = true;
    this.errorMessage = '';

    this.schoolsService.delete(id).subscribe({
      next: () => {
        this.deleting = false;
        void this.router.navigate(['/escolas']);
      },
      error: () => {
        this.errorMessage = 'Não foi possível excluir a escola.';
        this.deleting = false;
      },
    });
  }
}
