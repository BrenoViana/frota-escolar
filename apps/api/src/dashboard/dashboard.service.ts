import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export type DashboardMetrics = {
  totalSchools: number;
  totalStudents: number;
  activeRoutes: number;
  occupancyRate: number;
  studentsPerSchool: number;
  activeVehicles: number;
};

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async metrics(): Promise<DashboardMetrics> {
    const [totalSchools, totalStudents, activeRoutes, activeVehicles] = await Promise.all([
      this.prisma.school.count(),
      this.prisma.student.count(),
      this.prisma.route.count({
        where: { status: { equals: 'Ativa', mode: 'insensitive' } },
      }),
      this.prisma.vehicle.count({
        where: { status: { equals: 'Ativo', mode: 'insensitive' } },
      }),
    ]);

    const capacityAgg = await this.prisma.school.aggregate({
      _sum: { capacity: true, students: true },
    });
    const totalCapacity = capacityAgg._sum.capacity ?? 0;
    const totalEnrolled = capacityAgg._sum.students ?? 0;
    const occupancyRate = totalCapacity > 0 ? totalEnrolled / totalCapacity : 0;
    const studentsPerSchool = totalSchools > 0 ? totalStudents / totalSchools : 0;

    return {
      totalSchools,
      totalStudents,
      activeRoutes,
      occupancyRate,
      studentsPerSchool,
      activeVehicles,
    };
  }
}
