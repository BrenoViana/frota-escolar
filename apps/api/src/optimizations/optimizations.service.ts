import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { requestJson } from '../shared/http';
import {
  OptimizationRequest,
  OptimizationResult,
  OptimizationStop,
  OptimizationUpdateRequest,
} from './optimizations.types';

type GeoPoint = { lat: number; lon: number };

type OrsGeocodeResponse = {
  features?: { geometry?: { coordinates?: [number, number] } }[];
};

type OrsSnapResponse = {
  locations?: Array<{ location?: [number, number] } | null>;
};

type OrsMatrixResponse = {
  durations?: number[][];
};

type VroomStep = {
  type: string;
  id?: number;
  arrival?: number;
  duration?: number;
  distance?: number;
};

type VroomRoute = {
  vehicle?: number;
  distance?: number;
  duration?: number;
  steps?: VroomStep[];
};

type VroomResponse = {
  routes?: VroomRoute[];
  unassigned?: { id: number; reason?: number }[];
};

type AwesomeCepResponse = {
  cep?: string;
  lat?: string;
  lng?: string;
};

type OrsDirectionsResponse = {
  routes?: Array<{
    geometry?: string;
    segments?: Array<{ distance?: number; duration?: number }>;
    summary?: { distance?: number; duration?: number };
  }>;
};

@Injectable()
export class OptimizationsService {
  private readonly logger = new Logger(OptimizationsService.name);
  private readonly orsKey = process.env.ORS_API_KEY ?? '';
  private readonly orsBase = (process.env.ORS_BASE_URL ?? 'https://api.openrouteservice.org')
    .replace(/\/$/, '');
  private readonly orsProfile = process.env.ORS_PROFILE ?? 'driving-car';
  private readonly orsSnapRadius = Number(process.env.ORS_SNAP_RADIUS) || 2000;
  private readonly orsMatrixMax = Number(process.env.ORS_MATRIX_MAX) || 50;
  private readonly orsCountry = process.env.ORS_COUNTRY?.trim();
  private readonly maxCepDriftMeters = Number(process.env.MAX_CEP_DRIFT_METERS) || 5000;

  constructor(private readonly prisma: PrismaService) {}

