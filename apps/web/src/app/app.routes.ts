import { Routes } from '@angular/router';
import { DashboardPageComponent } from './pages/dashboard.page';
import { SchoolsPageComponent } from './pages/schools.page';
import { SchoolDetailPageComponent } from './pages/school-detail.page';
import { SchoolFormPageComponent } from './pages/school-form.page';
import { StudentsPageComponent } from './pages/students.page';
import { StudentDetailPageComponent } from './pages/student-detail.page';
import { StudentFormPageComponent } from './pages/student-form.page';
import { RoutesPageComponent } from './pages/routes.page';
import { RouteDetailPageComponent } from './pages/route-detail.page';
import { RouteFormPageComponent } from './pages/route-form.page';
import { RouteOptimizationPageComponent } from './pages/route-optimization.page';
import { VehiclesPageComponent } from './pages/vehicles.page';
import { VehicleDetailPageComponent } from './pages/vehicle-detail.page';
import { VehicleFormPageComponent } from './pages/vehicle-form.page';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: 'dashboard',
    component: DashboardPageComponent,
    title: 'Dashboard | Frota Escolar',
  },
  {
    path: 'escolas',
    component: SchoolsPageComponent,
    title: 'Escolas | Frota Escolar',
  },
  {
    path: 'escolas/nova',
    component: SchoolFormPageComponent,
    title: 'Nova Escola | Frota Escolar',
  },
  {
    path: 'escolas/:id/editar',
    component: SchoolFormPageComponent,
    title: 'Editar Escola | Frota Escolar',
  },
  {
    path: 'escolas/:id',
    component: SchoolDetailPageComponent,
    title: 'Detalhe da Escola | Frota Escolar',
  },
  {
    path: 'alunos',
    component: StudentsPageComponent,
    title: 'Alunos | Frota Escolar',
  },
  {
    path: 'alunos/novo',
    component: StudentFormPageComponent,
    title: 'Novo Aluno | Frota Escolar',
  },
  {
    path: 'alunos/:id/editar',
    component: StudentFormPageComponent,
    title: 'Editar Aluno | Frota Escolar',
  },
  {
    path: 'alunos/:id',
    component: StudentDetailPageComponent,
    title: 'Detalhe do Aluno | Frota Escolar',
  },
  {
    path: 'rotas',
    component: RoutesPageComponent,
    title: 'Rotas | Frota Escolar',
  },
  {
    path: 'rotas/nova',
    component: RouteFormPageComponent,
    title: 'Nova Rota | Frota Escolar',
  },
  {
    path: 'rotas/:id/editar',
    component: RouteFormPageComponent,
    title: 'Editar Rota | Frota Escolar',
  },
  {
    path: 'rotas/:id/otimizar',
    component: RouteOptimizationPageComponent,
    title: 'Otimizar Rota | Frota Escolar',
  },
  {
    path: 'rotas/:id',
    component: RouteDetailPageComponent,
    title: 'Detalhe da Rota | Frota Escolar',
  },
  {
    path: 'veiculos',
    component: VehiclesPageComponent,
    title: 'Veículos | Frota Escolar',
  },
  {
    path: 'veiculos/novo',
    component: VehicleFormPageComponent,
    title: 'Novo Veículo | Frota Escolar',
  },
  {
    path: 'veiculos/:id/editar',
    component: VehicleFormPageComponent,
    title: 'Editar Veículo | Frota Escolar',
  },
  {
    path: 'veiculos/:id',
    component: VehicleDetailPageComponent,
    title: 'Detalhe do Veículo | Frota Escolar',
  },
  { path: '**', redirectTo: 'dashboard' },
];
