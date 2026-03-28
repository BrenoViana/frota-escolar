import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { OptimizationsService } from './optimizations.service';
import {
  OptimizationRequest,
  OptimizationResult,
  OptimizationUpdateRequest,
} from './optimizations.types';

@Controller()
export class OptimizationsController {
  constructor(private readonly optimizationsService: OptimizationsService) {}

  @Post('routes/:id/optimize')
  optimizeRoute(
    @Param('id') id: string,
    @Body() body: OptimizationRequest
  ): Promise<OptimizationResult> {
    return this.optimizationsService.optimizeRoute(id, body);
  }

  @Get('routes/:id/optimization')
  getOptimization(@Param('id') id: string): Promise<OptimizationResult> {
    return this.optimizationsService.getOptimization(id);
  }

  @Put('routes/:id/optimization')
  updateOptimization(
    @Param('id') id: string,
    @Body() body: OptimizationUpdateRequest
  ): Promise<OptimizationResult> {
    return this.optimizationsService.updateOptimization(id, body);
  }
}
