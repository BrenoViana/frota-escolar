export type VehicleSummary = {
  id: string;
  plate: string;
  model: string;
  capacity: number;
  status: string;
  routeId?: string | null;
  routeName?: string;
  schoolName?: string;
};

export type VehicleDetail = VehicleSummary & {
  notes: string;
  garageCep?: string | null;
  garageStreet?: string | null;
  garageNumber?: string | null;
  garageDistrict?: string | null;
  garageCity?: string | null;
  garageState?: string | null;
  garageLat?: number | null;
  garageLng?: number | null;
};

export type VehicleFormData = {
  plate: string;
  model: string;
  capacity: number;
  status: string;
  notes: string;
  routeId?: string | null;
  garageCep?: string | null;
  garageStreet?: string | null;
  garageNumber?: string | null;
  garageDistrict?: string | null;
  garageCity?: string | null;
  garageState?: string | null;
  garageLat?: number | null;
  garageLng?: number | null;
};
