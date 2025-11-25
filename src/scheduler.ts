/**
 * Scheduler - Runs booking on two schedules:
 * - Daily at 11:59 AM Paris time with 15 retries
 * - Every hour at :30 with 1 retry
 */

import cron from 'node-cron';
import * as dotenv from 'dotenv';

dotenv.config();

class BookingScheduler {
  constructor() {
    this.validateEnvironment();
  }

  private validateEnvironment(): void {
    if (!process.env.RESAMANIA_USERNAME || !process.env.RESAMANIA_PASSWORD) {
      console.error('Error: RESAMANIA_USERNAME and RESAMANIA_PASSWORD must be set');
      process.exit(1);
    }
  }

  private async runBooking(retries: number, description: string): Promise<void> {
    const timestamp = new Date().toISOString();
    console.log('\n' + '='.repeat(70));
    console.log(`[${timestamp}] ${description}`);
    console.log(`Retries: ${retries}`);
    console.log('='.repeat(70));

    try {
      // Import and run the booking logic
      const { ResamaniaBooker } = await import('./main.js');
      const booker = new ResamaniaBooker();
      await booker.run(retries);

      console.log(`\n[${new Date().toISOString()}] Scheduled run completed`);
    } catch (error) {
      console.error(`\n[${new Date().toISOString()}] Error during scheduled run:`, error);
    }
  }

  start(): void {
    console.log('='.repeat(70));
    console.log('Resamania Booking Scheduler Started');
    console.log('='.repeat(70));
    console.log('Schedules:');
    console.log('  1. Daily at 11:59 AM Paris time - 15 retries');
    console.log('  2. Every hour at :30 - 1 retry');
    console.log(`Started at: ${new Date().toISOString()}`);
    console.log('='.repeat(70));

    // Schedule 1: Daily at 11:59 AM Paris time with 15 retries
    cron.schedule('59 11 * * *', async () => {
      console.log('\n[CRON TRIGGER] Daily 11:59 AM Paris time run');
      await this.runBooking(15, 'Daily high-retry booking at 11:59 AM Paris');
    }, {
      timezone: 'Europe/Paris'
    });

    // Schedule 2: Every hour at :30 with 1 retry
    cron.schedule('30 * * * *', async () => {
      console.log('\n[CRON TRIGGER] Hourly :30 run');
      await this.runBooking(1, 'Hourly booking at :30');
    });

    console.log('\n✓ Scheduler is running and waiting for scheduled times...');
    console.log('Next daily run: 11:59 AM Paris time (Europe/Paris)');
    console.log('Next hourly run: Top of next hour + 30 minutes\n');

    console.log('Running once with 1 retry to verify it works\n');

    this.runBooking(1, 'Initial test run').then(() => {
      console.log('Looking good\n');
    });
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n[SIGTERM] Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n[SIGINT] Shutting down gracefully...');
  process.exit(0);
});

// Start the scheduler
const scheduler = new BookingScheduler();
scheduler.start();

// Keep the process alive
process.stdin.resume();
