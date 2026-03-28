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

export type GeoForwardRequest = {
  cep?: string | null;
  street?: string | null;
  district?: string | null;
  number?: string | null;
  city?: string | null;
  state?: string | null;
};
