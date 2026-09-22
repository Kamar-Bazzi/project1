export const followUpPlanStatuses = [
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
] as const;

export type FollowUpPlanStatus = (typeof followUpPlanStatuses)[number];

export const followUpTaskStatuses = ["TODO", "DONE", "CANCELLED"] as const;

export type FollowUpTaskStatus = (typeof followUpTaskStatuses)[number];

export interface FollowUpTask {
  id: string;
  followUpPlanId?: string;
  planId?: string;
  title: string;
  notes: string | null;
  dueAt: string | null;
  status: FollowUpTaskStatus;
  completedAt: string | null;
  sortOrder?: number;
  createdAt: string;
  updatedAt: string;
}

export interface FollowUpPlan {
  id: string;
  patientId: string;
  doctorId: string;
  appointmentId?: string | null;
  title: string;
  notes: string | null;
  nextReviewAt: string | null;
  status: FollowUpPlanStatus;
  tasks: FollowUpTask[];
  createdAt: string;
  updatedAt: string;
  doctor?: {
    id: string;
    specialization?: string | null;
    user: { id: string; name: string };
  };
}

export interface CreateFollowUpPlanInput {
  title: string;
  notes?: string | null;
  nextReviewAt?: string | null;
  status?: FollowUpPlanStatus;
}

export interface UpdateFollowUpPlanInput {
  title?: string;
  notes?: string | null;
  nextReviewAt?: string | null;
  status?: FollowUpPlanStatus;
}

export interface CreateFollowUpTaskInput {
  title: string;
  notes?: string | null;
  dueAt?: string | null;
}

export interface UpdateFollowUpTaskInput {
  title?: string;
  notes?: string | null;
  dueAt?: string | null;
  status?: FollowUpTaskStatus;
}
