import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { DashboardModule } from './dashboard/dashboard.module';
import { PrismaModule } from './database/prisma.module';
import { OptimizationsModule } from './optimizations/optimizations.module';
import { GeoModule } from './geo/geo.module';
import { RoutesModule } from './routes/routes.module';
import { SchoolsModule } from './schools/schools.module';
import { StudentsModule } from './students/students.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    PrismaModule,
    DashboardModule,
    SchoolsModule,
    StudentsModule,
    RoutesModule,
    VehiclesModule,
    OptimizationsModule,
    GeoModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
