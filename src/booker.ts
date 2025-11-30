/**
 * Resamania Booker - Handles slot listing and booking
 */

import { Page } from 'playwright'
import {
  parseSlotDateTime,
  extractDateFromCardText,
  extractDayOfWeekFromCardText,
  meetsTimeConstraints as checkTimeConstraints,
  hoursFromNow,
  daysFromNow,
} from './utils'

export interface SlotInfo {
  activity_name: string;
  date: string;
  time: string;
  at: Date;
  day_of_week: string;
  status: string;
  is_available: boolean;
  card_element: any; // Playwright element handle
}

export interface TargetClass {
  day: string;
  time: string;
  activity: string;
  duration_minutes: number;
  enabled: boolean;
}

export interface BookingResult {
  bookedCount: number;
  failedCount: number;
  totalMatching: number;
}

export interface BookingSettings {
  minHoursFromNow?: number;
  maxDaysFromNow?: number;
}

export class ResamaniaSlotBooker {
  private targetClasses: TargetClass[];
  private minHoursFromNow: number;
  private maxDaysFromNow: number;

  constructor(targetClasses: TargetClass[], settings?: BookingSettings) {
    this.targetClasses = targetClasses;
    this.minHoursFromNow = settings?.minHoursFromNow ?? 6;
    this.maxDaysFromNow = settings?.maxDaysFromNow ?? 4;
  }