  async optimizeRoute(routeId: string, payload: OptimizationRequest): Promise<OptimizationResult> {
    if (!this.orsKey) {
      throw new BadRequestException('Configure ORS_API_KEY para usar a otimização.');
    }

    this.logger.log(
      `Optimize ${routeId} students=${payload.studentIds?.length ?? 'rota'} vehicles=${payload.vehicleIds?.length ?? 'padrao'}`
    );
    const route = await this.prisma.route.findUnique({
      where: { id: routeId },
      include: {
        vehicle: true,
        students: { include: { school: true } },
      },
    });

    if (!route) {
      throw new NotFoundException('Rota não encontrada.');
    }

    const candidateStudents = payload.studentIds?.length
      ? await this.prisma.student.findMany({
          where: { id: { in: payload.studentIds } },
          include: { school: true },
        })
      : route.students;

    if (payload.studentIds?.length) {
      const found = new Set(candidateStudents.map((student) => student.id));
      const missing = payload.studentIds.filter((id) => !found.has(id));
      if (missing.length) {
        throw new BadRequestException(`Alunos não encontrados: ${missing.join(', ')}`);
      }
    }

    if (!candidateStudents.length) {
      throw new BadRequestException('Não há alunos vinculados para otimizar.');
    }

    const cache = new Map<string, GeoPoint>();
    const cepCache = new Map<string, GeoPoint>();
    const departAt = payload.departAt?.trim() || route.startTime || '06:00';
    const departSec = this.parseTimeToSeconds(departAt) ?? 0;
    const maxDurationMin = Number(process.env.MAX_ROUTE_DURATION_MIN) || 90;
    const returnBufferMin = Number(process.env.RETURN_BUFFER_MIN) || 180;
    const entryToleranceMin = Number(process.env.ENTRY_TOLERANCE_MIN) || 10;
    const routeEndSec = this.parseTimeToSeconds(route.endTime);
    let endSec =
      routeEndSec && routeEndSec > departSec
        ? routeEndSec
        : departSec + maxDurationMin * 60;
    const capacity = route.capacity || Number(process.env.VEHICLE_CAPACITY_DEFAULT) || 12;
    const pickupServiceSec = Number(process.env.PICKUP_SERVICE_SEC) || 60;
    const dropoffServiceSec = Number(process.env.DROPOFF_SERVICE_SEC) || 120;
    const vehicles = await this.resolveVehicles(routeId, payload.vehicleIds, capacity);
    const vehiclesWithGarage = await Promise.all(
      vehicles.map(async (vehicle) => ({
        ...vehicle,
        garage: await this.resolveGaragePoint(payload, cache, vehicle),
      }))
    );
    const garage = vehiclesWithGarage[0]?.garage.point;
    if (!garage) {
      throw new BadRequestException('Informe o endereço da garagem.');
    }
    this.logger.log(`Garage resolved: ${garage.lat}, ${garage.lon}`);

    const warnings: string[] = [];
    let shipments: Array<{
      id: number;
      pickup: { id: number; location: [number, number]; service: number };
      delivery: {
        id: number;
        location: [number, number];
        service: number;
        time_windows?: [number, number][];
      };
      amount: [number];
    }> = [];

    let shipmentMap = new Map<number, {
      studentId: string;
      studentName: string;
      schoolId: string;
      schoolName: string;
      pickupAddress?: string;
      dropoffAddress?: string;
      pickupPoint?: GeoPoint;
      dropoffPoint?: GeoPoint;
      distanceMeters?: number;
    }>();
    let latestDropoffEnd: number | null = null;

    let shipmentId = 1;
    for (const student of candidateStudents) {
      const pickupAddress = this.composeAddressFromParts({
        street: student.street,
        number: student.number,
        district: student.district,
        city: student.city,
        state: student.state,
        cep: student.cep,
        fallback: student.address,
      });
      const dropoffAddress = this.composeAddressFromParts({
        street: student.school?.street,
        number: student.school?.number,
        district: student.school?.district,
        city: student.school?.city,
        state: student.school?.state,
        cep: student.school?.cep,
        fallback: student.school?.address,
      });

      if (!pickupAddress) {
        warnings.push(`Aluno ${student.name} sem endereço. Ignorado na otimização.`);
        continue;
      }
      if (!dropoffAddress) {
        warnings.push(`Escola do aluno ${student.name} sem endereço. Ignorado na otimização.`);
        continue;
      }

      try {
        const pickup = await this.resolvePointWithCepFallback({
          label: `aluno ${student.name}`,
          address: pickupAddress,
          cep: student.cep ?? null,
          lat: student.lat,
          lng: student.lng,
          cache,
          cepCache,
          focus: garage,
          warnings,
        });
        const dropoff = await this.resolvePointWithCepFallback({
          label: `escola ${student.school.name}`,
          address: dropoffAddress,
          cep: student.school.cep ?? null,
          lat: student.school.lat,
          lng: student.school.lng,
          cache,
          cepCache,
          focus: garage,
          warnings,
        });
        this.logger.log(
          `Aluno ${student.name} pickup=${pickup.lat},${pickup.lon} dropoff=${dropoff.lat},${dropoff.lon}`
        );
        const entryTime = student.entryTime?.trim() ?? '';
        const entrySec = entryTime ? this.parseTimeToSeconds(entryTime) : null;
        let deliveryWindow: [number, number] | null = null;
        if (entrySec !== null) {
          if (entrySec <= departSec) {
            warnings.push(
              `Horário de entrada do aluno ${student.name} anterior ao início da rota. Ignorando janela.`
            );
          } else {
            const toleranceSec = Math.max(0, entryToleranceMin) * 60;
            const startWindow = Math.max(departSec, entrySec - toleranceSec);
            deliveryWindow = [startWindow, entrySec];
          }
        } else if (entryTime) {
          warnings.push(`Horário de entrada inválido para ${student.name}.`);
        }
        if (!deliveryWindow) {
          deliveryWindow = this.parseWindowToSeconds(student.school.dropoffWindow);
        }
        if (deliveryWindow?.[1] !== undefined && deliveryWindow[1] !== null) {
          latestDropoffEnd =
            latestDropoffEnd === null
              ? deliveryWindow[1]
              : Math.max(latestDropoffEnd, deliveryWindow[1]);
        }

        const distanceMeters = this.distanceMeters(pickup, dropoff);
        if (distanceMeters < 1) {
          warnings.push(
            `Coleta e entrega possuem as mesmas coordenadas para ${student.name}. Revise o endereço.`
          );
        } else if (distanceMeters < 50) {
          warnings.push(
            `Coleta e entrega muito proximas para ${student.name} (~${Math.round(
              distanceMeters
            )}m). Verifique o endereço.`
          );
        }

        shipments.push({
          id: shipmentId,
          pickup: {
            id: shipmentId * 10 + 1,
            location: [pickup.lon, pickup.lat],
            service: pickupServiceSec,
          },
          delivery: {
            id: shipmentId * 10 + 2,
            location: [dropoff.lon, dropoff.lat],
            service: dropoffServiceSec,
            time_windows: deliveryWindow ? [deliveryWindow] : undefined,
          },
          amount: [1],
        });

        shipmentMap.set(shipmentId, {
          studentId: student.id,
          studentName: student.name,
          schoolId: student.schoolId,
          schoolName: student.school.name,
          pickupAddress: pickupAddress || undefined,
          dropoffAddress: dropoffAddress || undefined,
          pickupPoint: pickup,
          dropoffPoint: dropoff,
          distanceMeters,
        });

        shipmentId += 1;
      } catch (error) {
        this.logger.warn(`Falha geocode aluno ${student.name}`);
        warnings.push(`Falha ao geocodificar ${student.name}. Ignorado na otimização.`);
      }
    }

    if (!shipments.length) {
      throw new BadRequestException('Nenhum aluno válido para otimizar.');
    }

    this.logger.log(`Shipments preparados: ${shipments.length}`);
    const filtered = await this.filterShipmentsByReachability(
      garage,
      shipments,
      shipmentMap,
      warnings
    );
    shipments = filtered.shipments;
    shipmentMap = filtered.shipmentMap;

    if (!shipments.length) {
      throw new BadRequestException(
        'Nenhum aluno alcançável pela garagem. Revise o endereço/lat-lng.'
      );
    }

    if (latestDropoffEnd !== null && latestDropoffEnd > endSec) {
      endSec = latestDropoffEnd;
    }
    endSec = Math.min(86399, endSec + returnBufferMin * 60);

    const response = await requestJson<VroomResponse>(`${this.orsBase}/optimization`, {
      method: 'POST',
      headers: {
        Authorization: this.orsKey,
      },
      body: {
        vehicles: vehiclesWithGarage.map((vehicle) => ({
          id: vehicle.numericId,
          profile: this.orsProfile,
          start: [vehicle.garage.point.lon, vehicle.garage.point.lat],
          end: [vehicle.garage.point.lon, vehicle.garage.point.lat],
          capacity: [vehicle.capacity],
          time_window: [departSec, endSec],
        })),
        shipments,
      },
      timeoutMs: 20000,
    });

    const plans = response.routes ?? [];
    if (!plans.length) {
      if (response.unassigned?.length) {
        const details = response.unassigned
          .map((item) => {
            const shipmentId = this.resolveShipmentId(item.id, shipmentMap);
            const shipment = shipmentId ? shipmentMap.get(shipmentId) : undefined;
            const name = shipment?.studentName ?? `ID ${item.id}`;
            const reason = this.describeUnassignedReason(item.reason);
            return `${name} (${reason})`;
          })
          .join(', ');
        throw new BadRequestException(
          `Não foi possível gerar a sequência otimizada. Alunos não alocados: ${details}.`
        );
      }
      throw new BadRequestException('Não foi possível gerar a sequência otimizada.');
    }

    this.logger.log(`Optimization ok. Plans=${plans.length}`);

    const planResults = await Promise.all(plans.map(async (plan) => {
      const vehicleMeta = plan.vehicle
        ? vehiclesWithGarage.find((item) => item.numericId === plan.vehicle)
        : undefined;

      const assignedStudents = new Set<string>();
      plan.steps?.forEach((step) => {
        const shipmentId = step.id ? this.resolveShipmentId(step.id, shipmentMap) : null;
        const shipment = shipmentId ? shipmentMap.get(shipmentId) : undefined;
        if (shipment?.studentId) {
          assignedStudents.add(shipment.studentId);
        }
      });

      let lastDistance = 0;
      let lastDuration = 0;
      const stops: OptimizationStop[] =
        plan.steps?.map((step, index) => {
          const rawType = step.type || 'job';
          const normalizedType =
            rawType === 'job' ? 'pickup' : (rawType as OptimizationStop['type']);
          const shipmentId = step.id ? this.resolveShipmentId(step.id, shipmentMap) : null;
          const shipment = shipmentId ? shipmentMap.get(shipmentId) : undefined;
          const label = this.buildLabel(
            normalizedType,
            shipment?.studentName,
            shipment?.schoolName
          );
          const address =
            normalizedType === 'pickup'
              ? shipment?.pickupAddress
              : normalizedType === 'delivery'
              ? shipment?.dropoffAddress
              : vehicleMeta?.garage.address;
          const coords =
            normalizedType === 'pickup'
              ? shipment?.pickupPoint
              : normalizedType === 'delivery'
              ? shipment?.dropoffPoint
              : vehicleMeta?.garage.point;
          const rawDistance = step.distance ?? null;
          const rawDuration = step.duration ?? null;
          const segmentDistance =
            rawDistance !== null && rawDistance !== undefined
              ? Math.max(0, rawDistance - lastDistance)
              : undefined;
          const segmentDuration =
            rawDuration !== null && rawDuration !== undefined
              ? Math.max(0, rawDuration - lastDuration)
              : undefined;
          if (rawDistance !== null && rawDistance !== undefined) {
            lastDistance = rawDistance;
          }
          if (rawDuration !== null && rawDuration !== undefined) {
            lastDuration = rawDuration;
          }

          return {
            sequence: index + 1,
            type: normalizedType,
            label,
            studentId: shipment?.studentId,
            studentName: shipment?.studentName,
            schoolId: shipment?.schoolId,
            schoolName: shipment?.schoolName,
            address,
            lat: coords?.lat,
            lng: coords?.lon,
            arrival:
              step.arrival !== undefined ? this.formatTime(step.arrival) : undefined,
            distanceKm:
              segmentDistance !== undefined ? segmentDistance / 1000 : undefined,
            durationMin:
              segmentDuration !== undefined ? segmentDuration / 60 : undefined,
          };
        }) ?? [];

      const directions = await this.fetchDirectionsForStops(stops, warnings);
      const stopsWithDirections = this.applyDirectionsSegments(stops, directions?.segments);
      const enriched = this.fillStopMetrics(stopsWithDirections);
      const directionsTotals = directions?.totals;

      return {
        vehicleId: vehicleMeta?.id ?? null,
        vehicleLabel: vehicleMeta?.label,
        vehicleStatus: vehicleMeta?.status,
        vehicleCapacity: vehicleMeta?.capacity,
        assignedStudents: assignedStudents.size,
        totalDistanceKm:
          directionsTotals?.distanceKm ??
          (plan.distance && plan.distance > 0 ? plan.distance / 1000 : enriched.totalDistanceKm),
        totalDurationMin:
          directionsTotals?.durationMin ??
          (plan.duration && plan.duration > 0 ? plan.duration / 60 : enriched.totalDurationMin),
        stops: enriched.stops,
        geometry: directions?.geometry,
      };
    }));

    if (response.unassigned?.length) {
      for (const item of response.unassigned) {
        const shipmentId = this.resolveShipmentId(item.id, shipmentMap);
        const shipment = shipmentId ? shipmentMap.get(shipmentId) : undefined;
        if (shipment) {
          const reason = this.describeUnassignedReason(item.reason);
          warnings.push(`Aluno ${shipment.studentName} não foi alocado (${reason}).`);
        }
      }
    }

    await this.persistStops(route.id, planResults);
    this.logger.log(`Stops persisted for ${route.id}`);

    return this.getOptimization(route.id, warnings);
  }

