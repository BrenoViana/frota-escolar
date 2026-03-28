import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { environment } from '../../environments/environment';
import { SCHOOL_SEED } from '../data/schools.data';
import { STUDENT_SEED } from '../data/students.data';
import { ROUTE_SEED } from '../data/routes.data';
import { VEHICLE_SEED } from '../data/vehicles.data';

export type DashboardMetrics = {
  totalSchools: number;
  totalStudents: number;
  activeRoutes: number;
  occupancyRate: number;
  studentsPerSchool: number;
  activeVehicles: number;
};

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly baseUrl = environment.apiBase.replace(/\/$/, '');

  constructor(private readonly http: HttpClient) {}

  getMetrics(): Observable<DashboardMetrics> {
    if (!environment.useApi) {
      const totalSchools = SCHOOL_SEED.length;
      const totalStudents = STUDENT_SEED.length;
      const activeRoutes = ROUTE_SEED.filter((route) => route.status === 'Ativa').length;
      const activeVehicles = VEHICLE_SEED.filter((vehicle) => vehicle.status === 'Ativo').length;
      const totalCapacity = SCHOOL_SEED.reduce((sum, school) => sum + school.capacity, 0);
      const occupancyRate = totalCapacity > 0 ? totalStudents / totalCapacity : 0;
      const studentsPerSchool = totalSchools > 0 ? totalStudents / totalSchools : 0;

      return of({
        totalSchools,
        totalStudents,
        activeRoutes,
        occupancyRate,
        studentsPerSchool,
        activeVehicles,
      });
    }

    return this.http.get<DashboardMetrics>(`${this.baseUrl}/dashboard/metrics`);
  }
}
