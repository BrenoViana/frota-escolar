import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { requestJson } from '../shared/http';
import { GeoForwardRequest, GeoLookupResult } from './geo.types';

type OrsGeocodeFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    postalcode?: string;
    street?: string;
    name?: string;
    housenumber?: string;
    neighbourhood?: string;
    neighborhood?: string;
    locality?: string;
    localadmin?: string;
    county?: string;
    region?: string;
    region_a?: string;
  };
};

type OrsGeocodeResponse = {
  features?: OrsGeocodeFeature[];
};

type ViaCepResponse = {
  cep?: string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
};

type NominatimResponseItem = {
  lat?: string;
  lon?: string;
  address?: {
    road?: string;
    neighbourhood?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    postcode?: string;
    house_number?: string;
  };
};

type AwesomeCepResponse = {
  cep?: string;
  address?: string;
  address_name?: string;
  district?: string;
  city?: string;
  state?: string;
  lat?: string;
  lng?: string;
};

@Injectable()
export class GeoService {
  private readonly logger = new Logger(GeoService.name);
  private readonly orsKey = process.env.ORS_API_KEY ?? '';
  private readonly orsBase = (process.env.ORS_BASE_URL ?? 'https://api.openrouteservice.org')
    .replace(/\/$/, '');
  private readonly orsCountry = (process.env.ORS_COUNTRY ?? 'BR').trim();
  private readonly nominatimBase = (process.env.NOMINATIM_BASE_URL ?? 'https://nominatim.openstreetmap.org')
    .replace(/\/$/, '');

  async lookupCep(cep: string, number?: string): Promise<GeoLookupResult> {
    const cleaned = this.normalizeCep(cep);
    if (!cleaned) {
      throw new BadRequestException('CEP inválido.');
    }

    this.logger.log(`Lookup CEP ${cleaned} ${number ? `num ${number}` : ''}`.trim());
    const viaCep = await requestJson<ViaCepResponse>(
      `https://viacep.com.br/ws/${cleaned}/json/`,
      { method: 'GET', timeoutMs: 8000 }
    );

    if (viaCep.erro) {
      throw new BadRequestException('CEP não encontrado.');
    }

    const street = viaCep.logradouro?.trim() ?? '';
    const district = viaCep.bairro?.trim() ?? '';
    const city = viaCep.localidade?.trim() ?? '';
    const state = viaCep.uf?.trim().toUpperCase() ?? '';
    const trimmedNumber = number?.toString().trim() ?? '';

    if (trimmedNumber && city && state) {
      const districtPart = district ? `, ${district}` : '';
      const baseAddress = street
        ? `${street}, ${trimmedNumber}${districtPart} - ${city}/${state}`
        : `${district}${district ? ', ' : ''}${trimmedNumber} - ${city}/${state}`;
      const text = cleaned ? `${baseAddress}, ${cleaned}` : baseAddress;

      try {
        this.ensureOrsKey();
        const feature = await this.searchGeocode(text);
        const geo = this.featureToResult(feature, {
          street,
          district,
          number: trimmedNumber,
          city,
          state,
          cep: cleaned,
        });

        if (this.isLowPrecisionFeature(feature, { street, number: trimmedNumber })) {
          const awesome = await this.lookupAwesomeCep(cleaned);
          if (awesome) {
            this.logger.log(`AwesomeAPI fallback ok for CEP ${cleaned}`);
            return {
              ...geo,
              lat: awesome.lat ?? geo.lat,
              lng: awesome.lng ?? geo.lng,
              street: geo.street ?? awesome.street ?? street ?? null,
              district: geo.district ?? awesome.district ?? district ?? null,
              city: geo.city ?? awesome.city ?? city ?? null,
              state: geo.state ?? awesome.state ?? state ?? null,
              cep: geo.cep ?? awesome.cep ?? cleaned,
              number: geo.number ?? trimmedNumber ?? null,
            };
          }

          const nominatim = await this.searchNominatim(text);
          if (nominatim) {
            this.logger.log(`Nominatim fallback ok for CEP ${cleaned}`);
            return {
              ...nominatim,
              cep: nominatim.cep ?? cleaned,
              street: nominatim.street ?? street ?? null,
              district: nominatim.district ?? district ?? null,
              number: nominatim.number ?? trimmedNumber ?? null,
              city: nominatim.city ?? city ?? null,
              state: nominatim.state ?? state ?? null,
            };
          }
        }

        this.logger.log(`ORS geocode ok for CEP ${cleaned} -> ${geo.street ?? 'sem rua'}`);
        return {
          ...geo,
          cep: geo.cep ?? cleaned,
          street: street || geo.street || null,
          district: district || geo.district || null,
          number: geo.number ?? trimmedNumber,
          city: city || geo.city || null,
          state: state || geo.state || null,
        };
      } catch (error) {
        this.logger.warn(`ORS geocode falhou para CEP ${cleaned}. Usando ViaCEP.`);
        const awesome = await this.lookupAwesomeCep(cleaned);
        if (awesome) {
          this.logger.log(`AwesomeAPI fallback ok for CEP ${cleaned}`);
          return {
            ...awesome,
            cep: awesome.cep ?? cleaned,
            street: awesome.street ?? street ?? null,
            district: awesome.district ?? district ?? null,
            number: trimmedNumber || awesome.number || null,
            city: awesome.city ?? city ?? null,
            state: awesome.state ?? state ?? null,
          };
        }
        const nominatim = await this.searchNominatim(text);
        if (nominatim) {
          this.logger.log(`Nominatim fallback ok for CEP ${cleaned}`);
          return {
            ...nominatim,
            cep: nominatim.cep ?? cleaned,
            street: nominatim.street ?? street ?? null,
            district: nominatim.district ?? district ?? null,
            number: nominatim.number ?? trimmedNumber ?? null,
            city: nominatim.city ?? city ?? null,
            state: nominatim.state ?? state ?? null,
          };
        }
        // Fallback: return ViaCEP data without lat/lng if ORS fails.
        return {
          cep: cleaned,
          street: street || null,
          district: district || null,
          number: trimmedNumber || null,
          city: city || null,
          state: state || null,
        };
      }
    }

    return {
      cep: cleaned,
      street: street || null,
      district: district || null,
      number: trimmedNumber || null,
      city: city || null,
      state: state || null,
    };
  }

