import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Route as PrismaRoute, School as PrismaSchool } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  SchoolContact,
  SchoolDetail,
  SchoolFormData,
  SchoolRoute,
  SchoolSummary,
} from './schools.types';
import { SCHOOL_SEED, toSchoolSummary } from './schools.data';

@Injectable()
export class SchoolsService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    const shouldSeed = (process.env.SEED_DATA ?? '').toLowerCase() === 'true';
    if (!shouldSeed) {
      return;
    }

    const count = await this.prisma.school.count();
    if (count > 0) {
      await this.seedRoutesIfNeeded();
      return;
    }

    await this.prisma.school.createMany({
      data: SCHOOL_SEED.map((school) => ({ ...school })),
      skipDuplicates: true,
    });

    await this.seedRoutesIfNeeded();
  }

  async list(): Promise<SchoolSummary[]> {
    const schools = await this.prisma.school.findMany({
      orderBy: { name: 'asc' },
      include: { routesList: true },
    });
    return schools.map((school) => toSchoolSummary(this.toSchoolDetail(school)));
  }

  async getById(id: string): Promise<SchoolDetail> {
    const school = await this.prisma.school.findUnique({
      where: { id },
      include: { routesList: true },
    });
    if (!school) {
      throw new NotFoundException('Escola não encontrada');
    }
    return this.toSchoolDetail(school);
  }

  async create(payload: SchoolFormData): Promise<SchoolDetail> {
    const normalized = this.normalizePayload(payload);
    const id = await this.uniqueId(normalized.name);
    const detail: SchoolDetail = {
      id,
      name: normalized.name,
      district: normalized.district,
      address: normalized.address,
      cep: normalized.cep ?? null,
      street: normalized.street ?? null,
      number: normalized.number ?? null,
      city: normalized.city ?? null,
      state: normalized.state ?? null,
      lat: normalized.lat ?? null,
      lng: normalized.lng ?? null,
      students: normalized.students,
      capacity: normalized.capacity,
      routes: normalized.routes,
      status: 'Ativa',
      tone: '',
      shift: normalized.shift,
      pickupWindow: '06:30 - 07:15',
      dropoffWindow: '12:10 - 12:45',
      manager: normalized.manager,
      phone: normalized.phone,
      notes: normalized.notes,
      routeList: [],
      contacts: [
        { role: 'Diretora', name: normalized.manager, phone: normalized.phone },
      ],
    };

    const created = await this.prisma.school.create({ data: detail });
    return this.toSchoolDetail(created);
  }

  async update(id: string, payload: SchoolFormData): Promise<SchoolDetail> {
    const existing = await this.prisma.school.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Escola não encontrada');
    }

    const normalized = this.normalizePayload(payload);
    const updated = await this.prisma.school.update({
      where: { id },
      data: {
        name: normalized.name,
        district: normalized.district,
        address: normalized.address,
        cep: normalized.cep ?? null,
        street: normalized.street ?? null,
        number: normalized.number ?? null,
        city: normalized.city ?? null,
        state: normalized.state ?? null,
        lat: normalized.lat ?? null,
        lng: normalized.lng ?? null,
        students: normalized.students,
        capacity: normalized.capacity,
        routes: normalized.routes,
        shift: normalized.shift,
        manager: normalized.manager,
        phone: normalized.phone,
        notes: normalized.notes,
      },
    });
    return this.toSchoolDetail(updated);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.prisma.school.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Escola não encontrada');
    }

    await this.prisma.school.delete({ where: { id } });
  }

  private async uniqueId(name: string): Promise<string> {
    const base = this.slugify(name) || 'escola';
    let candidate = base;
    let counter = 1;

    while (await this.prisma.school.findUnique({ where: { id: candidate } })) {
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

  private normalizePayload(payload: SchoolFormData): SchoolFormData {
    const district = payload.district?.trim() ?? '';
    if (!district) {
      throw new BadRequestException('Bairro da escola não informado.');
    }
    const cep = payload.cep?.toString().replace(/\D/g, '') ?? '';
    const street = payload.street?.trim() ?? '';
    const number = payload.number?.toString().trim() ?? '';
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

    if (lat !== null && (Number.isNaN(lat) || lat < -90 || lat > 90)) {
      throw new BadRequestException('Latitude da escola inválida.');
    }
    if (lng !== null && (Number.isNaN(lng) || lng < -180 || lng > 180)) {
      throw new BadRequestException('Longitude da escola inválida.');
    }

    return {
      ...payload,
      district,
      address: formattedAddress,
      cep: cep || payload.cep || null,
      street: street || payload.street || null,
      number: number || payload.number || null,
      city: city || payload.city || null,
      state: state || payload.state || null,
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      students: Number(payload.students) || 0,
      capacity: Number(payload.capacity) || 0,
      routes: Number(payload.routes) || 0,
      notes: payload.notes ?? '',
    };
  }

  private toSchoolDetail(
    school: PrismaSchool & { routesList?: PrismaRoute[] }
  ): SchoolDetail {
    const routes = school.routesList ?? [];
    const routeList: SchoolRoute[] = routes.map((route) => ({
      name: route.name,
      schedule: `${route.startTime} - ${route.endTime}`,
      status: route.status,
      tone: this.toneForStatus(route.status),
    }));

    return {
      ...school,
      routes: routes.length || school.routes,
      contacts: (school.contacts as SchoolContact[]) ?? [],
      routeList: routeList.length > 0 ? routeList : (school.routeList as SchoolRoute[]) ?? [],
    };
  }

  private toneForStatus(status: string): string {
    const normalized = status.toLowerCase();
    if (normalized.includes('pend') || normalized.includes('revis')) {
      return 'warning';
    }
    if (normalized.includes('crit') || normalized.includes('atras')) {
      return 'danger';
    }
    return '';
  }

  private async seedRoutesIfNeeded(): Promise<void> {
    const count = await this.prisma.route.count();
    if (count > 0) {
      return;
    }

    const routesData: PrismaRoute[] = [];

    for (const school of SCHOOL_SEED) {
      for (const route of school.routeList) {
        const { start, end } = this.parseSchedule(route.schedule);
        routesData.push({
          id: `${school.id}-${this.slugify(route.name) || 'rota'}`,
          name: route.name,
          schoolId: school.id,
          shift: school.shift || 'Manha',
          status: route.status,
          startTime: start,
          endTime: end,
          capacity: Math.max(0, Math.round(school.capacity / Math.max(1, school.routes))),
          vehicleId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    if (routesData.length > 0) {
      await this.prisma.route.createMany({
        data: routesData.map((route) => ({
          id: route.id,
          name: route.name,
          schoolId: route.schoolId,
          shift: route.shift,
          status: route.status,
          startTime: route.startTime,
          endTime: route.endTime,
          capacity: route.capacity,
          vehicleId: route.vehicleId,
        })),
        skipDuplicates: true,
      });
    }
  }

  private parseSchedule(schedule: string): { start: string; end: string } {
    const parts = schedule.split('-').map((part) => part.trim());
    if (parts.length >= 2) {
      return { start: parts[0], end: parts[1] };
    }
    return { start: '06:30', end: '07:15' };
  }
}
