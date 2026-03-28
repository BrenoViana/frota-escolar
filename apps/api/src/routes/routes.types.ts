import { StudentSummary } from '../students/students.types';

export type RouteSummary = {
  id: string;
  name: string;
  schoolId?: string | null;
  schoolName?: string;
  schools?: { id: string; name: string }[];
  shift: string;
  status: string;
  startTime: string;
  endTime: string;
  capacity: number;
  students: number;
  vehicleId?: string | null;
  vehicleLabel?: string;
};

export type RouteDetail = RouteSummary & {
  studentsList: StudentSummary[];
};

export type RouteFormData = {
  name: string;
  shift: string;
  status: string;
  startTime: string;
  endTime: string;
  capacity: number;
  vehicleId?: string | null;
  studentIds?: string[];
  schoolId?: string | null;
};
