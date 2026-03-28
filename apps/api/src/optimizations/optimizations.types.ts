export type OptimizationRequest = {
  garageAddress?: string;
  garageLat?: number;
  garageLng?: number;
  departAt?: string;
  studentIds?: string[];
  vehicleIds?: string[];
};

export type OptimizationStop = {
  stopId?: string;
  sequence: number;
  type: 'start' | 'pickup' | 'delivery' | 'end';
  label: string;
  studentId?: string;
  studentName?: string;
  schoolId?: string;
  schoolName?: string;
  address?: string;
  lat?: number;
  lng?: number;
  arrival?: string;
  distanceKm?: number;
  durationMin?: number;
};

export type OptimizationResult = {
  routeId: string;
  routes: Array<{
    vehicleId?: string | null;
    vehicleLabel?: string;
    vehicleStatus?: string;
    vehicleCapacity?: number;
    assignedStudents?: number;
    totalDistanceKm: number;
    totalDurationMin: number;
    stops: OptimizationStop[];
    geometry?: Array<{ lat: number; lng: number }>;
  }>;
  warnings: string[];
};

export type OptimizationUpdateRequest = {
  routes: Array<{
    vehicleId?: string | null;
    stopIds: string[];
  }>;
};
