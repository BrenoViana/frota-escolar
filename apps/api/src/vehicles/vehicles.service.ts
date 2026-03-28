import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { VehicleDetail, VehicleFormData, VehicleSummary } from './vehicles.types';

type VehicleWithRoutes = {
  id: string;
  plate: string;
  model: string;
  capacity: number;
  status: string;
  notes: string;
  garageCep?: string | null;
  garageStreet?: string | null;
  garageNumber?: string | null;
  garageDistrict?: string | null;
  garageCity?: string | null;
  garageState?: string | null;
  garageLat?: number | null;
  garageLng?: number | null;
  routes?: { id: string; name: string; school: { name: string } | null }[];
};

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<VehicleSummary[]> {
    const vehicles = await this.prisma.vehicle.findMany({
      orderBy: { plate: 'asc' },
      include: {
        routes: { select: { id: true, name: true, school: { select: { name: true } } } },
      },
    });
    return vehicles.map((vehicle) => this.toVehicleSummary(vehicle as VehicleWithRoutes));
  }

  async getById(id: string): Promise<VehicleDetail> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
      include: {
        routes: { select: { id: true, name: true, school: { select: { name: true } } } },
      },
    });
    if (!vehicle) {
      throw new NotFoundException('Veículo não encontrado');
    }
    return this.toVehicleDetail(vehicle as VehicleWithRoutes);
  }

  async create(payload: VehicleFormData): Promise<VehicleDetail> {
    const normalized = await this.normalizePayload(payload);
    const id = await this.uniqueId(`${normalized.plate}-${normalized.model}`);
    const { routeId, ...vehicleData } = normalized;

    const created = await this.prisma.$transaction(async (tx) => {
      const vehicle = await tx.vehicle.create({
        data: { ...vehicleData, id },
        include: {
          routes: { select: { id: true, name: true, school: { select: { name: true } } } },
        },
      });

      if (routeId) {
        await this.assignRoute(tx, vehicle.id, routeId);
      }

      return tx.vehicle.findUnique({
        where: { id: vehicle.id },
        include: {
          routes: { select: { id: true, name: true, school: { select: { name: true } } } },
        },
      });
    });

    return this.toVehicleDetail(created as VehicleWithRoutes);
  }

  async update(id: string, payload: VehicleFormData): Promise<VehicleDetail> {
    const existing = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Veículo não encontrado');
    }

    const normalized = await this.normalizePayload(payload);
    const { routeId, ...vehicleData } = normalized;

    const updated = await this.prisma.$transaction(async (tx) => {
      const vehicle = await tx.vehicle.update({
        where: { id },
        data: {
          plate: vehicleData.plate,
          model: vehicleData.model,
          capacity: vehicleData.capacity,
          status: vehicleData.status,
          notes: vehicleData.notes,
          garageCep: vehicleData.garageCep ?? null,
          garageStreet: vehicleData.garageStreet ?? null,
          garageNumber: vehicleData.garageNumber ?? null,
          garageDistrict: vehicleData.garageDistrict ?? null,
          garageCity: vehicleData.garageCity ?? null,
          garageState: vehicleData.garageState ?? null,
          garageLat: vehicleData.garageLat ?? null,
          garageLng: vehicleData.garageLng ?? null,
        },
        include: {
          routes: { select: { id: true, name: true, school: { select: { name: true } } } },
        },
      });

      await this.updateRouteAssignment(tx, id, routeId ?? null);
      return tx.vehicle.findUnique({
        where: { id: vehicle.id },
        include: {
          routes: { select: { id: true, name: true, school: { select: { name: true } } } },
        },
      });
    });

    return this.toVehicleDetail(updated as VehicleWithRoutes);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Veículo não encontrado');
    }
    await this.prisma.vehicle.delete({ where: { id } });
  }

  private async normalizePayload(payload: VehicleFormData): Promise<VehicleFormData> {
    if (!payload.plate) {
      throw new BadRequestException('Placa não informada.');
    }

    if (!payload.model) {
      throw new BadRequestException('Modelo não informado.');
    }

    const cep = payload.garageCep?.toString().replace(/\D/g, '') ?? '';
    const street = payload.garageStreet?.trim() ?? '';
    const number = payload.garageNumber?.toString().trim() ?? '';
    const district = payload.garageDistrict?.trim() ?? '';
    const city = payload.garageCity?.trim() ?? '';
    const state = payload.garageState?.trim().toUpperCase() ?? '';
    const lat =
      payload.garageLat !== undefined && payload.garageLat !== null && payload.garageLat !== ''
        ? Number(payload.garageLat)
        : null;
    const lng =
      payload.garageLng !== undefined && payload.garageLng !== null && payload.garageLng !== ''
        ? Number(payload.garageLng)
        : null;

    if (!district) {
      throw new BadRequestException('Bairro da garagem não informado.');
    }

    if (lat !== null && (Number.isNaN(lat) || lat < -90 || lat > 90)) {
      throw new BadRequestException('Latitude da garagem inválida.');
    }
    if (lng !== null && (Number.isNaN(lng) || lng < -180 || lng > 180)) {
      throw new BadRequestException('Longitude da garagem inválida.');
    }

    return {
      plate: payload.plate.trim().toUpperCase(),
      model: payload.model.trim(),
      capacity: Number(payload.capacity) || 0,
      status: payload.status?.trim() || 'Disponivel',
      notes: payload.notes ?? '',
      routeId: payload.routeId && payload.routeId.trim() !== '' ? payload.routeId : null,
      garageCep: cep || payload.garageCep || null,
      garageStreet: street || payload.garageStreet || null,
      garageNumber: number || payload.garageNumber || null,
      garageDistrict: district || payload.garageDistrict || null,
      garageCity: city || payload.garageCity || null,
      garageState: state || payload.garageState || null,
      garageLat: Number.isFinite(lat) ? lat : null,
      garageLng: Number.isFinite(lng) ? lng : null,
    };
  }

  private async uniqueId(value: string): Promise<string> {
    const base = this.slugify(value) || 'veiculo';
    let candidate = base;
    let counter = 1;

    while (await this.prisma.vehicle.findUnique({ where: { id: candidate } })) {
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

  private async assignRoute(
    tx: Prisma.TransactionClient,
    vehicleId: string,
    routeId: string
  ): Promise<void> {
    const route = await tx.route.findUnique({ where: { id: routeId } });
    if (!route) {
      throw new NotFoundException('Rota não encontrada');
    }
    await this.assertVehicleSchedule(tx, vehicleId, route.startTime, route.endTime, routeId);
    await tx.route.update({ where: { id: routeId }, data: { vehicleId } });
  }

  private async updateRouteAssignment(
    tx: Prisma.TransactionClient,
    vehicleId: string,
    routeId: string | null
  ): Promise<void> {
    if (routeId) {
      await this.assignRoute(tx, vehicleId, routeId);
    }
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
    tx: Prisma.TransactionClient,
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

    const routes = await tx.route.findMany({
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
          `Conflito de horário: veículo já vinculado à rota ${route.name} (${route.startTime} - ${route.endTime}).`
        );
      }
    }
  }

  private toVehicleSummary(vehicle: VehicleWithRoutes): VehicleSummary {
    const route = vehicle.routes?.[0];
    return {
      id: vehicle.id,
      plate: vehicle.plate,
      model: vehicle.model,
      capacity: vehicle.capacity,
      status: vehicle.status,
      routeId: route?.id ?? null,
      routeName: route?.name,
      schoolName: route?.school?.name,
    };
  }

  private toVehicleDetail(vehicle: VehicleWithRoutes): VehicleDetail {
    return {
      ...this.toVehicleSummary(vehicle),
      notes: vehicle.notes ?? '',
      garageCep: vehicle.garageCep ?? null,
      garageStreet: vehicle.garageStreet ?? null,
      garageNumber: vehicle.garageNumber ?? null,
      garageDistrict: vehicle.garageDistrict ?? null,
      garageCity: vehicle.garageCity ?? null,
      garageState: vehicle.garageState ?? null,
      garageLat: vehicle.garageLat ?? null,
      garageLng: vehicle.garageLng ?? null,
    };
  }
}
