import type { WeatherData } from '@trip-planner-ai/shared';
import { api } from './client';

export const weatherApi = {
  get: (lat: number, lng: number) =>
    api.get<WeatherData>(`/weather?lat=${lat}&lng=${lng}`),
};
