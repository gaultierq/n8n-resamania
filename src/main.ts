/**
 * Resamania Automated Booking - Simplified
 * Scrapes and books in a single browser session
 */

import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import * as dotenv from 'dotenv';
import { ResamaniaAuth } from './auth.js';
import { ResamaniaSlotBooker, TargetClass, BookingSettings } from './booker.js';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

const relativePath = (path: string) => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  return join(__dirname, '..', path);
}

interface Config {
  resamania: {
    planning_url: string;
    login_url: string;
  };
  target_classes: TargetClass[];
  booking_settings: {
    headless: boolean;
    slow_mo: number;
    min_hours_from_now?: number;
    max_days_from_now?: number;
  };
  username?: string;
  password?: string;
}

export class ResamaniaBooker {
  private config: Config;
  private auth: ResamaniaAuth;

  constructor(configPath: string = relativePath('./config.json')) {
    this.config = this.loadConfig(configPath);
    this.auth = new ResamaniaAuth(this.config);
  }

  private loadConfig(configPath: string): Config {
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));

      // Add credentials from environment
      config.username = process.env.RESAMANIA_USERNAME;
      config.password = process.env.RESAMANIA_PASSWORD;

      // Validate credentials exist
      if (!config.username || !config.password) {
        console.error('Error: RESAMANIA_USERNAME and RESAMANIA_PASSWORD must be set in environment');
        process.exit(1);
      }

      return config;
    } catch (error) {
      console.error(`Error: Config file not found: ${configPath}`);
      process.exit(1);
    }
  }


  async run(maxRetries: number = 15): Promise<void> {
    console.log('Starting Resamania automated booking...');
    console.log('='.repeat(60));
    console.log(`Max retries: ${maxRetries}`);

    // Use environment variable for headless mode, fallback to config, default to true
    const headlessMode = process.env.HEADLESS_BROWSER === 'false'
      ? false
      : (process.env.HEADLESS_BROWSER === 'true'
        ? true
        : (this.config.booking_settings?.headless ?? true));

    const browser = await chromium.launch({
      headless: headlessMode,
      slowMo: this.config.booking_settings?.slow_mo ?? 100
    });

    console.log(`Browser mode: ${headlessMode ? 'headless' : 'headed'}`);

    try {
      // Create browser context
      const contextOptions: any = {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1640, height: 1080 }
      };

      // Load saved session if available
      const storageState = this.auth.getStorageState();
      if (storageState) {
        console.log('✓ Found saved session, loading...');
        contextOptions.storageState = storageState;
      }

      const context = await browser.newContext(contextOptions);
      const page = await context.newPage();

      // Navigate to planning page
      const planningUrl = this.config.resamania.planning_url;
      console.log(`Navigating to: ${planningUrl}`);
      await page.goto(planningUrl, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);

      // Check if we need to login
      if (this.auth.isOnLoginPage(page)) {
        console.log('⚠ Session expired - logging in...');
        if (!await this.auth.loginBrowser(page, context)) {
          console.error('Login failed');
          await browser.close();
          return;
        }
        console.log('✓ Login successful');
        await page.waitForTimeout(3000);
      } else {
        console.log(`✓ Session valid! On page: ${page.url()}`);
      }

      // Create slot booker with booking settings
      const bookingSettings: BookingSettings = {
        minHoursFromNow: this.config.booking_settings?.min_hours_from_now,
        maxDaysFromNow: this.config.booking_settings?.max_days_from_now
      };
      const slotBooker = new ResamaniaSlotBooker(this.config.target_classes || [], bookingSettings);

      // Retry logic: keep trying maxRetries times or until we book something
      const RETRY_INTERVAL_MS = 1000; // 1 second
      const startTime = Date.now();
      let totalBookedCount = 0;
      let attemptNumber = 0;

      console.log('\n' + '='.repeat(60));
      console.log(`RETRY LOOP: Will try ${maxRetries} times or until booking succeeds`);
      console.log('='.repeat(60));

      while (attemptNumber < maxRetries) {
        attemptNumber++;
        const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
        console.log(`\n[Attempt #${attemptNumber}/${maxRetries} - ${elapsedSeconds}s elapsed]`);

        // Reload page to get fresh slot data
        if (attemptNumber > 1) {
          console.log('Reloading page...');
          await page.goto(planningUrl, { waitUntil: 'networkidle' });
          await page.waitForTimeout(1000);
        }

        // List all slots
        const allSlots = await slotBooker.listSlots(page);

        // Filter matching slots
        const matchingSlots = slotBooker.filterMatchingSlots({ allSlots: allSlots });

        if (matchingSlots.length === 0) {
          console.log('No matching slots found. Waiting before retry...');
          await page.waitForTimeout(RETRY_INTERVAL_MS);
          continue;
        }

        // Try to book the matching slots
        const result = await slotBooker.bookSlots(page, matchingSlots);

        totalBookedCount += result.bookedCount;

        // If we managed to book anything, we can stop
        if (result.bookedCount > 0) {
          console.log('\n' + '='.repeat(60));
          console.log('✓ BOOKING SUCCESSFUL - Stopping retry loop');
          console.log('='.repeat(60));
          console.log(`Total slots booked: ${totalBookedCount}`);
          break;
        }

        // Wait before next retry (but not after the last attempt)
        if (attemptNumber < maxRetries) {
          console.log(`No bookings made this attempt. Waiting ${RETRY_INTERVAL_MS / 1000}s before next retry...`);
          await page.waitForTimeout(RETRY_INTERVAL_MS);
        }
      }

      // Final summary
      const totalElapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
      console.log('\n' + '='.repeat(60));
      console.log('FINAL SUMMARY');
      console.log('='.repeat(60));
      console.log(`Total attempts: ${attemptNumber}`);
      console.log(`Time elapsed: ${totalElapsedSeconds}s`);
      console.log(`Total slots booked: ${totalBookedCount}`);
      console.log('='.repeat(60));

      await browser.close();

    } catch (error) {
      console.error(`\nError during booking process: ${error}`);
      if (error instanceof Error) {
        console.error(error.stack);
      }
      await browser.close();
      process.exit(1);
    }
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const booker = new ResamaniaBooker();
  booker.run().catch(error => {
    console.error(`Fatal error: ${error}`);
    process.exit(1);
  });
}
