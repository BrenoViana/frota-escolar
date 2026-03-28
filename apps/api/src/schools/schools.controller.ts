import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { SchoolsService } from './schools.service';
import { SchoolDetail, SchoolFormData, SchoolSummary } from './schools.types';

@Controller('schools')
export class SchoolsController {
  constructor(private readonly schoolsService: SchoolsService) {}

  @Get()
  list(): Promise<SchoolSummary[]> {
    return this.schoolsService.list();
  }

  @Get(':id')
  getById(@Param('id') id: string): Promise<SchoolDetail> {
    return this.schoolsService.getById(id);
  }

  @Post()
  create(@Body() payload: SchoolFormData): Promise<SchoolDetail> {
    return this.schoolsService.create(payload);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() payload: SchoolFormData): Promise<SchoolDetail> {
    return this.schoolsService.update(id, payload);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<void> {
    return this.schoolsService.remove(id);
  }
}