  async getOptimization(
    routeId: string,
    extraWarnings: string[] = []
  ): Promise<OptimizationResult> {
    const route = await this.prisma.route.findUnique({
      where: { id: routeId },
      include: { vehicle: true },
    });
    if (!route) {
      throw new NotFoundException('Rota não encontrada.');
    }

    const stops = await this.prisma.routeStop.findMany({
      where: { routeId },
      orderBy: [{ vehicleId: 'asc' }, { sequence: 'asc' }],
      include: {
        student: { include: { school: true } },
        vehicle: true,
      },
    });

    if (!stops.length) {
      return { routeId, routes: [], warnings: extraWarnings };
    }

    const grouped = new Map<string, typeof stops>();
    stops.forEach((stop) => {
      const key = stop.vehicleId ?? 'default';
      const list = grouped.get(key) ?? [];
      list.push(stop);
      grouped.set(key, list);
    });

    const routes = await Promise.all(
      Array.from(grouped.entries()).map(async ([vehicleKey, group]) => {
        const vehicle = group.find((stop) => stop.vehicle)?.vehicle ?? route.vehicle ?? null;
        const vehicleId = vehicleKey !== 'default' ? vehicleKey : vehicle?.id ?? null;
        const assigned = new Set<string>();

        const mappedStops: OptimizationStop[] = group.map((stop) => {
          const student = stop.student ?? null;
          const school = student?.school ?? null;
          const type = stop.type as OptimizationStop['type'];
          if (student?.id && type === 'pickup') {
            assigned.add(student.id);
          }

          const address =
            type === 'start' || type === 'end'
              ? this.composeGarageAddress({
                  garageStreet: vehicle?.garageStreet,
                  garageNumber: vehicle?.garageNumber,
                  garageDistrict: vehicle?.garageDistrict,
                  garageCity: vehicle?.garageCity,
                  garageState: vehicle?.garageState,
                }) || (vehicle?.garageLat && vehicle?.garageLng
                  ? this.formatLatLng({ lat: vehicle.garageLat, lon: vehicle.garageLng })
                  : undefined)
              : type === 'delivery'
              ? this.composeAddressFromParts({
                  street: school?.street,
                  number: school?.number,
                  district: school?.district,
                  city: school?.city,
                  state: school?.state,
                  cep: school?.cep,
                  fallback: school?.address,
                })
              : this.composeAddressFromParts({
                  street: student?.street,
                  number: student?.number,
                  district: student?.district,
                  city: student?.city,
                  state: student?.state,
                  cep: student?.cep,
                  fallback: student?.address,
                });

          const coords =
            type === 'start' || type === 'end'
              ? vehicle?.garageLat !== null && vehicle?.garageLat !== undefined &&
                vehicle?.garageLng !== null && vehicle?.garageLng !== undefined
                ? { lat: vehicle.garageLat, lon: vehicle.garageLng }
                : undefined
              : type === 'delivery'
              ? school?.lat !== null && school?.lat !== undefined &&
                school?.lng !== null && school?.lng !== undefined
                ? { lat: school.lat, lon: school.lng }
                : undefined
              : student?.lat !== null && student?.lat !== undefined &&
                student?.lng !== null && student?.lng !== undefined
                ? { lat: student.lat, lon: student.lng }
                : undefined;

          return {
            stopId: stop.id,
            sequence: stop.sequence,
            type,
            label: this.buildLabel(type, student?.name, school?.name),
            studentId: student?.id,
            studentName: student?.name,
            schoolId: student?.schoolId,
            schoolName: school?.name,
            address: address || undefined,
            lat: coords?.lat,
            lng: coords?.lon,
            arrival: stop.arrival ?? undefined,
            distanceKm: stop.distanceKm ?? undefined,
            durationMin: stop.durationMin ?? undefined,
          };
        });

        const directions = await this.fetchDirectionsForStops(mappedStops, extraWarnings);
        const stopsWithDirections = this.applyDirectionsSegments(
          mappedStops,
          directions?.segments
        );
        const enriched = this.fillStopMetrics(stopsWithDirections);
        const directionsTotals = directions?.totals;

        return {
          vehicleId,
          vehicleLabel: vehicle ? `${vehicle.plate} - ${vehicle.model}` : 'Veículo padrão',
          vehicleStatus: vehicle?.status ?? 'Padrao',
          vehicleCapacity: vehicle?.capacity ?? route.capacity ?? 0,
          assignedStudents: assigned.size,
          totalDistanceKm: directionsTotals?.distanceKm ?? enriched.totalDistanceKm,
          totalDurationMin: directionsTotals?.durationMin ?? enriched.totalDurationMin,
          stops: enriched.stops,
          geometry: directions?.geometry,
        };
      })
    );

    return { routeId, routes, warnings: extraWarnings };
  }

