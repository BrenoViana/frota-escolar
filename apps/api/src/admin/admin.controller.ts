import { Controller, Post } from '@nestjs/common';
import { AdminService } from './admin.service';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('reset')
  reset(): Promise<{
    stops: number;
    students: number;
    routes: number;
    vehicles: number;
    schools: number;
  }> {
    return this.adminService.reset();
  }
}
