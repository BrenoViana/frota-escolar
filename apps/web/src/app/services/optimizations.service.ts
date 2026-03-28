import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  RouteOptimizationRequest,
  RouteOptimizationResult,
  RouteOptimizationUpdateRequest,
} from '../data/optimizations.data';

@Injectable({ providedIn: 'root' })
export class OptimizationsService {
  readonly useApi = environment.useApi;
  private readonly baseUrl = environment.apiBase.replace(/\/$/, '');

  constructor(private readonly http: HttpClient) {}

  optimizeRoute(
    routeId: string,
    payload: RouteOptimizationRequest
  ): Observable<RouteOptimizationResult> {
    if (!this.useApi) {
      return throwError(() => new Error('Otimização disponível apenas com API.'));
    }

    return this.http.post<RouteOptimizationResult>(
      `${this.baseUrl}/routes/${routeId}/optimize`,
      payload
    );
  }

  getOptimization(routeId: string): Observable<RouteOptimizationResult> {
    if (!this.useApi) {
      return throwError(() => new Error('Otimização disponível apenas com API.'));
    }

    return this.http.get<RouteOptimizationResult>(
      `${this.baseUrl}/routes/${routeId}/optimization`
    );
  }

  updateOptimization(
    routeId: string,
    payload: RouteOptimizationUpdateRequest
  ): Observable<RouteOptimizationResult> {
    if (!this.useApi) {
      return throwError(() => new Error('Otimização disponível apenas com API.'));
    }

    return this.http.put<RouteOptimizationResult>(
      `${this.baseUrl}/routes/${routeId}/optimization`,
      payload
    );
  }
}
