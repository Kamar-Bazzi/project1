export function withoutPatientId<T extends { patientId: string }>(
  record: T,
): Omit<T, 'patientId'> {
  const { patientId, ...response } = record;
  void patientId;

  return response;
}
