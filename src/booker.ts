/**
 * Resamania Booker - Handles slot listing and booking
 */

import { Page } from 'playwright';

export interface SlotInfo {
  activity_name: string;
  date: string;
  time: string;
  day_of_week: string;
  club_name: string;
  studio_name: string;
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

export class ResamaniaSlotBooker {
  private targetClasses: TargetClass[];

  constructor(targetClasses: TargetClass[]) {
    this.targetClasses = targetClasses;
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
        // Extract activity name
        const activityHeading = await card.$('h3');
        if (!activityHeading) continue;
        const activityName = (await activityHeading.innerText()).trim();

        // Extract time
        const timeHeading = await card.$('h5');
        const classTime = timeHeading ? (await timeHeading.innerText()).trim() : 'Unknown';

        // Extract paragraphs (date, club, studio)
        const paragraphs = await card.$$('p');
        let dateText = 'Unknown';
        let clubName = 'Unknown';
        let studioName = 'Unknown';

        if (paragraphs.length > 0) {
          dateText = (await paragraphs[0].innerText()).trim();
        }
        if (paragraphs.length > 2) {
          clubName = (await paragraphs[2].innerText()).trim();
        }
        if (paragraphs.length > 3) {
          studioName = (await paragraphs[3].innerText()).trim();
        }

        // Get full card text for status and day parsing
        const cardText = await card.innerText();

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

        // Extract day of week from card text
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        let dayOfWeek = 'Unknown';
        const cardTextLower = cardText.toLowerCase();

        for (const day of days) {
          const dayLower = day.toLowerCase();
          // Look for day name followed by digits (date pattern)
          const pattern = new RegExp(`${dayLower}\\s+\\d{1,2}`, 'i');
          if (pattern.test(cardText)) {
            dayOfWeek = day;
            break;
          }
        }

        // Fallback: simple substring match
        if (dayOfWeek === 'Unknown') {
          for (const day of days) {
            if (cardTextLower.includes(day.toLowerCase())) {
              dayOfWeek = day;
              break;
            }
          }
        }

        const slotInfo: SlotInfo = {
          activity_name: activityName,
          date: dateText,
          time: classTime,
          day_of_week: dayOfWeek,
          club_name: clubName,
          studio_name: studioName,
          status: statusText,
          is_available: isAvailable,
          card_element: card
        };

        allSlots.push(slotInfo);

        // Verbose logging
        console.log(`  [${i + 1}] ${dayOfWeek} ${classTime} - ${activityName}`);
        console.log(`      Status: ${statusText}, Available: ${isAvailable}`);
        console.log(`      Location: ${clubName} / ${studioName}`);

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
  filterMatchingSlots(allSlots: SlotInfo[]): SlotInfo[] {
    const matchingSlots = allSlots.filter(slot => this.matchesTargetClass(slot));
    console.log(`Matching target classes: ${matchingSlots.length}`);
    console.log('='.repeat(60));

    if (matchingSlots.length === 0) {
      console.log('\nNo matching slots found to book.');
      return [];
    }

    // Display matching slots
    console.log('\nMatching slots:');
    for (const slot of matchingSlots) {
      const availIcon = slot.is_available ? '✓ BOOKABLE' : '✗ NOT AVAILABLE';
      console.log(`  ${availIcon} - ${slot.day_of_week} ${slot.time} - ${slot.activity_name}`);
      console.log(`    Status: ${slot.status}`);
      console.log(`    Location: ${slot.club_name} / ${slot.studio_name}`);
    }

    return matchingSlots;
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
}
