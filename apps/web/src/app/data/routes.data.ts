import { StudentSummary } from './students.data';

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

export const ROUTE_SEED: RouteDetail[] = [
  {
    id: 'emef-vale-azul-rota-norte-a',
    name: 'Rota Norte A',
    schoolId: 'emef-vale-azul',
    schoolName: 'EMEF Vale Azul',
    schools: [{ id: 'emef-vale-azul', name: 'EMEF Vale Azul' }],
    shift: 'Manha',
    status: 'Ativa',
    startTime: '06:40',
    endTime: '07:25',
    capacity: 30,
    students: 28,
    vehicleId: null,
    vehicleLabel: '',
    studentsList: [],
  },
  {
    id: 'colegio-horizonte-centro-01',
    name: 'Centro 01',
    schoolId: 'colegio-horizonte',
    schoolName: 'Colégio Horizonte',
    schools: [{ id: 'colegio-horizonte', name: 'Colégio Horizonte' }],
    shift: 'Manha',
    status: 'Ativa',
    startTime: '06:15',
    endTime: '06:50',
    capacity: 26,
    students: 24,
    vehicleId: null,
    vehicleLabel: '',
    studentsList: [],
  },
];
