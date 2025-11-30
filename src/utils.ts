/**
 * Date and time utility functions for Resamania
 */

/**
 * Converts a date string and time string to a Date object
 * @param dateStr - Format: "Monday 2 December" or similar
 * @param timeStr - Format: "19:30"
 * @returns Date object representing the slot time
 */
export function parseSlotDateTime(dateStr: string, timeStr: string): Date {
  // dateStr example: "Monday 2 December"
  // timeStr example: "19:30"

  const [_weekdayStr, dayStr, monthStr] = dateStr.split(" ");

  // Month mapping
  const months: Record<string, number> = {
    january: 0,
    february: 1,
    march: 2,
    april: 3,
    may: 4,
    june: 5,
    july: 6,
    august: 7,
    september: 8,
    october: 9,
    november: 10,
    december: 11,
  };

  const month = months[monthStr.toLowerCase()];
  if (month === undefined) {
    throw new Error(`Invalid month: ${monthStr}`);
  }

  const day = Number(dayStr);
  if (Number.isNaN(day)) {
    throw new Error(`Invalid day: ${dayStr}`);
  }

  // Parse time
  const [hour, minute] = timeStr.split(":").map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    throw new Error(`Invalid time: ${timeStr}`);
  }

  const now = new Date();
  const currentYear = now.getFullYear();

  // Build the target date for this year
  let target = new Date(currentYear, month, day, hour, minute, 0, 0);

  // If the datetime has passed, use next year instead
  if (target < now) {
    target = new Date(currentYear + 1, month, day, hour, minute, 0, 0);
  }

  return target;
}

/**
 * Extracts date text from card text using pattern matching
 * Looks for patterns like "Monday 2 December"
 * @param cardText - Full text content of the card
 * @returns Date string (e.g., "Monday 2 December") or "Unknown"
 */
export function extractDateFromCardText(cardText: string): string {
  // Pattern: Day name followed by day number and month name
  // Example: "Monday 2 December"
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];

  // Build a regex pattern that matches: DayName Number MonthName
  const dayPattern = days.join('|');
  const monthPattern = months.join('|');
  const datePattern = new RegExp(`(${dayPattern})\\s+(\\d{1,2})\\s+(${monthPattern})`, 'i');

  const match = cardText.match(datePattern);
  if (match) {
    // Return the matched date string (group 0 is the full match)
    return match[0];
  }

  return 'Unknown';
}

/**
 * Extracts day of week from card text
 * @param cardText - Full text content of the card
 * @returns Day of week string (e.g., "Monday") or "Unknown"
 */
export function extractDayOfWeekFromCardText(cardText: string): string {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  // Look for day name followed by digits (date pattern)
  for (const day of days) {
    const pattern = new RegExp(`${day}\\s+\\d{1,2}`, 'i');
    if (pattern.test(cardText)) {
      return day;
    }
  }

  // Fallback: simple substring match
  const cardTextLower = cardText.toLowerCase();
  for (const day of days) {
    if (cardTextLower.includes(day.toLowerCase())) {
      return day;
    }
  }

  return 'Unknown';
}

/**
 * Check if a date meets time constraints
 * @param slotDate - The date to check
 * @param minHours - Minimum hours from now (default: 6)
 * @param maxDays - Maximum days from now (default: 4)
 * @returns true if date meets constraints
 */
export function meetsTimeConstraints(
  slotDate: Date | null,
  minHours: number = 6,
  maxDays: number = 4
): boolean {
  if (!slotDate) {
    return false;
  }

  const now = new Date();
  const minTime = new Date(now.getTime() + minHours * 60 * 60 * 1000);
  const maxTime = new Date(now.getTime() + maxDays * 24 * 60 * 60 * 1000);

  return slotDate >= minTime && slotDate <= maxTime;
}

/**
 * Calculate hours from now until a given date
 * @param date - The target date
 * @returns Number of hours from now (can be negative if in the past)
 */
export function hoursFromNow(date: Date): number {
  const now = new Date();
  return (date.getTime() - now.getTime()) / (1000 * 60 * 60);
}

/**
 * Calculate days from now until a given date
 * @param date - The target date
 * @returns Number of days from now (can be negative if in the past)
 */
export function daysFromNow(date: Date): number {
  const now = new Date();
  return (date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
}