  async updateOptimization(
    routeId: string,
    payload: OptimizationUpdateRequest
  ): Promise<OptimizationResult> {
    const route = await this.prisma.route.findUnique({ where: { id: routeId } });
    if (!route) {
      throw new NotFoundException('Rota não encontrada.');
    }

    const routesPayload = payload?.routes ?? [];
    if (!routesPayload.length) {
      throw new BadRequestException('Informe a nova sequência.');
    }

    const stopIds = routesPayload.flatMap((routeItem) => routeItem.stopIds ?? []);
    if (!stopIds.length) {
      throw new BadRequestException('Nenhum stop informado.');
    }

    const existingStops = await this.prisma.routeStop.findMany({
      where: { id: { in: stopIds }, routeId },
      select: { id: true },
    });
    if (existingStops.length !== stopIds.length) {
      throw new BadRequestException('Alguns stops não foram encontrados.');
    }

    const updates = routesPayload.flatMap((routeItem) =>
      routeItem.stopIds.map((stopId, index) =>
        this.prisma.routeStop.update({
          where: { id: stopId },
          data: {
            sequence: index + 1,
            vehicleId: routeItem.vehicleId ?? null,
          },
        })
      )
    );

    await this.prisma.$transaction(updates);
    return this.getOptimization(routeId);
  }

