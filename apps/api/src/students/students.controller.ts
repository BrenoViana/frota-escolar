import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { StudentsService } from './students.service';
import {
  StudentDetail,
  StudentFormData,
  StudentImportPayload,
  StudentImportResult,
  StudentSummary,
} from './students.types';

@Controller('students')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get()
  list(): Promise<StudentSummary[]> {
    return this.studentsService.list();
  }

  @Get(':id')
  getById(@Param('id') id: string): Promise<StudentDetail> {
    return this.studentsService.getById(id);
  }

  @Post()
  create(@Body() payload: StudentFormData): Promise<StudentDetail> {
    return this.studentsService.create(payload);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() payload: StudentFormData): Promise<StudentDetail> {
    return this.studentsService.update(id, payload);
  }

  @Post('import')
  import(@Body() payload: StudentImportPayload): Promise<StudentImportResult> {
    return this.studentsService.import(payload);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<void> {
    return this.studentsService.remove(id);
  }
}
