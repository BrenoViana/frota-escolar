export type SchoolRoute = {
  name: string;
  schedule: string;
  status: string;
  tone: string;
};

export type SchoolContact = {
  role: string;
  name: string;
  phone: string;
};

export type SchoolSummary = {
  id: string;
  name: string;
  district: string;
  address: string;
  students: number;
  routes: number;
  status: string;
  tone: string;
};

export type SchoolDetail = SchoolSummary & {
  address: string;
  cep?: string | null;
  street?: string | null;
  number?: string | null;
  city?: string | null;
  state?: string | null;
  lat?: number | null;
  lng?: number | null;
  capacity: number;
  shift: string;
  pickupWindow: string;
  dropoffWindow: string;
  manager: string;
  phone: string;
  notes: string;
  routeList: SchoolRoute[];
  contacts: SchoolContact[];
};

export type SchoolFormData = {
  name: string;
  district: string;
  address: string;
  cep?: string | null;
  street?: string | null;
  number?: string | null;
  city?: string | null;
  state?: string | null;
  lat?: number | null;
  lng?: number | null;
  students: number;
  capacity: number;
  routes: number;
  shift: string;
  manager: string;
  phone: string;
  notes: string;
};