  private async resolveGaragePoint(
    payload: OptimizationRequest,
    cache: Map<string, GeoPoint>,
    vehicle: {
      garageCep?: string | null;
      garageStreet?: string | null;
      garageNumber?: string | null;
      garageDistrict?: string | null;
      garageCity?: string | null;
      garageState?: string | null;
      garageLat?: number | null;
      garageLng?: number | null;
    }
  ): Promise<{ point: GeoPoint; address?: string }> {
    const manualAddress = payload.garageAddress?.trim();
    const composed = this.composeGarageAddress(vehicle);

    if (manualAddress) {
      return { point: await this.geocode(manualAddress, cache), address: manualAddress };
    }
    if (payload.garageLat !== undefined && payload.garageLng !== undefined) {
      const point = await this.snapPoint({
        lat: Number(payload.garageLat),
        lon: Number(payload.garageLng),
      });
      return { point, address: composed || this.formatLatLng(point) };
    }

    if (
      vehicle.garageLat !== null &&
      vehicle.garageLat !== undefined &&
      vehicle.garageLng !== null &&
      vehicle.garageLng !== undefined
    ) {
      const point = await this.snapPoint({ lat: vehicle.garageLat, lon: vehicle.garageLng });
      return { point, address: composed || this.formatLatLng(point) };
    }

    if (composed) {
      return { point: await this.geocode(composed, cache), address: composed };
    }
    if (vehicle.garageCep) {
      return { point: await this.geocode(vehicle.garageCep, cache), address: vehicle.garageCep };
    }

    throw new BadRequestException('Informe o endereço da garagem.');
  }

  private composeGarageAddress(vehicle: {
    garageCep?: string | null;
    garageStreet?: string | null;
    garageNumber?: string | null;
    garageDistrict?: string | null;
    garageCity?: string | null;
    garageState?: string | null;
  }): string {
    const street = vehicle.garageStreet?.trim() ?? '';
    const number = vehicle.garageNumber?.toString().trim() ?? '';
    const district = vehicle.garageDistrict?.trim() ?? '';
    const city = vehicle.garageCity?.trim() ?? '';
    const state = vehicle.garageState?.trim().toUpperCase() ?? '';
    if (street && number && city && state) {
      const districtPart = district ? `, ${district}` : '';
      return `${street}, ${number}${districtPart} - ${city}/${state}`;
    }
    return '';
  }

  private composeAddressFromParts(input: {
    street?: string | null;
    number?: string | null;
    district?: string | null;
    city?: string | null;
    state?: string | null;
    cep?: string | null;
    fallback?: string | null;
  }): string {
    const street = input.street?.trim() ?? '';
    const number = input.number?.toString().trim() ?? '';
    const district = input.district?.trim() ?? '';
    const city = input.city?.trim() ?? '';
    const state = input.state?.trim().toUpperCase() ?? '';
    if (street && number && city && state) {
      const districtPart = district ? `, ${district}` : '';
      return `${street}, ${number}${districtPart} - ${city}/${state}`;
    }
    if (input.fallback?.trim()) {
      return input.fallback.trim();
    }
    return input.cep?.toString().trim() ?? '';
  }

  private formatLatLng(point: GeoPoint): string {
    return `Lat/Lng ${point.lat.toFixed(6)}, ${point.lon.toFixed(6)}`;
  }

  private async geocode(
    address: string,
    cache: Map<string, GeoPoint>,
    focus?: GeoPoint
  ): Promise<GeoPoint> {
    const cached = cache.get(address);
    if (cached) {
      return cached;
    }

    const params = new URLSearchParams({
      api_key: this.orsKey,
      text: address,
      size: '1',
    });
    if (focus) {
      params.set('focus.point.lon', focus.lon.toString());
      params.set('focus.point.lat', focus.lat.toString());
    }
    if (this.orsCountry) {
      params.set('boundary.country', this.orsCountry);
    }
    const url = `${this.orsBase}/geocode/search?${params.toString()}`;
    const response = await requestJson<OrsGeocodeResponse>(url, {
      method: 'GET',
      timeoutMs: 15000,
    });

    const coords = response.features?.[0]?.geometry?.coordinates;
    if (!coords || coords.length < 2) {
      throw new BadRequestException(`Não foi possível geocodificar: ${address}`);
    }

    const point = await this.snapPoint({ lon: coords[0], lat: coords[1] });
    cache.set(address, point);
    return point;
  }

  private async resolvePoint(
    address: string,
    lat: number | null | undefined,
    lng: number | null | undefined,
    cache: Map<string, GeoPoint>,
    focus?: GeoPoint
  ): Promise<GeoPoint> {
    if (lat !== null && lat !== undefined && lng !== null && lng !== undefined) {
      return this.snapPoint({ lat, lon: lng });
    }

    return this.geocode(address, cache, focus);
  }

  private async resolvePointWithCepFallback(input: {
    label: string;
    address: string;
    cep: string | null;
    lat: number | null | undefined;
    lng: number | null | undefined;
    cache: Map<string, GeoPoint>;
    cepCache: Map<string, GeoPoint>;
    focus?: GeoPoint;
    warnings: string[];
  }): Promise<GeoPoint> {
    const { label, address, cep, lat, lng, cache, cepCache, focus, warnings } = input;
    let point: GeoPoint | null = null;

    if (lat !== null && lat !== undefined && lng !== null && lng !== undefined) {
      point = await this.snapPoint({ lat, lon: lng });
    }

    const cepPoint = await this.lookupCepPoint(cep, cepCache);
    if (cepPoint) {
      if (!point) {
        warnings.push(`Coordenadas de ${label} ajustadas pelo CEP.`);
        return cepPoint;
      }

      const drift = this.distanceMeters(point, cepPoint);
      if (drift > this.maxCepDriftMeters) {
        warnings.push(
          `Coordenadas de ${label} divergentes do CEP (±${Math.round(
            drift
          )}m). Usando CEP.`
        );
        return cepPoint;
      }
    }

    if (point) {
      return point;
    }

    return this.geocode(address, cache, focus);
  }