  async forwardGeocode(payload: GeoForwardRequest): Promise<GeoLookupResult> {
    this.ensureOrsKey();
    const street = payload.street?.trim() ?? '';
    const district = payload.district?.trim() ?? '';
    const number = payload.number?.toString().trim() ?? '';
    const city = payload.city?.trim() ?? '';
    const state = payload.state?.trim().toUpperCase() ?? '';
    const cep = this.normalizeCep(payload.cep ?? '');

    if (!street || !number || !city || !state) {
      throw new BadRequestException('Informe rua, numero, cidade e UF para localizar.');
    }

    const districtPart = district ? `, ${district}` : '';
    const address = `${street}, ${number}${districtPart} - ${city}/${state}${cep ? `, ${cep}` : ''}`;
    this.logger.log(`Forward geocode: ${address}`);
    const feature = await this.searchGeocode(address);
    const geo = this.featureToResult(feature, { street, number, city, state, cep });
    if (this.isLowPrecisionFeature(feature, { street, number })) {
      if (cep) {
        const awesome = await this.lookupAwesomeCep(cep);
        if (awesome) {
          this.logger.log(`AwesomeAPI fallback ok for address ${street}`);
          return {
            ...geo,
            lat: awesome.lat ?? geo.lat,
            lng: awesome.lng ?? geo.lng,
            cep: geo.cep ?? awesome.cep ?? cep ?? null,
            street: geo.street ?? awesome.street ?? street ?? null,
            district: geo.district ?? awesome.district ?? district ?? null,
            number: geo.number ?? number ?? null,
            city: geo.city ?? awesome.city ?? city ?? null,
            state: geo.state ?? awesome.state ?? state ?? null,
          };
        }
      }

      const nominatim = await this.searchNominatim(address);
      if (nominatim) {
        this.logger.log(`Nominatim fallback ok for address ${street}`);
        return {
          ...nominatim,
          cep: nominatim.cep ?? cep ?? null,
          street: nominatim.street ?? street ?? null,
          district: nominatim.district ?? district ?? null,
          number: nominatim.number ?? number ?? null,
          city: nominatim.city ?? city ?? null,
          state: nominatim.state ?? state ?? null,
        };
      }
    }
    return geo;
  }

  async reverseGeocode(lat: number, lng: number): Promise<GeoLookupResult> {
    this.ensureOrsKey();
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new BadRequestException('Lat/Lng inválidos.');
    }

    this.logger.log(`Reverse geocode: ${lat}, ${lng}`);
    const params = new URLSearchParams({
      api_key: this.orsKey,
      'point.lat': lat.toString(),
      'point.lon': lng.toString(),
      size: '1',
    });
    if (this.orsCountry) {
      params.set('boundary.country', this.orsCountry);
    }

    const url = `${this.orsBase}/geocode/reverse?${params.toString()}`;
    const response = await requestJson<OrsGeocodeResponse>(url, {
      method: 'GET',
      timeoutMs: 15000,
    });

    const feature = response.features?.[0];
    if (!feature) {
      throw new BadRequestException('Não foi possível localizar o endereço.');
    }

