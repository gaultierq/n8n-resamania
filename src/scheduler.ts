/**
 * Scheduler - Runs booking twice per hour at :00 and :01
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

  private async runBooking(): Promise<void> {
    const timestamp = new Date().toISOString();
    console.log('\n' + '='.repeat(70));
    console.log(`[${timestamp}] Starting scheduled booking run...`);
    console.log('='.repeat(70));

    try {
      // Import and run the booking logic
      const { ResamaniaBooker } = await import('./main.js');
      const booker = new ResamaniaBooker();
      await booker.run();

      console.log(`\n[${new Date().toISOString()}] Scheduled run completed`);
    } catch (error) {
      console.error(`\n[${new Date().toISOString()}] Error during scheduled run:`, error);
    }
  }

  start(): void {
    console.log('='.repeat(70));
    console.log('Resamania Booking Scheduler Started');
    console.log('='.repeat(70));
    console.log('Schedule: Twice per hour at :00 and :01');
    console.log(`Started at: ${new Date().toISOString()}`);
    console.log('='.repeat(70));

    // Run at minute 00 of every hour
    cron.schedule('0 * * * *', async () => {
      console.log('\n[CRON TRIGGER] Running at :00');
      await this.runBooking();
    });

    // Run at minute 59 of every hour
    cron.schedule('59 * * * *', async () => {
      setTimeout(async () => {
        console.log('\n[CRON TRIGGER] Running at :59');
        await this.runBooking();
      }, 30000)
    });

    console.log('\n✓ Scheduler is running and waiting for scheduled times...');
    console.log('Next runs will be at the top of each hour (:00 and :01)\n');

    console.log('Running it once, to verify it works\n');

    this.runBooking().then(() => {
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
