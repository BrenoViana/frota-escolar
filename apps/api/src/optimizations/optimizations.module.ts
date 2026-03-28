import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { OptimizationsController } from './optimizations.controller';
import { OptimizationsService } from './optimizations.service';

@Module({
  imports: [PrismaModule],
  controllers: [OptimizationsController],
  providers: [OptimizationsService],
})
export class OptimizationsModule {}
