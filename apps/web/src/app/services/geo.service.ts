import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { environment } from '../../environments/environment';

export type GeoLookupResult = {
  cep?: string | null;
  street?: string | null;
  district?: string | null;
  number?: string | null;
  city?: string | null;
  state?: string | null;
  lat?: number | null;
  lng?: number | null;
};

@Injectable({ providedIn: 'root' })
export class GeoService {
  readonly useApi = environment.useApi;
  private readonly baseUrl = environment.apiBase.replace(/\/$/, '');

  constructor(private readonly http: HttpClient) {}

  lookupByCep(cep: string, number?: string): Observable<GeoLookupResult | null> {
    if (!this.useApi) {
      return of(null);
    }

    let params = new HttpParams();
    if (number) {
      params = params.set('number', number);
    }

    return this.http.get<GeoLookupResult>(`${this.baseUrl}/geo/cep/${cep}`, { params });
  }

  lookupByAddress(payload: GeoLookupResult): Observable<GeoLookupResult | null> {
    if (!this.useApi) {
      return of(null);
    }

    return this.http.post<GeoLookupResult>(`${this.baseUrl}/geo/forward`, payload);
  }

  lookupByCoords(lat: number, lng: number): Observable<GeoLookupResult | null> {
    if (!this.useApi) {
      return of(null);
    }

    const params = new HttpParams().set('lat', lat).set('lng', lng);
    return this.http.get<GeoLookupResult>(`${this.baseUrl}/geo/reverse`, { params });
  }
}
