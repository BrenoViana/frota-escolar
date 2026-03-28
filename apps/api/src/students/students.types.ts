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

export type StudentImportItem = Partial<StudentFormData> & {
  schoolName?: string;
};

export type StudentImportPayload = {
  items: StudentImportItem[];
};

export type StudentImportResult = {
  created: StudentSummary[];
  errors: { index: number; message: string }[];
};
