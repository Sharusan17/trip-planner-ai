import { api } from './client';
import type {
  TransportBooking, Vehicle,
  CreateTransportInput, UpdateTransportInput,
  CreateVehicleInput, UpdateVehicleInput, AssignSeatsInput, VehicleSeat,
} from '@trip-planner-ai/shared';

export const transportApi = {
  list: (tripId: string) =>
    api.get<TransportBooking[]>(`/trips/${tripId}/transport`),

  getById: (id: string) =>
    api.get<TransportBooking>(`/transport/${id}`),

  create: (tripId: string, data: CreateTransportInput) =>
    api.post<TransportBooking>(`/trips/${tripId}/transport`, data),

  update: (id: string, data: UpdateTransportInput) =>
    api.put<TransportBooking>(`/transport/${id}`, data),

  delete: (id: string) =>
    api.delete<void>(`/transport/${id}`),

  listVehicles: (tripId: string) =>
    api.get<Vehicle[]>(`/trips/${tripId}/vehicles`),

  createVehicle: (tripId: string, data: CreateVehicleInput) =>
    api.post<Vehicle>(`/trips/${tripId}/vehicles`, data),

  updateVehicle: (id: string, data: UpdateVehicleInput) =>
    api.put<Vehicle>(`/vehicles/${id}`, data),

  deleteVehicle: (id: string) =>
    api.delete<void>(`/vehicles/${id}`),

  assignSeats: (vehicleId: string, data: AssignSeatsInput) =>
    api.put<VehicleSeat[]>(`/vehicles/${vehicleId}/seats`, data),
};
