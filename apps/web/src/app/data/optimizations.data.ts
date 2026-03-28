export type RouteOptimizationRequest = {
  garageAddress?: string;
  garageLat?: number | string;
  garageLng?: number | string;
  departAt?: string;
  studentIds?: string[];
  vehicleIds?: string[];
};

export type RouteOptimizationStop = {
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

export type RouteOptimizationResult = {
  routeId: string;
  routes: Array<{
    vehicleId?: string | null;
    vehicleLabel?: string;
    vehicleStatus?: string;
    vehicleCapacity?: number;
    assignedStudents?: number;
    totalDistanceKm: number;
    totalDurationMin: number;
    stops: RouteOptimizationStop[];
    geometry?: Array<{ lat: number; lng: number }>;
  }>;
  warnings: string[];
};

export type RouteOptimizationUpdateRequest = {
  routes: Array<{
    vehicleId?: string | null;
    stopIds: string[];
  }>;
};
