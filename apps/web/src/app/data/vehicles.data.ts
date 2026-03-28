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

export const VEHICLE_SEED: VehicleDetail[] = [
  {
    id: 'onibus-14',
    plate: 'ABC-1234',
    model: 'Mercedes LO-916',
    capacity: 36,
    status: 'Ativo',
    routeId: null,
    routeName: '',
    schoolName: '',
    notes: 'Revisão preventiva programada.',
  },
  {
    id: 'van-07',
    plate: 'XYZ-9090',
    model: 'Renault Master',
    capacity: 16,
    status: 'Disponivel',
    routeId: null,
    routeName: '',
    schoolName: '',
    notes: '',
  },
];