  private async snapPoint(point: GeoPoint): Promise<GeoPoint> {
    const url = `${this.orsBase}/v2/snap/${this.orsProfile}/json`;
    const radii = Array.from(
      new Set([this.orsSnapRadius, this.orsSnapRadius * 3, this.orsSnapRadius * 5])
    );

    for (const radius of radii) {
      try {
        const response = await requestJson<OrsSnapResponse>(url, {
          method: 'POST',
          headers: {
            Authorization: this.orsKey,
          },
          body: {
            locations: [[point.lon, point.lat]],
            radius,
          },
          timeoutMs: 15000,
        });

        const snapped = response.locations?.[0]?.location;
        if (snapped && snapped.length >= 2) {
          return { lon: snapped[0], lat: snapped[1] };
        }
      } catch (error) {
        // Ignore snapping failures and fall back to the original coordinate.
      }
    }

    return point;
  }

  private async lookupCepPoint(
    cep: string | null,
    cache: Map<string, GeoPoint>
  ): Promise<GeoPoint | null> {
    if (!cep) {
      return null;
    }
    const cleaned = cep.replace(/\D/g, '');
    if (cleaned.length !== 8) {
      return null;
    }
    const cached = cache.get(cleaned);
    if (cached) {
      return cached;
    }

    try {
      const response = await requestJson<AwesomeCepResponse>(
        `https://cep.awesomeapi.com.br/json/${cleaned}`,
        { method: 'GET', timeoutMs: 8000 }
      );
      if (!response?.lat || !response?.lng) {
        return null;
      }
      const point = await this.snapPoint({
        lat: Number(response.lat),
        lon: Number(response.lng),
      });
      cache.set(cleaned, point);
      return point;
    } catch (error) {
      return null;
    }
  }

  private async fetchDirectionsForStops(
    stops: OptimizationStop[],
    warnings: string[]
  ): Promise<{
    geometry: Array<{ lat: number; lng: number }>;
    segments: Array<{ distance?: number; duration?: number }>;
    totals: { distanceKm: number; durationMin: number };
  } | null> {
    const coords = stops
      .map((stop) =>
        stop.lat !== undefined && stop.lng !== undefined
          ? ({ lat: stop.lat, lon: stop.lng } as GeoPoint)
          : null
      )
      .filter((point): point is GeoPoint => !!point);

    if (coords.length < 2) {
      return null;
    }

    try {
      const params = new URLSearchParams({
        api_key: this.orsKey,
      });
      const response = await requestJson<OrsDirectionsResponse>(
        `${this.orsBase}/v2/directions/${this.orsProfile}?${params.toString()}`,
        {
          method: 'POST',
          body: {
            coordinates: coords.map((point) => [point.lon, point.lat]),
            instructions: false,
          },
          timeoutMs: 20000,
        }
      );

      const route = response.routes?.[0];
      const geometry = route?.geometry
        ? this.decodePolyline(route.geometry)
        : [];
      const segments = route?.segments ?? [];
      const summary = route?.summary;
      const totals =
        summary && summary.distance !== undefined && summary.duration !== undefined
          ? {
              distanceKm: summary.distance / 1000,
              durationMin: summary.duration / 60,
            }
          : segments.reduce(
              (acc, segment) => {
                acc.distanceKm += (segment.distance ?? 0) / 1000;
                acc.durationMin += (segment.duration ?? 0) / 60;
                return acc;
              },
              { distanceKm: 0, durationMin: 0 }
            );

      return { geometry, segments, totals };
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      this.logger.warn(`Falha ao buscar geometria da rota. ${message}`);
      if (message) {
        warnings.push(`Falha ao buscar geometria da rota: ${message}`);
      } else {
        warnings.push('Falha ao buscar geometria da rota.');
      }
      return null;
    }
  }

  private decodePolyline(encoded: string): Array<{ lat: number; lng: number }> {
    const decode = (precision: number) => {
      let index = 0;
      let lat = 0;
      let lng = 0;
      const coordinates: Array<{ lat: number; lng: number }> = [];
      const factor = Math.pow(10, precision);

      while (index < encoded.length) {
        let result = 0;
        let shift = 0;
        let byte: number;

        do {
          byte = encoded.charCodeAt(index++) - 63;
          result |= (byte & 0x1f) << shift;
          shift += 5;
        } while (byte >= 0x20);

        const deltaLat = (result & 1) ? ~(result >> 1) : result >> 1;
        lat += deltaLat;

        result = 0;
        shift = 0;

        do {
          byte = encoded.charCodeAt(index++) - 63;
          result |= (byte & 0x1f) << shift;
          shift += 5;
        } while (byte >= 0x20);

        const deltaLng = (result & 1) ? ~(result >> 1) : result >> 1;
        lng += deltaLng;

        coordinates.push({ lat: lat / factor, lng: lng / factor });
      }

      return coordinates;
    };

    const decoded5 = decode(5);
    const outOfRange = decoded5.some(
      (point) => Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180
    );
    if (outOfRange) {
      return decode(6);
    }
    return decoded5;
  }

  private applyDirectionsSegments(
    stops: OptimizationStop[],
    segments?: Array<{ distance?: number; duration?: number }>
  ): OptimizationStop[] {
    if (!segments?.length || stops.length < 2) {
      return stops;
    }

    return stops.map((stop, index) => {
      if (index === 0) {
        return stop;
      }
      const segment = segments[index - 1];
      if (!segment) {
        return stop;
      }
      return {
        ...stop,
        distanceKm:
          segment.distance !== undefined ? segment.distance / 1000 : stop.distanceKm,
        durationMin:
          segment.duration !== undefined ? segment.duration / 60 : stop.durationMin,
      };
    });
  }

