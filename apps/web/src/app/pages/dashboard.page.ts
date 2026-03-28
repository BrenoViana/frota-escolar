import { Component } from '@angular/core';
import { AsyncPipe, NgClass, NgFor } from '@angular/common';
import { Observable, map } from 'rxjs';
import { DashboardService } from '../services/dashboard.service';
import { StatusLabelPipe } from '../shared/status-label.pipe';

type DashboardStat = { label: string; value: string; meta: string };

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [NgFor, NgClass, AsyncPipe, StatusLabelPipe],
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.css',
})
export class DashboardPageComponent {
  readonly stats$: Observable<DashboardStat[]> = this.dashboardService.getMetrics().pipe(
    map((metrics) => {
      const occupancy = Math.round(metrics.occupancyRate * 100);
      const studentsPerSchool = metrics.studentsPerSchool.toFixed(1);
      return [
        {
          label: 'Escolas ativas',
          value: metrics.totalSchools.toString(),
          meta: `${studentsPerSchool} alunos por escola`,
        },
        {
          label: 'Alunos atendidos',
          value: metrics.totalStudents.toString(),
          meta: `${occupancy}% de ocupação`,
        },
        {
          label: 'Veículos ativos',
          value: metrics.activeVehicles.toString(),
          meta: 'Alocados em rotas',
        },
        {
          label: 'Rotas ativas',
          value: metrics.activeRoutes.toString(),
          meta: 'Planejamento diário',
        },
      ];
    })
  );

  readonly routes = [
    {
      name: 'Rota Norte A',
      meta: '07:10 - 36 alunos - 3 escolas',
      status: 'No prazo',
      tone: '',
    },
    {
      name: 'Centro 02',
      meta: '07:25 - 28 alunos - 2 escolas',
      status: 'Atraso',
      tone: 'warning',
    },
    {
      name: 'Leste 04',
      meta: '07:40 - 31 alunos - 4 escolas',
      status: 'Crítico',
      tone: 'danger',
    },
    {
      name: 'Sul 01',
      meta: '07:55 - 22 alunos - 2 escolas',
      status: 'No prazo',
      tone: '',
    },
  ];

  readonly alerts = [
    {
      title: 'Escola Monte Verde sem confirmação de embarque',
      meta: 'Última leitura há 18 min',
      tone: 'warning',
    },
    {
      title: 'Ônibus 14 precisa revisar pneus',
      meta: 'Manutenção preventiva pendente',
      tone: '',
    },
    {
      title: 'Motorista Carlos ultrapassou limite de jornada',
      meta: 'Reprogramar rota da tarde',
      tone: 'danger',
    },
  ];

  readonly demand = [
    { name: 'EMEF Vale Azul', value: 84, students: 480 },
    { name: 'Escola Íntegra', value: 72, students: 420 },
    { name: 'Colégio Horizonte', value: 65, students: 390 },
    { name: 'Centro Saber', value: 52, students: 310 },
  ];

  constructor(private readonly dashboardService: DashboardService) {}
}
