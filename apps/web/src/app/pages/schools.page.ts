import { Component, DestroyRef, inject } from '@angular/core';
import { NgClass, NgFor } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Observable, forkJoin } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SchoolsService } from '../services/schools.service';
import { SchoolSummary } from '../data/schools.data';
import { StatusLabelPipe } from '../shared/status-label.pipe';

@Component({
  selector: 'app-schools-page',
  standalone: true,
  imports: [NgFor, NgClass, RouterLink, StatusLabelPipe],
  templateUrl: './schools.page.html',
  styleUrl: './schools.page.css',
})
export class SchoolsPageComponent {
  readonly schools$: Observable<SchoolSummary[]> = this.schoolsService.list();
  schools: SchoolSummary[] = [];
  loading = true;
  errorMessage = '';
  private readonly selectedIds = new Set<string>();
  private readonly destroyRef = inject(DestroyRef);

  readonly metrics = [
    { label: 'Taxa de ocupação', value: '92%' },
    { label: 'Média por rota', value: '28 alunos' },
    { label: 'Escolas com alerta', value: '3 unidades' },
  ];

  constructor(private readonly schoolsService: SchoolsService) {
    this.schoolsService
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (schools) => {
          this.schools = schools;
          this.loading = false;
        },
        error: (error) => {
          this.errorMessage =
            error?.error?.message ?? error?.message ?? 'Falha ao carregar escolas.';
          this.loading = false;
        },
      });
  }

  get selectedCount(): number {
    return this.selectedIds.size;
  }

  allSelected(schools: SchoolSummary[]): boolean {
    return schools.length > 0 && schools.every((school) => this.selectedIds.has(school.id));
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

  toggleAll(schools: SchoolSummary[]): void {
    if (schools.length === 0) {
      return;
    }
    const allSelected = schools.every((school) => this.selectedIds.has(school.id));
    if (allSelected) {
      this.selectedIds.clear();
      return;
    }
    schools.forEach((school) => this.selectedIds.add(school.id));
  }

  deleteSchool(school: SchoolSummary): void {
    if (!confirm(`Excluir a escola ${school.name}?`)) {
      return;
    }
    this.schoolsService.delete(school.id).subscribe({
      next: () => this.selectedIds.delete(school.id),
    });
  }

  deleteSelected(): void {
    const ids = Array.from(this.selectedIds);
    if (!ids.length) {
      return;
    }
    if (!confirm(`Excluir ${ids.length} escola(s) selecionada(s)?`)) {
      return;
    }
    forkJoin(ids.map((id) => this.schoolsService.delete(id))).subscribe({
      next: () => this.selectedIds.clear(),
    });
  }
}
