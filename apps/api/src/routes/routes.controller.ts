import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { RoutesService } from './routes.service';
import { RouteDetail, RouteFormData, RouteSummary } from './routes.types';

@Controller('routes')
export class RoutesController {
  constructor(private readonly routesService: RoutesService) {}

  @Get()
  list(@Query('schoolId') schoolId?: string): Promise<RouteSummary[]> {
    return this.routesService.list(schoolId);
  }

  @Get(':id')
  getById(@Param('id') id: string): Promise<RouteDetail> {
    return this.routesService.getById(id);
  }

  @Post()
  create(@Body() payload: RouteFormData): Promise<RouteDetail> {
    return this.routesService.create(payload);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() payload: RouteFormData): Promise<RouteDetail> {
    return this.routesService.update(id, payload);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<void> {
    return this.routesService.remove(id);
  }
}
