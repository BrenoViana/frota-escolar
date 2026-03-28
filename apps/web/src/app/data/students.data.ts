export type StudentSummary = {
  id: string;
  name: string;
  schoolId: string;
  schoolName: string;
  routeId?: string | null;
  routeName: string;
  shift: string;
  status: string;
  entryTime?: string | null;
};

export type StudentDetail = StudentSummary & {
  guardian: string;
  phone: string;
  address: string;
  district?: string | null;
  entryTime?: string | null;
  cep?: string | null;
  street?: string | null;
  number?: string | null;
  city?: string | null;
  state?: string | null;
  lat?: number | null;
  lng?: number | null;
  notes: string;
};

export type StudentFormData = {
  name: string;
  schoolId: string;
  schoolName?: string;
  routeId?: string | null;
  routeName: string;
  shift: string;
  status: string;
  guardian: string;
  phone: string;
  address: string;
  district?: string | null;
  entryTime?: string | null;
  cep?: string | null;
  street?: string | null;
  number?: string | null;
  city?: string | null;
  state?: string | null;
  lat?: number | null;
  lng?: number | null;
  notes: string;
};

export type StudentImportResult = {
  created: StudentSummary[];
  errors: { index: number; message: string }[];
};

export const STUDENT_SEED: StudentDetail[] = [
  {
    id: 'ana-souza',
    name: 'Ana Souza',
    schoolId: 'emef-vale-azul',
    schoolName: 'EMEF Vale Azul',
    routeName: 'Rota Norte A',
    shift: 'Manha',
    status: 'Ativo',
    guardian: 'Marcos Souza',
    phone: '(11) 98888-1111',
    address: 'Rua das Flores, 120',
    notes: 'Prefere assento próximo ao monitor.',
  },
  {
    id: 'bruno-lima',
    name: 'Bruno Lima',
    schoolId: 'colegio-horizonte',
    schoolName: 'Colégio Horizonte',
    routeName: 'Centro 01',
    shift: 'Manha',
    status: 'Ativo',
    guardian: 'Carla Lima',
    phone: '(11) 97777-3333',
    address: 'Av. Central, 450',
    notes: '',
  },
  {
    id: 'camila-oliveira',
    name: 'Camila Oliveira',
    schoolId: 'escola-monte-verde',
    schoolName: 'Escola Monte Verde',
    routeName: 'Sul 02',
    shift: 'Tarde',
    status: 'Pendente',
    guardian: 'Ricardo Oliveira',
    phone: '(11) 95555-8899',
    address: 'Rua do Bosque, 980',
    notes: 'Aguardando documentação.',
  },
  {
    id: 'diego-santos',
    name: 'Diego Santos',
    schoolId: 'centro-saber',
    schoolName: 'Centro Saber',
    routeName: 'Leste 02',
    shift: 'Manha',
    status: 'Ativo',
    guardian: 'Fernanda Santos',
    phone: '(11) 96666-2200',
    address: 'Rua Horizonte, 55',
    notes: '',
  },
];

export const toStudentSummary = (student: StudentDetail): StudentSummary => ({
  id: student.id,
  name: student.name,
  schoolId: student.schoolId,
  schoolName: student.schoolName,
  routeId: student.routeId ?? null,
  routeName: student.routeName,
  shift: student.shift,
  status: student.status,
  entryTime: student.entryTime ?? null,
});