  /**
   * List all available slots from the planning page
   */
  async listSlots(page: Page): Promise<SlotInfo[]> {
    // Wait for activity cards to load
    console.log('\nWaiting for activity cards to load...');
    try {
      await page.waitForSelector('.MuiGrid-root.MuiGrid-item.MuiGrid-grid-md-6.MuiGrid-grid-lg-3', { timeout: 15000 });
      console.log('✓ Activity cards loaded');
    } catch (error) {
      await page.screenshot({ path: 'screenshots/last_list_shots_error.png', fullPage: true });
      console.warn('⚠ Timeout waiting for activity cards');
    }

    // Parse all activity cards
    console.log('\nParsing all activity cards...');
    const activityCards = await page.$$('.MuiGrid-root.MuiGrid-item.MuiGrid-grid-md-6.MuiGrid-grid-lg-3');
    console.log(`Found ${activityCards.length} activity cards`);

    const allSlots: SlotInfo[] = [];
    const MAX_ACTIVITIES = 50;

    for (let i = 0; i < Math.min(activityCards.length, MAX_ACTIVITIES); i++) {
      const card = activityCards[i];

      try {
        // Get full card text first (used for multiple extractions)
        const cardText = await card.innerText();

        // Extract activity name
        const activityHeading = await card.$('h3');
        if (!activityHeading) continue;
        const activityName = (await activityHeading.innerText()).trim();

        // Extract time
        const timeHeading = await card.$('h5');
        const classTime = timeHeading ? (await timeHeading.innerText()).trim() : 'Unknown';

        // Extract date and day of week from card text (not relying on paragraph order)
        const dateText = extractDateFromCardText(cardText);
        const dayOfWeek = extractDayOfWeekFromCardText(cardText);

        // Determine status
        let statusText = 'Available';
        if (cardText.includes('Signed up')) {
          statusText = 'Signed up';
        } else if (cardText.includes('Full')) {
          statusText = 'Full';
        } else if (cardText.includes('waiting list')) {
          statusText = 'On waiting list';
        } else if (cardText.match(/(\d+)\s+remaining place/)) {
          const match = cardText.match(/(\d+)\s+remaining place/);
          statusText = match ? `${match[1]} remaining places` : 'Available';
        }

        // Check if book button exists (available to book)
        const bookButton = await card.$('button:has-text("Book")');
        const isAvailable = bookButton !== null;

        // Parse the date
        const slotDate = parseSlotDateTime(dateText, classTime);

        const slotInfo: SlotInfo = {
          activity_name: activityName,
          date: dateText,
          time: classTime,
          day_of_week: dayOfWeek,
          status: statusText,
          is_available: isAvailable,
          card_element: card,
          at: slotDate,
        };

        allSlots.push(slotInfo);

        // Verbose logging
        console.log(`  [${i + 1}] ${dayOfWeek} ${classTime} - ${activityName}`);
        console.log(`      Status: ${statusText}, Available: ${isAvailable}`);
        console.log(`      Date: ${slotInfo.at}`);

      } catch (error) {
        console.warn(`⚠ Error parsing card ${i + 1}: ${error}`);
        continue;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`Total activities parsed: ${allSlots.length}`);

    return allSlots;
  }

  /**
   * Filter slots that match target classes
   */
  filterMatchingSlots({ allSlots }: { allSlots: SlotInfo[] }): SlotInfo[] {
    // First filter by target class matching
    const matchingSlots = allSlots.filter(slot => this.matchesTargetClass(slot));
    console.log(`Matching target classes: ${matchingSlots.length}`);

    // Then filter by time constraints
    const timeFilteredSlots = matchingSlots.filter(slot => this.meetsTimeConstraints(slot));
    console.log(`After time filtering (4h min, 4d max): ${timeFilteredSlots.length}`);
    console.log('='.repeat(60));

    if (timeFilteredSlots.length === 0) {
      console.log('\nNo matching slots found to book after applying filters.');
      return [];
    }

    // Display matching slots
    console.log('\nMatching slots:');
    for (const slot of timeFilteredSlots) {
      const availIcon = slot.is_available ? '✓ BOOKABLE' : '✗ NOT AVAILABLE';
      const hours = hoursFromNow(slot.at).toFixed(1);
      console.log(`  ${availIcon} - ${slot.day_of_week} ${slot.time} - ${slot.activity_name} (in ${hours}h)`);
      console.log(`    Status: ${slot.status}`);
    }

    return timeFilteredSlots;
  }

  /**
   * Attempt to book all matching slots
   */
  async bookSlots(page: Page, matchingSlots: SlotInfo[]): Promise<BookingResult> {
    console.log('\n' + '='.repeat(60));
    console.log('Starting booking process...');
    console.log('='.repeat(60));

    let bookedCount = 0;
    let failedCount = 0;

    for (const slot of matchingSlots) {
      if (!slot.is_available) {
        console.log(`\n⊘ Skipping ${slot.activity_name} (${slot.day_of_week} ${slot.time}) - not available`);
        continue;
      }

      // Skip if the status is "Full"
      if (slot.status === 'Full') {
        console.log(`\n⊘ Skipping ${slot.activity_name} (${slot.day_of_week} ${slot.time}) - marked as Full`);
        continue;
      }

      console.log(`\n→ Attempting to book: ${slot.activity_name} (${slot.day_of_week} ${slot.time})`);

      try {
        // Find the book button in this card
        const bookButton = await slot.card_element.$('button:has-text("Book")');

        if (!bookButton) {
          console.log('  ✗ Book button not found (may have been booked already)');
          failedCount++;
          continue;
        }

        // Click the book button
        console.log('  Clicking "Book" button...');
        await bookButton.click();
        await page.waitForTimeout(1500);

        // Check for confirmation dialog
        const dialogButton = await page.$('button:has-text("Confirm")');
        if (dialogButton) {
          console.log('  Confirming booking...');
          await dialogButton.click();
          await page.waitForTimeout(1500);
        }

        // Wait for and check toast message
        console.log('  Checking for success toast...');
        await page.waitForTimeout(2000);

        // Look for success indicators (toast, snackbar, etc.)
        const successToast = await page.$('.MuiSnackbar-root, .MuiAlert-root, [role="alert"]');

        if (successToast) {
          const toastText = await successToast.innerText();
          console.log(`  ✓ Toast message: "${toastText}"`);

          // Check if it's a success message
          if (toastText.toLowerCase().includes('success') ||
              toastText.toLowerCase().includes('booked') ||
              toastText.toLowerCase().includes('confirmed')) {
            console.log(`  ✓ SUCCESS: Booked ${slot.activity_name}`);
            bookedCount++;
          } else {
            console.log(`  ⚠ Booking may have failed - toast: "${toastText}"`);
            failedCount++;
          }
        } else {
          console.log('  ⚠ No toast message detected - booking status unknown');
          // Assume success if no error
          bookedCount++;
        }

      } catch (error) {
        console.log(`  ✗ FAILED: ${error}`);
        failedCount++;
      }

      // Small delay between bookings
      await page.waitForTimeout(1000);
    }

    return {
      bookedCount,
      failedCount,
      totalMatching: matchingSlots.length
    };
  }

  private matchesTargetClass(slot: SlotInfo): boolean {
    for (const target of this.targetClasses) {
      if (!target.enabled) continue;

      // Match day, time, and activity name
      if (
        target.day === slot.day_of_week &&
        target.time === slot.time &&
        slot.activity_name.toLowerCase().includes(target.activity.toLowerCase())
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if slot meets time constraints using configured min/max values
   */
  private meetsTimeConstraints(slot: SlotInfo): boolean {
    const slotDate = slot.at;
    if (!slotDate) {
      console.warn(`Skipping slot due to unparseable date: ${slot.date} ${slot.time}`);
      return false;
    }

    if (!checkTimeConstraints(slotDate, this.minHoursFromNow, this.maxDaysFromNow)) {
      const hours = hoursFromNow(slotDate);
      const days = daysFromNow(slotDate);

      if (hours < this.minHoursFromNow) {
        console.log(`  ⊘ Skipping ${slot.activity_name} (${slot.day_of_week} ${slot.time}) - too soon (${hours.toFixed(1)}h < ${this.minHoursFromNow}h)`);
      } else if (days > this.maxDaysFromNow) {
        console.log(`  ⊘ Skipping ${slot.activity_name} (${slot.day_of_week} ${slot.time}) - too far (${days.toFixed(1)}d > ${this.maxDaysFromNow}d)`);
      }
      return false;
    }

    return true;
  }
}
