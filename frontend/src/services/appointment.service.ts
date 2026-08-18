import type {
  Appointment,
  AppointmentDoctor,
  AppointmentInput,
  DoctorAppointmentInput,
  UpdateAppointmentInput,
} from "../types/appointment";
import api from "./api";

interface AppointmentListResponse {
  items: Appointment[];
}

export const appointmentService = {
  async list(): Promise<Appointment[]> {
    const response = await api.get<AppointmentListResponse>("/appointments", {
      params: { pageSize: 100 },
    });
    return response.data.items;
  },

  async get(appointmentId: string): Promise<Appointment> {
    const response = await api.get<Appointment>(
      `/appointments/${appointmentId}`,
    );
    return response.data;
  },

  async listDoctors(): Promise<AppointmentDoctor[]> {
    const response = await api.get<AppointmentDoctor[]>(
      "/appointments/doctors",
    );
    return response.data;
  },

  async create(
    input:
      | AppointmentInput
      | DoctorAppointmentInput
      | (AppointmentInput & { patientId: string }),
  ): Promise<Appointment> {
    const response = await api.post<Appointment>("/appointments", input);
    return response.data;
  },

  async update(
    appointmentId: string,
    input: UpdateAppointmentInput,
  ): Promise<Appointment> {
    const response = await api.patch<Appointment>(
      `/appointments/${appointmentId}`,
      input,
    );
    return response.data;
  },

  async remove(appointmentId: string): Promise<void> {
    await api.delete(`/appointments/${appointmentId}`);
  },
};
