export type AddressParts = {
  street?: string | null;
  district?: string | null;
  number?: string | null;
  city?: string | null;
  state?: string | null;
};

export function buildAddressLabel(parts: AddressParts): string {
  const street = parts.street?.trim() ?? '';
  const district = parts.district?.trim() ?? '';
  const number = parts.number?.toString().trim() ?? '';
  const city = parts.city?.trim() ?? '';
  const state = parts.state?.trim().toUpperCase() ?? '';

  if (!street || !number || !city || !state) {
    return '';
  }

  const districtPart = district ? `, ${district}` : '';
  return `${street}, ${number}${districtPart} - ${city}/${state}`;
}

export function normalizeCep(value: string | null | undefined): string {
  return (value ?? '').toString().replace(/\D/g, '');
}

export function formatCep(value: string | null | undefined): string {
  const digits = normalizeCep(value);
  if (digits.length !== 8) {
    return digits;
  }
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}
