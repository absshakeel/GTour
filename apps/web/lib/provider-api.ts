import { apiClient } from '@gtour/utils';
import type {
  MyPhotographerResponse,
  MyVehicleProviderResponse,
  MyPhotographyServiceDto,
  MyPortfolioDto,
  PhotographerDto,
  ProviderBookingDto,
  VehicleDto,
  VehicleProviderDto,
} from '@gtour/utils';

/**
 * Workspace API calls for the two non-hotel provider roles.
 *
 * Both endpoints are authenticated and scoped server-side to the signed-in
 * account, so the browser never sends an owner id.
 */

export async function fetchMyPhotographer(): Promise<MyPhotographerResponse> {
  const { data } = await apiClient.get<MyPhotographerResponse>('/photographers/mine');
  return data;
}

export async function fetchMyVehicleProvider(): Promise<MyVehicleProviderResponse> {
  const { data } = await apiClient.get<MyVehicleProviderResponse>('/vehicle-providers/mine');
  return data;
}

export type {
  MyPhotographerResponse,
  MyVehicleProviderResponse,
  MyPhotographyServiceDto,
  MyPortfolioDto,
  PhotographerDto,
  ProviderBookingDto,
  VehicleDto,
  VehicleProviderDto,
};