    return this.featureToResult(feature, {});
  }

  private async searchGeocode(address: string): Promise<OrsGeocodeFeature> {
    const params = new URLSearchParams({
      api_key: this.orsKey,
      text: address,
      size: '1',
    });
    if (this.orsCountry) {
      params.set('boundary.country', this.orsCountry);
    }
    params.set('layers', 'address,street');

    const url = `${this.orsBase}/geocode/search?${params.toString()}`;
    const response = await requestJson<OrsGeocodeResponse>(url, {
      method: 'GET',
      timeoutMs: 15000,
    });

    const feature = response.features?.[0];
    if (!feature) {
      throw new BadRequestException('Não foi possível localizar o endereço.');
    }

    return feature;
  }

  private async searchNominatim(address: string): Promise<GeoLookupResult | null> {
    const params = new URLSearchParams({
      format: 'json',
      addressdetails: '1',
      limit: '1',
      q: address,
      countrycodes: 'br',
    });
    const url = `${this.nominatimBase}/search?${params.toString()}`;
    const response = await requestJson<NominatimResponseItem[]>(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'frota-escolar/1.0',
      },
      timeoutMs: 12000,
    });

    const item = response?.[0];
    if (!item?.lat || !item?.lon) {
      return null;
    }

    const addressInfo = item.address ?? {};
    const cep = this.normalizeCep(addressInfo.postcode ?? '');
    const city =
      addressInfo.city ?? addressInfo.town ?? addressInfo.village ?? '';
    const district = addressInfo.neighbourhood ?? addressInfo.suburb ?? '';

    return {
      cep: cep || null,
      street: addressInfo.road ?? null,
      district: district || null,
      number: addressInfo.house_number ?? null,
      city: city || null,
      state: addressInfo.state ?? null,
      lat: Number(item.lat),
      lng: Number(item.lon),
    };
  }

  private async lookupAwesomeCep(cep: string): Promise<GeoLookupResult | null> {
    const cleaned = this.normalizeCep(cep);
    if (!cleaned) {
      return null;
    }

    try {
      const response = await requestJson<AwesomeCepResponse>(
        `https://cep.awesomeapi.com.br/json/${cleaned}`,
        { method: 'GET', timeoutMs: 8000 }
      );
      if (!response?.lat || !response?.lng) {
        return null;
      }

      const street = response.address ?? response.address_name ?? '';
      return {
        cep: cleaned,
        street: street || null,
        district: response.district?.trim() ?? null,
        number: null,
        city: response.city?.trim() ?? null,
        state: response.state?.trim().toUpperCase() ?? null,
        lat: Number(response.lat),
        lng: Number(response.lng),
      };
    } catch (error) {
      return null;
    }
  }

  private featureToResult(
    feature: OrsGeocodeFeature,
    fallback: {
      street?: string;
      district?: string;
      number?: string;
      city?: string;
      state?: string;
      cep?: string;
    }
  ): GeoLookupResult {
    const coords = feature.geometry?.coordinates;
    if (!coords || coords.length < 2) {
      throw new BadRequestException('Não foi possível localizar o endereço.');
    }

    const props = feature.properties ?? {};
    const cep = this.normalizeCep(props.postalcode ?? fallback.cep ?? '');
    const rawStreet = (props.street ?? props.name ?? '').trim();
    const regionCode = (props.region_a ?? '').trim();
    const regionName = (props.region ?? '').trim();
    const locality = (props.locality ?? props.localadmin ?? props.county ?? '').trim();
    const normalizedStreet = rawStreet.toLowerCase();
    const isSameRegion =
      normalizedStreet !== '' &&
      (normalizedStreet === regionCode.toLowerCase() ||
        normalizedStreet === regionName.toLowerCase());
    const isSameLocality =
      normalizedStreet !== '' && normalizedStreet === locality.toLowerCase();
    const streetCandidate =
      rawStreet && !isSameRegion && !isSameLocality ? rawStreet : '';
    const street = streetCandidate || fallback.street || '';
    const number = props.housenumber ?? fallback.number ?? '';
    const city =
      props.locality ?? props.localadmin ?? props.county ?? fallback.city ?? '';
    const state = props.region_a ?? props.region ?? fallback.state ?? '';
    const districtRaw =
      props.neighbourhood ?? props.neighborhood ?? fallback.district ?? '';
    const district =
      districtRaw && districtRaw !== city && districtRaw !== state ? districtRaw : '';

    return {
      cep: cep || null,
      street: street || null,
      district: district || null,
      number: number || null,
      city: city || null,
      state: state || null,
      lat: coords[1],
      lng: coords[0],
    };
  }

  private isLowPrecisionFeature(
    feature: OrsGeocodeFeature,
    expected: { street?: string; number?: string }
  ): boolean {
    const props = feature.properties ?? {};
    const hasStreet = !!props.street || !!props.name;
    const hasNumber = !!props.housenumber;
    if (expected.street && !hasStreet) {
      return true;
    }
    if (expected.number && !hasNumber) {
      return true;
    }
    return false;
  }

  private normalizeCep(value: string): string {
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length !== 8) {
      return '';
    }
    return cleaned;
  }

  private ensureOrsKey(): void {
    if (!this.orsKey) {
      throw new BadRequestException('Configure ORS_API_KEY para usar a geolocalizacao.');
    }
  }
}
