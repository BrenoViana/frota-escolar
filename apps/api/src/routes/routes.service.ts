import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { StudentSummary } from '../students/students.types';
import { RouteDetail, RouteFormData, RouteSummary } from './routes.types';

type RouteWithRelations = {
  id: string;
  name: string;
  schoolId: string | null;
  school: { id: string; name: string } | null;
  shift: string;
  status: string;
  startTime: string;
  endTime: string;
  capacity: number;
  vehicleId: string | null;
  vehicle: { id: string; plate: string; model: string } | null;
  students?: {
    id: string;
    name: string;
    shift: string;
    status: string;
    entryTime?: string | null;
    schoolId: string;
    school: { id: string; name: string };
  }[];
  _count?: { students: number };
};

@Injectable()
export class RoutesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(schoolId?: string): Promise<RouteSummary[]> {
    const routes = await this.prisma.route.findMany({
      where: schoolId
        ? {
            OR: [{ schoolId }, { students: { some: { schoolId } } }],
          }
        : undefined,
      orderBy: { name: 'asc' },
      include: {
        school: { select: { id: true, name: true } },
        vehicle: { select: { id: true, plate: true, model: true } },
        _count: { select: { students: true } },
        students: {
          select: {
            id: true,
            name: true,
            shift: true,
            status: true,
            entryTime: true,
            schoolId: true,
            school: { select: { id: true, name: true } },
          },
        },
      },
    });

