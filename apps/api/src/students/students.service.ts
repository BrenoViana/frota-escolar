import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Route as PrismaRoute, Student as PrismaStudent } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  StudentDetail,
  StudentFormData,
  StudentImportPayload,
  StudentImportResult,
  StudentSummary,
} from './students.types';

type StudentWithSchool = PrismaStudent & {
  school: { name: string };
  route: { id: string; name: string } | null;
};

@Injectable()
export class StudentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<StudentSummary[]> {
    const students = await this.prisma.student.findMany({
      orderBy: { name: 'asc' },
      include: {
        school: { select: { name: true } },
        route: { select: { id: true, name: true } },
      },
    });
    return students.map((student) => this.toStudentSummary(student));
  }

  async getById(id: string): Promise<StudentDetail> {
    const student = await this.prisma.student.findUnique({
      where: { id },
      include: {
        school: { select: { name: true } },
        route: { select: { id: true, name: true } },
      },
    });
    if (!student) {
      throw new NotFoundException('Aluno não encontrado');
    }
    return this.toStudentDetail(student);
  }

  async create(payload: StudentFormData): Promise<StudentDetail> {
    const normalized = await this.normalizePayload(payload);
    const id = await this.uniqueId(normalized.name);

    const created = await this.prisma.student.create({
      data: { ...normalized, id },
      include: {
        school: { select: { name: true } },
        route: { select: { id: true, name: true } },
      },
    });

    await this.prisma.school.update({
      where: { id: normalized.schoolId },
      data: { students: { increment: 1 } },
    });

    return this.toStudentDetail(created);
  }

  async update(id: string, payload: StudentFormData): Promise<StudentDetail> {
    const existing = await this.prisma.student.findUnique({
      where: { id },
      include: {
        school: { select: { name: true } },
        route: { select: { id: true, name: true } },
      },
    });
    if (!existing) {
      throw new NotFoundException('Aluno não encontrado');
    }

    const normalized = await this.normalizePayload(payload);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (existing.schoolId !== normalized.schoolId) {
        await tx.school.update({
          where: { id: existing.schoolId },
          data: { students: { decrement: 1 } },
        });
        await tx.school.update({
          where: { id: normalized.schoolId },
          data: { students: { increment: 1 } },
        });
      }

      return tx.student.update({
        where: { id },
        data: {
          name: normalized.name,
          schoolId: normalized.schoolId,
          routeId: normalized.routeId ?? null,
          routeName: normalized.routeName,
          shift: normalized.shift,
          status: normalized.status,
          guardian: normalized.guardian,
          phone: normalized.phone,
          address: normalized.address,
          district: normalized.district ?? null,
          entryTime: normalized.entryTime ?? null,
          cep: normalized.cep ?? null,
          street: normalized.street ?? null,
          number: normalized.number ?? null,
          city: normalized.city ?? null,
          state: normalized.state ?? null,
          lat: normalized.lat ?? null,
          lng: normalized.lng ?? null,
          notes: normalized.notes,
        },
        include: {
          school: { select: { name: true } },
          route: { select: { id: true, name: true } },
        },
      });
    });

    return this.toStudentDetail(updated);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.prisma.student.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Aluno não encontrado');
    }

    await this.prisma.$transaction([
      this.prisma.student.delete({ where: { id } }),
      this.prisma.school.update({
        where: { id: existing.schoolId },
        data: { students: { decrement: 1 } },
      }),
    ]);
  }

  async import(payload: StudentImportPayload): Promise<StudentImportResult> {
    const items = payload?.items ?? [];
    const created: StudentSummary[] = [];
    const errors: { index: number; message: string }[] = [];

    for (const [index, item] of items.entries()) {
      try {
        if (!item.name) {
          throw new BadRequestException('Nome do aluno não informado.');
        }

        const schoolId = await this.resolveSchoolId(item.schoolId, item.schoolName);
        if (!schoolId) {
          throw new BadRequestException('Escola não encontrada.');
        }

        const detail = await this.create({
          name: item.name,
          schoolId,
          routeId: item.routeId ?? null,
          routeName: item.routeName ?? '',
          shift: item.shift ?? 'Manha',
          status: item.status ?? 'Ativo',
          guardian: item.guardian ?? '',
          phone: item.phone ?? '',
          address: item.address ?? '',
          district: item.district ?? null,
          entryTime: item.entryTime ?? null,
          cep: item.cep ?? null,
          street: item.street ?? null,
          number: item.number ?? null,
          city: item.city ?? null,
          state: item.state ?? null,
          lat: item.lat ?? null,
          lng: item.lng ?? null,
          notes: item.notes ?? '',
        });
        created.push(this.toSummaryFromDetail(detail));
      } catch (error) {
        errors.push({ index, message: this.readableError(error) });
      }
    }

    return { created, errors };
  }

  private async resolveSchoolId(
    schoolId?: string,
    schoolName?: string
  ): Promise<string | null> {
    if (schoolId) {
      const school = await this.prisma.school.findUnique({ where: { id: schoolId } });
      return school?.id ?? null;
    }

    if (!schoolName) {
      return null;
    }

    const school = await this.prisma.school.findFirst({
      where: { name: { equals: schoolName, mode: 'insensitive' } },
    });
    return school?.id ?? null;
  }

  private async normalizePayload(payload: StudentFormData): Promise<StudentFormData> {
    if (!payload.name) {
      throw new BadRequestException('Nome do aluno não informado.');
    }

    if (!payload.schoolId) {
      throw new BadRequestException('Escola não informada.');
    }

    const school = await this.prisma.school.findUnique({
      where: { id: payload.schoolId },
      select: { id: true, lat: true, lng: true, name: true },
    });
    if (!school) {
      throw new NotFoundException('Escola não encontrada');
    }

    const routeId = payload.routeId && payload.routeId.trim() !== '' ? payload.routeId : null;
    const resolvedRoute = await this.resolveRoute(routeId, payload.routeName, payload.schoolId);

    const cep = payload.cep?.toString().replace(/\D/g, '') ?? '';
    const street = payload.street?.trim() ?? '';
    const number = payload.number?.toString().trim() ?? '';
    const district = payload.district?.trim() ?? '';
    const entryTime = payload.entryTime?.toString().trim() ?? '';
    const city = payload.city?.trim() ?? '';
    const state = payload.state?.trim().toUpperCase() ?? '';
    const lat = payload.lat !== undefined && payload.lat !== null && payload.lat !== ''
      ? Number(payload.lat)
      : null;
    const lng = payload.lng !== undefined && payload.lng !== null && payload.lng !== ''
      ? Number(payload.lng)
      : null;
    const formattedAddress =
      street && number && city && state
        ? `${street}, ${number}${district ? `, ${district}` : ''} - ${city}/${state}`
        : payload.address?.trim() ?? '';

    if (!district) {
      throw new BadRequestException('Bairro do aluno não informado.');
    }

    if (!entryTime) {
      throw new BadRequestException('Horário de entrada do aluno não informado.');
    }
    const normalizedEntryTime = this.normalizeTime(entryTime);
    if (!normalizedEntryTime) {
      throw new BadRequestException('Horário de entrada do aluno inválido.');
    }

    if (lat !== null && (Number.isNaN(lat) || lat < -90 || lat > 90)) {
      throw new BadRequestException('Latitude do aluno inválida.');
    }
    if (lng !== null && (Number.isNaN(lng) || lng < -180 || lng > 180)) {
      throw new BadRequestException('Longitude do aluno inválida.');
    }

    if (
      school.lat !== null &&
      school.lat !== undefined &&
      school.lng !== null &&
      school.lng !== undefined &&
      lat !== null &&
      lat !== undefined &&
      lng !== null &&
      lng !== undefined
    ) {
      const epsilon = 1e-7;
      const sameLat = Math.abs(lat - school.lat) < epsilon;
      const sameLng = Math.abs(lng - school.lng) < epsilon;
      if (sameLat && sameLng) {
        throw new BadRequestException(
          `Coordenadas do aluno iguais às da escola ${school.name}. Revise o endereço.`
        );
      }
    }

    return {
      name: payload.name.trim(),
      schoolId: payload.schoolId,
      routeId: resolvedRoute?.id ?? null,
      routeName: resolvedRoute?.name ?? payload.routeName?.trim() ?? '',
      shift: payload.shift?.trim() ?? 'Manha',
      status: payload.status?.trim() ?? 'Ativo',
      guardian: payload.guardian?.trim() ?? '',
      phone: payload.phone?.trim() ?? '',
      address: formattedAddress,
      district: district || payload.district || null,
      entryTime: normalizedEntryTime,
      cep: cep || payload.cep || null,
      street: street || payload.street || null,
      number: number || payload.number || null,
      city: city || payload.city || null,
      state: state || payload.state || null,
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      notes: payload.notes ?? '',
    };
  }

  private async resolveRoute(
    routeId: string | null,
    routeName: string | undefined,
    schoolId: string
  ): Promise<PrismaRoute | null> {
    if (routeId) {
      const route = await this.prisma.route.findUnique({ where: { id: routeId } });
      if (!route) {
        throw new NotFoundException('Rota não encontrada');
      }
      if (route.schoolId !== schoolId) {
        throw new BadRequestException('Rota não pertence à escola informada.');
      }
      return route;
    }

    if (!routeName) {
      return null;
    }

    const route = await this.prisma.route.findFirst({
      where: {
        schoolId,
        name: { equals: routeName.trim(), mode: 'insensitive' },
      },
    });
    return route ?? null;
  }

  private async uniqueId(name: string): Promise<string> {
    const base = this.slugify(name) || 'aluno';
    let candidate = base;
    let counter = 1;

    while (await this.prisma.student.findUnique({ where: { id: candidate } })) {
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

  private toStudentSummary(student: StudentWithSchool): StudentSummary {
    return {
      id: student.id,
      name: student.name,
      schoolId: student.schoolId,
      schoolName: student.school.name,
      routeId: student.route?.id ?? student.routeId ?? null,
      routeName: student.route?.name ?? student.routeName,
      shift: student.shift,
      status: student.status,
      entryTime: student.entryTime ?? null,
    };
  }

  private toStudentDetail(student: StudentWithSchool): StudentDetail {
    return {
      ...this.toStudentSummary(student),
      guardian: student.guardian,
      phone: student.phone,
      address: student.address,
      district: student.district,
      entryTime: student.entryTime ?? null,
      cep: student.cep,
      street: student.street,
      number: student.number,
      city: student.city,
      state: student.state,
      lat: student.lat,
      lng: student.lng,
      notes: student.notes,
    };
  }

  private toSummaryFromDetail(detail: StudentDetail): StudentSummary {
    return {
      id: detail.id,
      name: detail.name,
      schoolId: detail.schoolId,
      schoolName: detail.schoolName,
      routeName: detail.routeName,
      shift: detail.shift,
      status: detail.status,
      entryTime: detail.entryTime ?? null,
    };
  }

  private normalizeTime(value: string): string | null {
    const match = value.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) {
      return null;
    }
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (Number.isNaN(hour) || Number.isNaN(minute)) {
      return null;
    }
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return null;
    }
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  }

  private readableError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return 'Erro inesperado ao importar.';
  }
}
