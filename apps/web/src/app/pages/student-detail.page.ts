import { Component } from '@angular/core';
import { AsyncPipe, NgClass, NgIf } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable, map, switchMap } from 'rxjs';
import { StudentsService } from '../services/students.service';
import { StudentDetail } from '../data/students.data';
import { ShiftLabelPipe } from '../shared/shift-label.pipe';
import { StatusLabelPipe } from '../shared/status-label.pipe';

@Component({
  selector: 'app-student-detail-page',
  standalone: true,
  imports: [NgIf, NgClass, RouterLink, AsyncPipe, ShiftLabelPipe, StatusLabelPipe],
  templateUrl: './student-detail.page.html',
  styleUrl: './student-detail.page.css',
})
export class StudentDetailPageComponent {
  readonly student$: Observable<StudentDetail | null>;
  deleting = false;
  errorMessage = '';

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly studentsService: StudentsService
  ) {
    this.student$ = this.route.paramMap.pipe(
      map((params) => params.get('id') ?? ''),
      switchMap((id) => this.studentsService.getById(id))
    );
  }

  statusClass(status: string): string {
    if (status.toLowerCase().includes('pend')) {
      return 'warning';
    }
    if (status.toLowerCase().includes('inativo')) {
      return 'danger';
    }
    return '';
  }

  confirmDelete(id: string): void {
    if (!confirm('Tem certeza que deseja excluir este aluno? Esta ação não pode ser desfeita.')) {
      return;
    }

    this.deleting = true;
    this.errorMessage = '';

    this.studentsService.delete(id).subscribe({
      next: () => {
        this.deleting = false;
        void this.router.navigate(['/alunos']);
      },
      error: () => {
        this.errorMessage = 'Não foi possível excluir o aluno.';
        this.deleting = false;
      },
    });
  }
}
