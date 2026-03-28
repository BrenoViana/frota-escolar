import { Component, DestroyRef, inject } from '@angular/core';
import { NgClass, NgFor } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Observable, forkJoin } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RoutesService } from '../services/routes.service';
import { RouteSummary } from '../data/routes.data';
import { ShiftLabelPipe } from '../shared/shift-label.pipe';
import { StatusLabelPipe } from '../shared/status-label.pipe';

@Component({
  selector: 'app-routes-page',
  standalone: true,
  imports: [NgFor, NgClass, RouterLink, ShiftLabelPipe, StatusLabelPipe],
  templateUrl: './routes.page.html',
  styleUrl: './routes.page.css',
})
export class RoutesPageComponent {
  readonly routes$: Observable<RouteSummary[]> = this.routesService.list();
  routes: RouteSummary[] = [];
  loading = true;
  errorMessage = '';
  private readonly selectedIds = new Set<string>();
  private readonly destroyRef = inject(DestroyRef);

  constructor(private readonly routesService: RoutesService) {
    this.routesService
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (routes) => {
          this.routes = routes;
          this.loading = false;
        },
        error: (error) => {
          this.errorMessage =
            error?.error?.message ?? error?.message ?? 'Falha ao carregar rotas.';
          this.loading = false;
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

  get selectedCount(): number {
    return this.selectedIds.size;
  }

  allSelected(routes: RouteSummary[]): boolean {
    return routes.length > 0 && routes.every((route) => this.selectedIds.has(route.id));
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

  toggleAll(routes: RouteSummary[]): void {
    if (routes.length === 0) {
      return;
    }
    const allSelected = routes.every((route) => this.selectedIds.has(route.id));
    if (allSelected) {
      this.selectedIds.clear();
      return;
    }
    routes.forEach((route) => this.selectedIds.add(route.id));
  }

  deleteRoute(route: RouteSummary): void {
    if (!confirm(`Excluir a rota ${route.name}?`)) {
      return;
    }
    this.routesService.delete(route.id).subscribe({
      next: () => this.selectedIds.delete(route.id),
    });
  }

  deleteSelected(): void {
    const ids = Array.from(this.selectedIds);
    if (!ids.length) {
      return;
    }
    if (!confirm(`Excluir ${ids.length} rota(s) selecionada(s)?`)) {
      return;
    }
    forkJoin(ids.map((id) => this.routesService.delete(id))).subscribe({
      next: () => this.selectedIds.clear(),
    });
  }
}