    return routes.map((route) => this.toRouteSummary(route as RouteWithRelations));
  }

  async getById(id: string): Promise<RouteDetail> {
    const route = await this.prisma.route.findUnique({
      where: { id },
      include: {
        school: { select: { id: true, name: true } },
        vehicle: { select: { id: true, plate: true, model: true } },
        students: {
          orderBy: { name: 'asc' },
          include: { school: { select: { id: true, name: true } } },
        },
      },
    });
    if (!route) {
      throw new NotFoundException('Rota não encontrada');
    }

    return this.toRouteDetail(route as RouteWithRelations);
  }

  async create(payload: RouteFormData): Promise<RouteDetail> {
    const normalized = await this.normalizePayload(payload);
    const id = await this.uniqueId(normalized.name);

    const created = await this.prisma.$transaction(async (tx) => {
      const routeData: {
        id: string;
        name: string;
        shift: string;
        status: string;
        startTime: string;
        endTime: string;
        capacity: number;
        school?: { connect: { id: string } };
        vehicle?: { connect: { id: string } };
      } = {
        id,
        name: normalized.name,
        shift: normalized.shift,
        status: normalized.status,
        startTime: normalized.startTime,
        endTime: normalized.endTime,
        capacity: normalized.capacity,
      };

      if (normalized.schoolId) {
        routeData.school = { connect: { id: normalized.schoolId } };
      }
      if (normalized.vehicleId) {
        routeData.vehicle = { connect: { id: normalized.vehicleId } };
      }

      const createdRoute = await tx.route.create({
        data: routeData,
        include: {
          school: { select: { id: true, name: true } },
          vehicle: { select: { id: true, plate: true, model: true } },
          students: {
            orderBy: { name: 'asc' },
            include: { school: { select: { id: true, name: true } } },
          },
        },
      });

      if (normalized.studentIds?.length) {
        await tx.student.updateMany({
          where: { id: { in: normalized.studentIds } },
          data: { routeId: id, routeName: normalized.name },
        });
      }

      const refreshed = await tx.route.findUnique({
        where: { id },
        include: {
          school: { select: { id: true, name: true } },
          vehicle: { select: { id: true, plate: true, model: true } },
          students: {
            orderBy: { name: 'asc' },
            include: { school: { select: { id: true, name: true } } },
          },
        },
      });

      return refreshed ?? createdRoute;
    });

    return this.toRouteDetail(created as RouteWithRelations);
  }

  async update(id: string, payload: RouteFormData): Promise<RouteDetail> {
    const existing = await this.prisma.route.findUnique({
      where: { id },
      include: { school: { select: { id: true, name: true } } },
    });
    if (!existing) {
      throw new NotFoundException('Rota não encontrada');
    }

    const normalized = await this.normalizePayload(payload, id, existing.schoolId ?? null);

    const updated = await this.prisma.$transaction(async (tx) => {
      const currentStudents = await tx.student.findMany({
        where: { routeId: id },
        select: { id: true },
      });
      const currentIds = new Set(currentStudents.map((student) => student.id));
      const nextIds = new Set(normalized.studentIds ?? []);
      const toRemove = Array.from(currentIds).filter((studentId) => !nextIds.has(studentId));
      const toAdd = Array.from(nextIds).filter((studentId) => !currentIds.has(studentId));

      if (toRemove.length) {
        await tx.student.updateMany({
          where: { id: { in: toRemove } },
          data: { routeId: null, routeName: '' },
        });
      }

      if (toAdd.length) {
        await tx.student.updateMany({
          where: { id: { in: toAdd } },
          data: { routeId: id, routeName: normalized.name },
        });
      }

      await tx.student.updateMany({
        where: { routeId: id },
        data: { routeName: normalized.name },
      });

      return tx.route.update({
        where: { id },
        data: {
          name: normalized.name,
          school: normalized.schoolId
            ? { connect: { id: normalized.schoolId } }
            : { disconnect: true },
          shift: normalized.shift,
          status: normalized.status,
          startTime: normalized.startTime,
          endTime: normalized.endTime,
          capacity: normalized.capacity,
          vehicle: normalized.vehicleId
            ? { connect: { id: normalized.vehicleId } }
            : { disconnect: true },
        },
        include: {
          school: { select: { id: true, name: true } },
          vehicle: { select: { id: true, plate: true, model: true } },
          students: {
            orderBy: { name: 'asc' },
            include: { school: { select: { id: true, name: true } } },
          },
        },
      });
    });

    return this.toRouteDetail(updated as RouteWithRelations);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.prisma.route.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Rota não encontrada');
    }

    await this.prisma.$transaction([
      this.prisma.student.updateMany({
        where: { routeId: id },
        data: { routeId: null, routeName: '' },
      }),
      this.prisma.route.delete({ where: { id } }),
    ]);
  }

  private async normalizePayload(
    payload: RouteFormData,
    routeId?: string,
    fallbackSchoolId?: string | null
  ): Promise<RouteFormData> {
    if (!payload.name) {
      throw new BadRequestException('Nome da rota não informado.');
    }

    let vehicleId: string | null =
      payload.vehicleId && payload.vehicleId.trim() !== '' ? payload.vehicleId : null;
    const startTime = payload.startTime?.trim() || '06:30';
    const endTime = payload.endTime?.trim() || '07:15';

    if (vehicleId) {
      const vehicle = await this.prisma.vehicle.findUnique({
        where: { id: vehicleId },
      });
      if (!vehicle) {
        throw new NotFoundException('Veículo não encontrado');
      }
      await this.assertVehicleSchedule(vehicleId, startTime, endTime, routeId);
    }

    const studentIds = Array.isArray(payload.studentIds)
      ? payload.studentIds.filter((id) => !!id)
      : [];
    let derivedSchoolId: string | null = null;
    if (studentIds.length) {
      const students = await this.prisma.student.findMany({
        where: { id: { in: studentIds } },
        select: { id: true, schoolId: true },
      });
      if (students.length !== studentIds.length) {
        const found = new Set(students.map((student) => student.id));
        const missing = studentIds.filter((id) => !found.has(id));
        throw new BadRequestException(`Alunos não encontrados: ${missing.join(', ')}`);
      }
      const schools = new Set(students.map((student) => student.schoolId));
      derivedSchoolId = schools.size === 1 ? Array.from(schools)[0] : null;
    } else if (!routeId) {
      throw new BadRequestException('Selecione ao menos um aluno para a rota.');
    }

    return {
      name: payload.name.trim(),
      schoolId:
        payload.schoolId !== undefined
          ? payload.schoolId || null
          : derivedSchoolId ?? fallbackSchoolId ?? null,
      shift: payload.shift?.trim() || 'Manha',
      status: payload.status?.trim() || 'Ativa',
      startTime,
      endTime,
      capacity: Number(payload.capacity) || 0,
      vehicleId,
      studentIds,
    };
  }

  private async uniqueId(name: string): Promise<string> {
    const base = this.slugify(name) || 'rota';
    let candidate = base;
    let counter = 1;

    while (await this.prisma.route.findUnique({ where: { id: candidate } })) {
      candidate = `${base}-${counter}`;
      counter += 1;
    }

    return candidate;
  }

  private slugify(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  private parseTimeToMinutes(value?: string | null): number | null {
    if (!value) {
      return null;
    }
    const [rawHour, rawMinute] = value.split(':');
    const hour = Number(rawHour);
    const minute = Number(rawMinute);
    if (Number.isNaN(hour) || Number.isNaN(minute)) {
      return null;
    }
    return hour * 60 + minute;
  }

  private async assertVehicleSchedule(
    vehicleId: string,
    startTime?: string | null,
    endTime?: string | null,
    routeId?: string
  ): Promise<void> {
    const start = this.parseTimeToMinutes(startTime);
    const end = this.parseTimeToMinutes(endTime);
    if (start === null || end === null || end <= start) {
      return;
    }

    const routes = await this.prisma.route.findMany({
      where: {
        vehicleId,
        ...(routeId ? { NOT: { id: routeId } } : {}),
      },
      select: { id: true, name: true, startTime: true, endTime: true },
    });

    for (const route of routes) {
      const otherStart = this.parseTimeToMinutes(route.startTime);
      const otherEnd = this.parseTimeToMinutes(route.endTime);
      if (otherStart === null || otherEnd === null || otherEnd <= otherStart) {
        continue;
      }

      const overlap = start < otherEnd && end > otherStart;
      if (overlap) {
        throw new BadRequestException(
          `Veículo já vinculado à rota ${route.name} (${route.startTime} - ${route.endTime}). Ajuste o horário ou selecione outro veículo.`
        );
      }
    }
  }

  private toRouteSummary(route: RouteWithRelations): RouteSummary {
    const vehicleLabel = route.vehicle ? `${route.vehicle.plate} • ${route.vehicle.model}` : '';
    const schools = this.collectSchools(route);
    const schoolLabel = schools.map((school) => school.name).join(' • ');
    const primarySchoolId = route.schoolId ?? (schools.length === 1 ? schools[0].id : null);

    return {
      id: route.id,
      name: route.name,
      schoolId: primarySchoolId,
      schoolName: schoolLabel || route.school?.name || '',
      schools,
      shift: route.shift,
      status: route.status,
      startTime: route.startTime,
      endTime: route.endTime,
      capacity: route.capacity,
      students: route._count?.students ?? route.students?.length ?? 0,
      vehicleId: route.vehicle?.id ?? route.vehicleId ?? null,
      vehicleLabel: vehicleLabel || undefined,
    };
  }

  private toRouteDetail(route: RouteWithRelations): RouteDetail {
    const studentsList: StudentSummary[] =
      route.students?.map((student) => ({
        id: student.id,
        name: student.name,
        schoolId: student.schoolId,
        schoolName: student.school.name,
        routeId: route.id,
        routeName: route.name,
        shift: student.shift,
        status: student.status,
        entryTime: student.entryTime ?? null,
      })) ?? [];

    return {
      ...this.toRouteSummary(route),
      studentsList,
    };
  }

  private collectSchools(route: RouteWithRelations): { id: string; name: string }[] {
    const map = new Map<string, string>();
    if (route.school) {
      map.set(route.school.id, route.school.name);
    }
    route.students?.forEach((student) => {
      if (student.school?.id) {
        map.set(student.school.id, student.school.name);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }
}
