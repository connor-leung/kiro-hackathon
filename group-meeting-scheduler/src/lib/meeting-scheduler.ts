import {
  addMinutes,
  isWithinInterval,
  format,
  startOfDay,
  endOfDay,
  isWeekend,
} from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import {
  MeetingPreferences,
  TimeSlot,
  SchedulingResult,
  ConflictSummary,
} from "../types/scheduling";
import { ParticipantCalendar, CalendarEvent } from "../types/calendar";
import { CalendarProcessor, BusyPeriod } from "./calendar-processor";

/**
 * Error thrown when scheduling fails
 */
export class SchedulingError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "SchedulingError";
  }
}

/**
 * Core meeting scheduling engine that finds optimal time slots
 */
export class MeetingScheduler {
  private calendarProcessor: CalendarProcessor;

  constructor() {
    this.calendarProcessor = new CalendarProcessor();
  }

  /**
   * Analyzes participant calendars and finds available meeting slots
   */
  public async scheduleOptimalMeeting(
    participants: ParticipantCalendar[],
    preferences: MeetingPreferences,
    searchRange: { start: Date; end: Date }
  ): Promise<SchedulingResult> {
    try {
      // Validate inputs
      this.validateInputs(participants, preferences, searchRange);

      // Get busy periods for all participants
      const busyPeriods = await this.getAllBusyPeriods(
        participants,
        searchRange
      );

      // Find all possible time slots
      const candidateSlots = this.findCandidateTimeSlots(
        searchRange,
        preferences,
        busyPeriods
      );

      // Score and rank time slots
      const scoredSlots = this.scoreTimeSlots(
        candidateSlots,
        preferences,
        participants
      );

      // Generate conflict analysis
      const conflictAnalysis = this.analyzeConflicts(scoredSlots, participants);

      // Get top recommendations
      const recommendations = this.getTopRecommendations(scoredSlots, 5);

      return {
        availableSlots: scoredSlots,
        conflictAnalysis,
        recommendations,
      };
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      throw new SchedulingError(
        `Failed to schedule meeting: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "SCHEDULING_FAILED"
      );
    }
  }

  /**
   * Validates scheduling inputs
   */
  private validateInputs(
    participants: ParticipantCalendar[],
    preferences: MeetingPreferences,
    searchRange: { start: Date; end: Date }
  ): void {
    if (!participants || participants.length === 0) {
      throw new SchedulingError(
        "At least one participant is required",
        "NO_PARTICIPANTS"
      );
    }

    if (preferences.duration <= 0) {
      throw new SchedulingError(
        "Meeting duration must be positive",
        "INVALID_DURATION"
      );
    }

    if (searchRange.start >= searchRange.end) {
      throw new SchedulingError(
        "Search range start must be before end",
        "INVALID_RANGE"
      );
    }

    // Validate time range format
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (
      !timeRegex.test(preferences.timeRangeStart) ||
      !timeRegex.test(preferences.timeRangeEnd)
    ) {
      throw new SchedulingError(
        "Invalid time range format",
        "INVALID_TIME_FORMAT"
      );
    }
  }

  /**
   * Gets busy periods for all participants
   */
  private async getAllBusyPeriods(
    participants: ParticipantCalendar[],
    searchRange: { start: Date; end: Date }
  ): Promise<Map<string, BusyPeriod[]>> {
    const busyPeriods = new Map<string, BusyPeriod[]>();

    for (const participant of participants) {
      const periods = await this.calendarProcessor.getBusyPeriods(
        participant.events,
        searchRange
      );
      busyPeriods.set(participant.participantId, periods);
    }

    return busyPeriods;
  }

  /**
   * Finds all candidate time slots within the search range
   */
  private findCandidateTimeSlots(
    searchRange: { start: Date; end: Date },
    preferences: MeetingPreferences,
    busyPeriods: Map<string, BusyPeriod[]>
  ): TimeSlot[] {
    const slots: TimeSlot[] = [];
    const slotDuration = preferences.duration + preferences.bufferTime;

    // Generate time slots for each day in the range
    let currentDate = startOfDay(searchRange.start);
    const endDate = endOfDay(searchRange.end);

    while (currentDate <= endDate) {
      // Skip weekends if excluded
      if (preferences.excludeWeekends && isWeekend(currentDate)) {
        currentDate = addMinutes(currentDate, 24 * 60); // Move to next day
        continue;
      }

      // Skip excluded dates
      if (
        preferences.excludedDates.some(
          (date) =>
            startOfDay(date).getTime() === startOfDay(currentDate).getTime()
        )
      ) {
        currentDate = addMinutes(currentDate, 24 * 60); // Move to next day
        continue;
      }

      // Generate slots for this day within business hours
      const daySlots = this.generateDaySlots(
        currentDate,
        preferences,
        slotDuration,
        busyPeriods
      );
      slots.push(...daySlots);

      currentDate = addMinutes(currentDate, 24 * 60); // Move to next day
    }

    return slots;
  }

  /**
   * Generates time slots for a specific day
   */
  private generateDaySlots(
    date: Date,
    preferences: MeetingPreferences,
    slotDuration: number,
    busyPeriods: Map<string, BusyPeriod[]>
  ): TimeSlot[] {
    const slots: TimeSlot[] = [];

    // Parse business hours
    const [startHour, startMinute] = preferences.timeRangeStart
      .split(":")
      .map(Number);
    const [endHour, endMinute] = preferences.timeRangeEnd
      .split(":")
      .map(Number);

    const dayStart = new Date(date);
    dayStart.setHours(startHour, startMinute, 0, 0);

    const dayEnd = new Date(date);
    dayEnd.setHours(endHour, endMinute, 0, 0);

    // Generate slots every 15 minutes within business hours
    let currentSlotStart = new Date(dayStart);

    while (addMinutes(currentSlotStart, slotDuration) <= dayEnd) {
      const slotEnd = addMinutes(currentSlotStart, preferences.duration);

      // Check if this slot conflicts with any participant's busy periods
      const conflicts = this.findSlotConflicts(
        { start: currentSlotStart, end: slotEnd },
        busyPeriods
      );

      // Create time slot with initial score
      const slot: TimeSlot = {
        start: new Date(currentSlotStart),
        end: new Date(slotEnd),
        score: 0, // Will be calculated later
        conflicts,
        timezoneDisplay: {}, // Will be populated later
      };

      slots.push(slot);

      // Move to next potential slot (15-minute intervals)
      currentSlotStart = addMinutes(currentSlotStart, 15);
    }

    return slots;
  }

  /**
   * Finds conflicts for a specific time slot
   */
  private findSlotConflicts(
    slot: { start: Date; end: Date },
    busyPeriods: Map<string, BusyPeriod[]>
  ): string[] {
    const conflicts: string[] = [];

    for (const [participantId, periods] of busyPeriods) {
      const hasConflict = periods.some((period) =>
        this.periodsOverlap(slot, { start: period.start, end: period.end })
      );

      if (hasConflict) {
        conflicts.push(participantId);
      }
    }

    return conflicts;
  }

  /**
   * Checks if two time periods overlap
   */
  private periodsOverlap(
    period1: { start: Date; end: Date },
    period2: { start: Date; end: Date }
  ): boolean {
    return period1.start < period2.end && period2.start < period1.end;
  }

  /**
   * Scores time slots based on preferences and conflicts
   */
  private scoreTimeSlots(
    slots: TimeSlot[],
    preferences: MeetingPreferences,
    participants: ParticipantCalendar[]
  ): TimeSlot[] {
    return slots.map((slot) => {
      let score = 100; // Start with perfect score

      // Penalize conflicts heavily
      const conflictPenalty =
        (slot.conflicts.length / participants.length) * 50;
      score -= conflictPenalty;

      // Bonus for preferred time ranges (middle of business hours)
      const timeBonus = this.calculateTimePreferenceBonus(slot, preferences);
      score += timeBonus;

      // Bonus for timezone alignment
      const timezoneBonus = this.calculateTimezoneBonus(
        slot,
        preferences,
        participants
      );
      score += timezoneBonus;

      // Populate timezone display
      slot.timezoneDisplay = this.generateTimezoneDisplay(slot, participants);

      return {
        ...slot,
        score: Math.max(0, Math.min(100, score)), // Clamp between 0-100
      };
    });
  }

  /**
   * Calculates bonus points for preferred time ranges
   */
  private calculateTimePreferenceBonus(
    slot: TimeSlot,
    preferences: MeetingPreferences
  ): number {
    const hour = slot.start.getHours();
    const minute = slot.start.getMinutes();
    const timeInMinutes = hour * 60 + minute;

    // Parse business hours
    const [startHour, startMinute] = preferences.timeRangeStart
      .split(":")
      .map(Number);
    const [endHour, endMinute] = preferences.timeRangeEnd
      .split(":")
      .map(Number);

    const businessStart = startHour * 60 + startMinute;
    const businessEnd = endHour * 60 + endMinute;
    const businessMiddle = (businessStart + businessEnd) / 2;

    // Give bonus for times closer to middle of business hours
    const distanceFromMiddle = Math.abs(timeInMinutes - businessMiddle);
    const maxDistance = (businessEnd - businessStart) / 2;

    return Math.max(0, 10 * (1 - distanceFromMiddle / maxDistance));
  }

  /**
   * Calculates bonus for timezone alignment
   */
  private calculateTimezoneBonus(
    slot: TimeSlot,
    preferences: MeetingPreferences,
    participants: ParticipantCalendar[]
  ): number {
    if (preferences.preferredTimezones.length === 0) {
      return 0;
    }

    // Count participants in preferred timezones
    const participantsInPreferredTz = participants.filter((p) =>
      preferences.preferredTimezones.includes(p.timezone)
    ).length;

    return (participantsInPreferredTz / participants.length) * 5;
  }

  /**
   * Generates timezone display for a time slot
   */
  private generateTimezoneDisplay(
    slot: TimeSlot,
    participants: ParticipantCalendar[]
  ): Record<string, string> {
    const display: Record<string, string> = {};

    // Get unique timezones
    const timezones = [...new Set(participants.map((p) => p.timezone))];

    for (const timezone of timezones) {
      try {
        const startTime = formatInTimeZone(
          slot.start,
          timezone,
          "MMM d, h:mm a"
        );
        const endTime = formatInTimeZone(slot.end, timezone, "h:mm a");
        display[timezone] = `${startTime} - ${endTime}`;
      } catch (error) {
        // Fallback to UTC if timezone is invalid
        display[timezone] = `${format(slot.start, "MMM d, h:mm a")} - ${format(
          slot.end,
          "h:mm a"
        )} UTC`;
      }
    }

    return display;
  }

  /**
   * Analyzes conflicts across all time slots
   */
  private analyzeConflicts(
    slots: TimeSlot[],
    participants: ParticipantCalendar[]
  ): ConflictSummary {
    const participantConflicts: Record<string, number> = {};
    const conflictsByTimeSlot: Record<string, string[]> = {};
    let totalConflicts = 0;

    // Initialize participant conflict counts
    participants.forEach((p) => {
      participantConflicts[p.participantId] = 0;
    });

    slots.forEach((slot) => {
      const slotKey = `${slot.start.toISOString()}-${slot.end.toISOString()}`;
      conflictsByTimeSlot[slotKey] = slot.conflicts;

      slot.conflicts.forEach((participantId) => {
        participantConflicts[participantId]++;
        totalConflicts++;
      });
    });

    return {
      totalConflicts,
      participantConflicts,
      conflictsByTimeSlot,
    };
  }

  /**
   * Gets top recommended time slots
   */
  private getTopRecommendations(slots: TimeSlot[], count: number): TimeSlot[] {
    return slots
      .sort((a, b) => b.score - a.score) // Sort by score descending
      .slice(0, count);
  }

  /**
   * Finds alternative suggestions when no perfect slots exist
   */
  public findAlternativeSuggestions(
    result: SchedulingResult,
    preferences: MeetingPreferences
  ): {
    shorterDuration: TimeSlot[];
    expandedHours: TimeSlot[];
    fewerParticipants: TimeSlot[];
  } {
    const alternatives = {
      shorterDuration: [] as TimeSlot[],
      expandedHours: [] as TimeSlot[],
      fewerParticipants: [] as TimeSlot[],
    };

    // Find slots with minimal conflicts for fewer participants suggestion
    alternatives.fewerParticipants = result.availableSlots
      .filter(
        (slot) =>
          slot.conflicts.length > 0 &&
          slot.conflicts.length < result.availableSlots[0]?.conflicts.length
      )
      .sort((a, b) => a.conflicts.length - b.conflicts.length)
      .slice(0, 3);

    return alternatives;
  }
}