  private async filterShipmentsByReachability(
    garage: GeoPoint,
    shipments: Array<{
      id: number;
      pickup: { id: number; location: [number, number]; service: number };
      delivery: {
        id: number;
        location: [number, number];
        service: number;
        time_windows?: [number, number][];
      };
      amount: [number];
    }>,
    shipmentMap: Map<number, { studentId: string; studentName: string; schoolId: string; schoolName: string }>,
    warnings: string[]
  ): Promise<{
    shipments: Array<{
      id: number;
      pickup: { id: number; location: [number, number]; service: number };
      delivery: {
        id: number;
        location: [number, number];
        service: number;
        time_windows?: [number, number][];
      };
      amount: [number];
    }>;
    shipmentMap: Map<number, { studentId: string; studentName: string; schoolId: string; schoolName: string }>;
  }> {
    this.logger.log(
      `Reachability: garage=${garage.lat},${garage.lon} shipments=${shipments.length}`
    );
    const points: Array<{
      shipmentId: number;
      location: [number, number];
    }> = [];

    shipments.forEach((shipment) => {
      points.push({ shipmentId: shipment.id, location: shipment.pickup.location });
      points.push({ shipmentId: shipment.id, location: shipment.delivery.location });
    });

    if (!points.length) {
      return { shipments, shipmentMap };
    }

    const maxBatch = Math.max(1, this.orsMatrixMax - 1);
    const unreachable = new Set<number>();
    this.logger.log(
      `Reachability: points=${points.length} batches=${Math.ceil(points.length / maxBatch)}`
    );

    for (let i = 0; i < points.length; i += maxBatch) {
      const batch = points.slice(i, i + maxBatch);
      const locations: [number, number][] = [
        [garage.lon, garage.lat],
        ...batch.map((point) => point.location),
      ];
      const destinations = Array.from({ length: batch.length }, (_, idx) => idx + 1);

      try {
        const response = await requestJson<OrsMatrixResponse>(
          `${this.orsBase}/v2/matrix/${this.orsProfile}`,
          {
            method: 'POST',
            headers: {
              Authorization: this.orsKey,
            },
            body: {
              locations,
              sources: [0],
              destinations,
              metrics: ['duration'],
            },
            timeoutMs: 20000,
          }
        );

        const durations = response.durations?.[0];
        if (!durations || durations.length !== destinations.length) {
          continue;
        }

        durations.forEach((duration, index) => {
          if (duration === null || duration === undefined || Number.isNaN(duration) || duration < 0) {
            const shipmentId = batch[index].shipmentId;
            unreachable.add(shipmentId);
            const info = shipmentMap.get(shipmentId);
            const point = batch[index].location;
            this.logger.warn(
              `Unreachable ${info?.studentName ?? shipmentId} at ${point[1]},${point[0]}`
            );
          }
        });
      } catch (error: any) {
        const message = error?.message ?? '';
        if (message.includes('Unfound route')) {
          throw new BadRequestException(
            'Garagem ou endereços fora da malha viária. Revise o endereço/lat-lng.'
          );
        }
        warnings.push('Falha ao validar alcance com a matriz ORS.');
        return { shipments, shipmentMap };
      }
    }

    if (!unreachable.size) {
      return { shipments, shipmentMap };
    }

    this.logger.warn(`Unreachable shipments: ${unreachable.size}`);

    const nextShipments = shipments.filter((shipment) => !unreachable.has(shipment.id));
    const nextMap = new Map(shipmentMap);
    for (const id of unreachable) {
      const info = shipmentMap.get(id);
      if (info) {
        warnings.push(`Aluno ${info.studentName} fora da malha viaria. Ignorado.`);
      }
      nextMap.delete(id);
    }

    return { shipments: nextShipments, shipmentMap: nextMap };
  }

  private parseWindowToSeconds(window?: string | null): [number, number] | null {
    if (!window) {
      return null;
    }

    const match = window.match(/(\d{1,2}:\d{2}).*?(\d{1,2}:\d{2})/);
    if (!match) {
      return null;
    }

    const start = this.parseTimeToSeconds(match[1]);
    const end = this.parseTimeToSeconds(match[2]);
    if (start === null || end === null) {
      return null;
    }

    return [start, end];
  }

  private parseTimeToSeconds(value: string): number | null {
    const trimmed = value?.trim();
    if (!trimmed) {
      return null;
    }

    const [rawHour, rawMinute] = trimmed.split(':');
    const hour = Number(rawHour);
    const minute = Number(rawMinute);
    if (Number.isNaN(hour) || Number.isNaN(minute)) {
      return null;
    }

    return hour * 3600 + minute * 60;
  }

