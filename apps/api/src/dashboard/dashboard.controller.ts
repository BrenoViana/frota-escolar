import { Controller, Get } from '@nestjs/common';
import { DashboardService, DashboardMetrics } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('metrics')
  metrics(): Promise<DashboardMetrics> {
    return this.dashboardService.metrics();
  }
}
