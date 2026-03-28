import { Controller, Get, Param, Post, Query, Body } from '@nestjs/common';
import { GeoService } from './geo.service';
import { GeoForwardRequest, GeoLookupResult } from './geo.types';

@Controller('geo')
export class GeoController {
  constructor(private readonly geoService: GeoService) {}

  @Get('cep/:cep')
  async lookupCep(
    @Param('cep') cep: string,
    @Query('number') number?: string
  ): Promise<GeoLookupResult> {
    return this.geoService.lookupCep(cep, number);
  }

  @Post('forward')
  async forward(@Body() payload: GeoForwardRequest): Promise<GeoLookupResult> {
    return this.geoService.forwardGeocode(payload);
  }

  @Get('reverse')
  async reverse(
    @Query('lat') lat: string,
    @Query('lng') lng: string
  ): Promise<GeoLookupResult> {
    return this.geoService.reverseGeocode(Number(lat), Number(lng));
  }
}