  private formatTime(seconds: number): string {
    const total = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(total / 3600) % 24;
    const minutes = Math.floor((total % 3600) / 60);
    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}`;
  }

  private buildLabel(
    type: OptimizationStop['type'],
    studentName?: string,
    schoolName?: string
  ): string {
    if (type === 'start') {
      return 'Garagem (saida)';
    }
    if (type === 'end') {
      return 'Garagem (retorno)';
    }
    if (type === 'delivery') {
      return schoolName ? `Entrega na ${schoolName}` : 'Entrega';
    }
    return studentName ? `Coleta de ${studentName}` : 'Coleta';
  }

  private fillStopMetrics(stops: OptimizationStop[]): {
    stops: OptimizationStop[];
    totalDistanceKm: number;
    totalDurationMin: number;
  } {
    if (!stops.length) {
      return { stops, totalDistanceKm: 0, totalDurationMin: 0 };
    }

    const avgSpeedKmh = Number(process.env.AVG_SPEED_KMH) || 30;
    const avgSpeedMps = avgSpeedKmh > 0 ? (avgSpeedKmh * 1000) / 3600 : 0;
    let totalDistanceKm = 0;
    let totalDurationMin = 0;

    const nextStops = stops.map((stop, index) => {
      if (index === 0) {
        if (stop.distanceKm !== undefined) {
          totalDistanceKm += stop.distanceKm;
        }
        if (stop.durationMin !== undefined) {
          totalDurationMin += stop.durationMin;
        }
        return stop;
      }

      let distanceKm = stop.distanceKm;
      let durationMin = stop.durationMin;
      const prev = stops[index - 1];

      if (
        distanceKm === undefined &&
        prev.lat !== undefined &&
        prev.lng !== undefined &&
        stop.lat !== undefined &&
        stop.lng !== undefined
      ) {
        const distanceMeters = this.distanceMeters(
          { lat: prev.lat, lon: prev.lng },
          { lat: stop.lat, lon: stop.lng }
        );
        if (Number.isFinite(distanceMeters)) {
          distanceKm = distanceMeters / 1000;
        }
      }

      if (durationMin === undefined && distanceKm !== undefined && avgSpeedMps > 0) {
        const durationSec = (distanceKm * 1000) / avgSpeedMps;
        durationMin = durationSec / 60;
      }

      if (distanceKm !== undefined) {
        totalDistanceKm += distanceKm;
      }
      if (durationMin !== undefined) {
        totalDurationMin += durationMin;
      }

      return { ...stop, distanceKm, durationMin };
    });

    return { stops: nextStops, totalDistanceKm, totalDurationMin };
  }

  private distanceMeters(a: GeoPoint, b: GeoPoint): number {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const sinDLat = Math.sin(dLat / 2);
    const sinDLon = Math.sin(dLon / 2);
    const h =
      sinDLat * sinDLat +
      Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
    const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    return 6371000 * c;
  }

  private resolveShipmentId(
    rawId: number,
    shipmentMap: Map<number, { studentId: string }>
  ): number | null {
    if (shipmentMap.has(rawId)) {
      return rawId;
    }
    if (rawId >= 10) {
      const candidate = Math.floor(rawId / 10);
      if (shipmentMap.has(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  private describeUnassignedReason(reason?: number): string {
    if (reason === undefined || reason === null) {
      return 'motivo desconhecido';
    }
    const map: Record<number, string> = {
      1: 'capacidade insuficiente',
      2: 'janela de tempo',
      3: 'distancia maxima',
      4: 'duracao maxima',
      5: 'restricao',
    };
    return map[reason] ?? `motivo ${reason}`;
  }

  private async resolveVehicles(
    routeId: string,
    vehicleIds: string[] | undefined,
    fallbackCapacity: number
  ): Promise<
    Array<{
      id: string | null;
      label?: string;
      numericId: number;
      capacity: number;
      status?: string;
      garageCep?: string | null;
      garageStreet?: string | null;
      garageNumber?: string | null;
      garageDistrict?: string | null;
      garageCity?: string | null;
      garageState?: string | null;
      garageLat?: number | null;
      garageLng?: number | null;
    }>
  > {
    if (vehicleIds && vehicleIds.length) {
      const vehicles = await this.prisma.vehicle.findMany({
        where: { id: { in: vehicleIds } },
      });
      if (!vehicles.length) {
      throw new BadRequestException('Selecione ao menos um veículo válido.');
      }

      return vehicles.map((vehicle, index) => ({
        id: vehicle.id,
        label: `${vehicle.plate} - ${vehicle.model}`,
        numericId: index + 1,
        capacity: vehicle.capacity || fallbackCapacity,
        status: vehicle.status ?? '',
        garageCep: vehicle.garageCep ?? null,
        garageStreet: vehicle.garageStreet ?? null,
        garageNumber: vehicle.garageNumber ?? null,
        garageDistrict: vehicle.garageDistrict ?? null,
        garageCity: vehicle.garageCity ?? null,
        garageState: vehicle.garageState ?? null,
        garageLat: vehicle.garageLat ?? null,
        garageLng: vehicle.garageLng ?? null,
      }));
    }

    const route = await this.prisma.route.findUnique({
      where: { id: routeId },
      include: { vehicle: true },
    });

    if (route?.vehicle) {
      return [
        {
          id: route.vehicle.id,
          label: `${route.vehicle.plate} - ${route.vehicle.model}`,
          numericId: 1,
          capacity: route.vehicle.capacity || fallbackCapacity,
          status: route.vehicle.status ?? '',
          garageCep: route.vehicle.garageCep ?? null,
          garageStreet: route.vehicle.garageStreet ?? null,
          garageNumber: route.vehicle.garageNumber ?? null,
          garageDistrict: route.vehicle.garageDistrict ?? null,
          garageCity: route.vehicle.garageCity ?? null,
          garageState: route.vehicle.garageState ?? null,
          garageLat: route.vehicle.garageLat ?? null,
          garageLng: route.vehicle.garageLng ?? null,
        },
      ];
    }

      return [
        {
          id: null,
          label: 'Veículo padrão',
          numericId: 1,
          capacity: fallbackCapacity,
          status: 'Padrao',
          garageCep: null,
          garageStreet: null,
          garageNumber: null,
          garageDistrict: null,
          garageCity: null,
          garageState: null,
          garageLat: null,
          garageLng: null,
      },
    ];
  }

  private async persistStops(
    routeId: string,
    routes: Array<{
      vehicleId?: string | null;
      stops: OptimizationStop[];
    }>
  ): Promise<void> {
    const entries = routes.flatMap((route) =>
      route.stops.map((stop) => ({
        routeId,
        studentId: stop.studentId ?? null,
        vehicleId: route.vehicleId ?? null,
        type: stop.type,
        sequence: stop.sequence,
        arrival: stop.arrival ?? null,
        distanceKm: stop.distanceKm ?? null,
        durationMin: stop.durationMin ?? null,
      }))
    );

    await this.prisma.$transaction([
      this.prisma.routeStop.deleteMany({ where: { routeId } }),
      ...(entries.length
        ? [this.prisma.routeStop.createMany({ data: entries })]
        : []),
    ]);
  }
}
