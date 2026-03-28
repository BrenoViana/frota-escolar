import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async reset(): Promise<{
    stops: number;
    students: number;
    routes: number;
    vehicles: number;
    schools: number;
  }> {
    return this.prisma.$transaction(async (tx) => {
      const [stopsCount, studentsCount, routesCount, vehiclesCount, schoolsCount] =
        await Promise.all([
          tx.routeStop.count(),
          tx.student.count(),
          tx.route.count(),
          tx.vehicle.count(),
          tx.school.count(),
        ]);

      try {
        await tx.$executeRawUnsafe(
          'TRUNCATE TABLE "RouteStop", "Student", "Route", "Vehicle", "School" RESTART IDENTITY CASCADE;'
        );
      } catch (error) {
        await tx.routeStop.deleteMany();
        await tx.student.deleteMany();
        await tx.route.deleteMany();
        await tx.vehicle.deleteMany();
        await tx.school.deleteMany();
      }

      return {
        stops: stopsCount,
        students: studentsCount,
        routes: routesCount,
        vehicles: vehiclesCount,
        schools: schoolsCount,
      };
    });
  }
}
