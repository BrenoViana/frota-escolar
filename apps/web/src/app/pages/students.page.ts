import { Component, DestroyRef, inject } from '@angular/core';
import { NgClass, NgFor } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Observable, forkJoin } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { StudentsService } from '../services/students.service';
import { StudentSummary } from '../data/students.data';
import { ShiftLabelPipe } from '../shared/shift-label.pipe';
import { StatusLabelPipe } from '../shared/status-label.pipe';

@Component({
  selector: 'app-students-page',
  standalone: true,
  imports: [NgFor, NgClass, RouterLink, ShiftLabelPipe, StatusLabelPipe],
  templateUrl: './students.page.html',
  styleUrl: './students.page.css',
})
export class StudentsPageComponent {
  readonly students$: Observable<StudentSummary[]> = this.studentsService.list();
  students: StudentSummary[] = [];
  loading = true;
  errorMessage = '';
  private readonly selectedIds = new Set<string>();
  private readonly destroyRef = inject(DestroyRef);

  constructor(private readonly studentsService: StudentsService) {

    this.studentsService
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (students) => {
          this.students = students;
          this.loading = false;
        },
        error: (error) => {
          this.errorMessage =
            error?.error?.message ?? error?.message ?? 'Falha ao carregar alunos.';
          this.loading = false;
        },
      });
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

  get selectedCount(): number {
    return this.selectedIds.size;
  }

  allSelected(students: StudentSummary[]): boolean {
    return students.length > 0 && students.every((student) => this.selectedIds.has(student.id));
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

  toggleAll(students: StudentSummary[]): void {
    if (students.length === 0) {
      return;
    }
    const allSelected = students.every((student) => this.selectedIds.has(student.id));
    if (allSelected) {
      this.selectedIds.clear();
      return;
    }
    students.forEach((student) => this.selectedIds.add(student.id));
  }

  deleteStudent(student: StudentSummary): void {
    if (!confirm(`Excluir o aluno ${student.name}?`)) {
      return;
    }
    this.studentsService.delete(student.id).subscribe({
      next: () => this.selectedIds.delete(student.id),
    });
  }

  deleteSelected(): void {
    const ids = Array.from(this.selectedIds);
    if (!ids.length) {
      return;
    }
    if (!confirm(`Excluir ${ids.length} aluno(s) selecionado(s)?`)) {
      return;
    }
    forkJoin(ids.map((id) => this.studentsService.delete(id))).subscribe({
      next: () => this.selectedIds.clear(),
    });
  }

  get metrics(): Array<{ label: string; value: string }> {
    const total = this.students.length;
    const active = this.students.filter((student) =>
      student.status.toLowerCase().includes('ativo')
    ).length;
    const withRoute = this.students.filter((student) => !!student.routeName).length;
    const withoutRoute = total - withRoute;
    const pending = this.students.filter((student) =>
      student.status.toLowerCase().includes('pend')
    ).length;

    return [
      { label: 'Total de alunos', value: total.toString() },
      { label: 'Ativos', value: active.toString() },
      { label: 'Sem rota', value: withoutRoute.toString() },
      { label: 'Pendentes', value: pending.toString() },
    ];
  }
}
