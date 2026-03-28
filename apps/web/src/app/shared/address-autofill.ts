import { DestroyRef } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  catchError,
  combineLatest,
  defer,
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  of,
  finalize,
  switchMap,
  tap,
} from 'rxjs';
import { GeoLookupResult, GeoService } from '../services/geo.service';
import { formatCep, normalizeCep } from './address-utils';

export type AddressFieldMap = {
  cep: string;
  street: string;
  district: string;
  number: string;
  city: string;
  state: string;
  lat: string;
  lng: string;
};

const DEFAULT_FIELDS: AddressFieldMap = {
  cep: 'cep',
  street: 'street',
  district: 'district',
  number: 'number',
  city: 'city',
  state: 'state',
  lat: 'lat',
  lng: 'lng',
};

export function setupAddressAutofill(
  form: FormGroup,
  geoService: GeoService,
  destroyRef: DestroyRef,
  fields: AddressFieldMap = DEFAULT_FIELDS,
  onError?: (message: string) => void,
  onLoading?: (loading: boolean) => void
): void {
  const cepControl = form.get(fields.cep);
  const streetControl = form.get(fields.street);
  const districtControl = form.get(fields.district);
  const numberControl = form.get(fields.number);
  const cityControl = form.get(fields.city);
  const stateControl = form.get(fields.state);
  const latControl = form.get(fields.lat);
  const lngControl = form.get(fields.lng);

  if (!cepControl || !streetControl || !districtControl || !numberControl || !cityControl || !stateControl || !latControl || !lngControl) {
    return;
  }

  const formatCoord = (value: number): string => {
    const fixed = value.toFixed(8);
    return fixed.replace(/\.?0+$/, '');
  };

  const applyResult = (result: GeoLookupResult | null) => {
    if (!result) {
      return;
    }

    if (onError) {
      onError('');
    }

    const patch: Record<string, unknown> = {};
    if (result.cep) {
      patch[fields.cep] = formatCep(result.cep);
    }
    if (result.street) {
      patch[fields.street] = result.street;
    }
    if (result.district) {
      patch[fields.district] = result.district;
    }
    if (result.number) {
      patch[fields.number] = result.number;
    }
    if (result.city) {
      patch[fields.city] = result.city;
    }
    if (result.state) {
      patch[fields.state] = result.state;
    }
    if (result.lat !== undefined && result.lat !== null) {
      patch[fields.lat] = formatCoord(result.lat);
    }
    if (result.lng !== undefined && result.lng !== null) {
      patch[fields.lng] = formatCoord(result.lng);
    }

    form.patchValue(patch, { emitEvent: false });
  };

  const applyCoordinates = (result: GeoLookupResult | null) => {
    if (!result) {
      return;
    }

    const patch: Record<string, unknown> = {};
    if (result.lat !== undefined && result.lat !== null) {
      patch[fields.lat] = formatCoord(result.lat);
    }
    if (result.lng !== undefined && result.lng !== null) {
      patch[fields.lng] = formatCoord(result.lng);
    }
    if (Object.keys(patch).length > 0) {
      form.patchValue(patch, { emitEvent: false });
    }
  };

  const refineWithAddress = (source?: GeoLookupResult | null) => {
    const street = source?.street ?? streetControl.value?.toString().trim() ?? '';
    const district = source?.district ?? districtControl.value?.toString().trim() ?? '';
    const number = source?.number ?? numberControl.value?.toString().trim() ?? '';
    const city = source?.city ?? cityControl.value?.toString().trim() ?? '';
    const state = source?.state ?? stateControl.value?.toString().trim() ?? '';

    if (!street || !number || !city || !state) {
      return;
    }

    const cep = normalizeCep(cepControl.value?.toString().trim() ?? '');
    geoService
      .lookupByAddress({
        street,
        number,
        district: district || undefined,
        city,
        state,
        cep: cep || undefined,
      })
      .pipe(catchError(handleError), takeUntilDestroyed(destroyRef))
      .subscribe((result) => applyCoordinates(result));
  };

  let pending = 0;
  const setLoading = (delta: number) => {
    pending = Math.max(0, pending + delta);
    if (onLoading) {
      onLoading(pending > 0);
    }
  };

  const handleError = (error: any) => {
    const message =
      error?.error?.message ??
      error?.message ??
      'Não foi possível completar a busca de endereço.';
    if (onError) {
      onError(message);
    }
    return of(null);
  };

  const applyIfEmpty = (result: GeoLookupResult | null) => {
    if (!result) {
      return;
    }

    if (onError) {
      onError('');
    }

    const patch: Record<string, unknown> = {};
    const currentCep = cepControl.value?.toString().trim() ?? '';
    const currentStreet = streetControl.value?.toString().trim() ?? '';
    const currentDistrict = districtControl.value?.toString().trim() ?? '';
    const currentNumber = numberControl.value?.toString().trim() ?? '';
    const currentCity = cityControl.value?.toString().trim() ?? '';
    const currentState = stateControl.value?.toString().trim() ?? '';

    if (result.cep && !currentCep) {
      patch[fields.cep] = formatCep(result.cep);
    }
    if (result.street && !currentStreet) {
      patch[fields.street] = result.street;
    }
    if (result.district && !currentDistrict) {
      patch[fields.district] = result.district;
    }
    if (result.number && !currentNumber) {
      patch[fields.number] = result.number;
    }
    if (result.city && !currentCity) {
      patch[fields.city] = result.city;
    }
    if (result.state && !currentState) {
      patch[fields.state] = result.state;
    }

    if (Object.keys(patch).length > 0) {
      form.patchValue(patch, { emitEvent: false });
    }
  };

  combineLatest([
    cepControl.valueChanges,
    numberControl.valueChanges,
  ])
    .pipe(
      debounceTime(500),
      map(([cep, number]) => ({
        cep: normalizeCep(cep as string),
        number: number?.toString().trim() ?? '',
      })),
      filter(({ cep }) => cep.length === 8),
      distinctUntilChanged((a, b) => a.cep === b.cep && a.number === b.number),
      switchMap(({ cep, number }) =>
        defer(() => {
          setLoading(1);
          return geoService
            .lookupByCep(cep, number || undefined)
            .pipe(catchError(handleError), finalize(() => setLoading(-1)));
        })
      ),
      tap((result) => {
        applyResult(result);
        refineWithAddress(result);
      }),
      takeUntilDestroyed(destroyRef)
    )
    .subscribe();

  combineLatest([
    streetControl.valueChanges,
    numberControl.valueChanges,
    districtControl.valueChanges,
    cityControl.valueChanges,
    stateControl.valueChanges,
  ])
    .pipe(
      debounceTime(500),
      map(([street, number, district, city, state]) => ({
        street: street?.toString().trim() ?? '',
        number: number?.toString().trim() ?? '',
        district: district?.toString().trim() ?? '',
        city: city?.toString().trim() ?? '',
        state: state?.toString().trim() ?? '',
      })),
      filter(({ street, number, city, state }) => !!street && !!number && !!city && !!state),
      distinctUntilChanged(
        (a, b) =>
          a.street === b.street &&
          a.number === b.number &&
          a.district === b.district &&
          a.city === b.city &&
          a.state === b.state
      ),
      switchMap((payload) =>
        defer(() => {
          setLoading(1);
          return geoService
            .lookupByAddress(payload)
            .pipe(catchError(handleError), finalize(() => setLoading(-1)));
        })
      ),
      tap(applyResult),
      takeUntilDestroyed(destroyRef)
    )
    .subscribe();

  combineLatest([latControl.valueChanges, lngControl.valueChanges])
    .pipe(
      debounceTime(500),
      map(([lat, lng]) => ({
        lat: lat !== null && lat !== undefined && lat !== '' ? Number(lat) : NaN,
        lng: lng !== null && lng !== undefined && lng !== '' ? Number(lng) : NaN,
      })),
      filter(({ lat, lng }) => Number.isFinite(lat) && Number.isFinite(lng)),
      distinctUntilChanged((a, b) => a.lat === b.lat && a.lng === b.lng),
      switchMap(({ lat, lng }) =>
        defer(() => {
          setLoading(1);
          return geoService
            .lookupByCoords(lat, lng)
            .pipe(catchError(handleError), finalize(() => setLoading(-1)));
        })
      ),
      tap(applyIfEmpty),
      takeUntilDestroyed(destroyRef)
    )
    .subscribe();
}
