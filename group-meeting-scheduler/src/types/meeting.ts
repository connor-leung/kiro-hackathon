import { TimeSlot } from "./scheduling";

/**
 * Participant response to meeting invitation
 */
export interface ParticipantResponse {
  participantId: string;
  email: string;
  status: "pending" | "accepted" | "declined";
  respondedAt?: Date;
}

/**
 * Meeting data with participant responses
 */
export interface Meeting {
  id: string;
  organizerId: string;
  title: string;
  selectedSlot: TimeSlot;
  participants: ParticipantResponse[];
  status: "pending" | "confirmed" | "cancelled";
  createdAt: Date;
}

/**
 * Meeting creation request payload
 */
export interface CreateMeetingRequest {
  title: string;
  selectedSlot: TimeSlot;
  participantEmails: string[];
  organizerEmail: string;
}

/**
 * Meeting invitation data
 */
export interface MeetingInvitation {
  meetingId: string;
  title: string;
  timeSlot: TimeSlot;
  organizerName: string;
  organizerEmail: string;
  participants: string[];
  message?: string;
}
