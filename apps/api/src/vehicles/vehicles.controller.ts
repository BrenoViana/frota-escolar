import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import { VehicleDetail, VehicleFormData, VehicleSummary } from './vehicles.types';

@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get()
  list(): Promise<VehicleSummary[]> {
    return this.vehiclesService.list();
  }

  @Get(':id')
  getById(@Param('id') id: string): Promise<VehicleDetail> {
    return this.vehiclesService.getById(id);
  }

  @Post()
  create(@Body() payload: VehicleFormData): Promise<VehicleDetail> {
    return this.vehiclesService.create(payload);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() payload: VehicleFormData): Promise<VehicleDetail> {
    return this.vehiclesService.update(id, payload);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<void> {
    return this.vehiclesService.remove(id);
  }
}
