import { ValidatorFn } from '@angular/forms';
import { normalizeCep } from './address-utils';

export const cepValidator: ValidatorFn = (control) => {
  const raw = control.value?.toString() ?? '';
  if (!raw) {
    return null;
  }
  const cleaned = normalizeCep(raw);
  if (cleaned.length !== 8) {
    return { cep: true };
  }
  return null;
};

export const latValidator: ValidatorFn = (control) => {
  const raw = control.value;
  if (raw === null || raw === undefined || raw === '') {
    return null;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return { lat: true };
  }
  if (value < -90 || value > 90) {
    return { latRange: true };
  }
  return null;
};

export const lngValidator: ValidatorFn = (control) => {
  const raw = control.value;
  if (raw === null || raw === undefined || raw === '') {
    return null;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return { lng: true };
  }
  if (value < -180 || value > 180) {
    return { lngRange: true };
  }
  return null;
};
