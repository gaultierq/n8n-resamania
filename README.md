# Resamania Auto-Booking System

Automated booking system for Resamania fitness classes using TypeScript and Playwright. Runs in Docker and books classes twice per hour at :00 and :01.

## Features

- 🔐 **Session Persistence** - Saves login session to avoid repeated logins
- 🔍 **Smart Scraping** - Detects available fitness class slots
- 📅 **Auto-Booking** - Automatically books your target classes in the same browser session
- ⏰ **Scheduled Runs** - Runs twice per hour (at :00 and :01 minutes)
- 🐳 **Docker Ready** - Easy deployment with docker-compose
- 🎯 **Configurable Targets** - Specify which classes to book by day, time, and activity
- ⚡ **Simplified** - Single browser session, no database overhead

## Quick Start with Docker (Recommended)

This is the easiest way to run the system. It will automatically check and book slots twice per hour (at :00 and :01 minutes).

### 1. Configure Your Credentials

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env with your credentials
nano .env
```

Add your credentials:
```bash
RESAMANIA_USERNAME=your.email@example.com
RESAMANIA_PASSWORD=your_password
```

### 2. Configure Target Classes

Edit `config.json` to specify which classes you want to book:

```json
{
  "target_classes": [
    {
      "day": "Monday",
      "time": "12:30",
      "activity": "CAF",
      "duration_minutes": 45,
      "enabled": true
    },
    {
      "day": "Wednesday",
      "time": "12:30",
      "activity": "RPM",
      "duration_minutes": 45,
      "enabled": true
    }
  ],
  "booking_settings": {
    "auto_book": true,
    "headless": true,
    "slow_mo": 100
  }
}
```

### 3. Start the Container

```bash
# Build and start the container
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the container
docker-compose down
```

That's it! The system will now:
- Check for available slots twice per hour (at :00 and :01 minutes)
- Automatically book any matching classes immediately
- Save session so you don't need to login repeatedly
- Keep running until you stop it

## Local Development (Without Docker)

### Prerequisites

- Node.js 20+

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Install Playwright browsers:**
   ```bash
   npx playwright install chromium
   ```

3. **Configure environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

4. **Configure your target classes** in `config.json`

### Usage

#### One-Time Run

```bash
# Check for available slots and book (run once)
npm run dev

# Build and run production version
npm run build
npm start
```

#### Scheduled Runs (Twice Per Hour at :00 and :01)

```bash
# Run scheduler in development mode
npm run dev:scheduler

# Or build and run in production
npm run build
npm run start:scheduler
```

## Configuration

### Environment Variables (`.env`)

```bash
RESAMANIA_USERNAME=your.email@example.com
RESAMANIA_PASSWORD=your_password
LOG_LEVEL=INFO
HEADLESS_BROWSER=true
```

### Target Classes (`config.json`)

```json
{
  "resamania": {
    "base_url": "https://member.resamania.com",
    "api_url": "https://api.resamania.com",
    "login_url": "https://api.resamania.com/oauth/login/fitnesstraining?...",
    "planning_url": "https://member.resamania.com/fitnesstraining/planning?club=..."
  },
  "target_classes": [
    {
      "day": "Monday",
      "time": "12:30",
      "activity": "CAF",
      "duration_minutes": 45,
      "enabled": true
    }
  ],
  "booking_settings": {
    "auto_book": true,
    "headless": false,
    "slow_mo": 100
  },
  "notification_settings": {
    "notify_on_success": true,
    "notify_on_failure": true
  }
}
```

## Project Structure

```
resamania/
├── src/
│   ├── main.ts         # Main booking logic (scrape + book in one session)
│   ├── scheduler.ts    # Scheduler (runs at :00 and :01 of each hour)
│   └── auth.ts         # Authentication & session management
├── data/
│   └── resamania_session.json    # Session persistence
├── config.json                    # Configuration
├── .env                           # Environment variables (credentials)
├── Dockerfile                     # Docker image definition
├── docker-compose.yml             # Docker deployment config
├── package.json
└── tsconfig.json
```

## Docker Commands

```bash
# Build and start in background
docker-compose up -d

# View logs in real-time
docker-compose logs -f

# Check status
docker-compose ps

# Stop the container
docker-compose down

# Rebuild after code changes
docker-compose up -d --build

# Remove everything including volumes
docker-compose down -v
```

## How It Works

### 1. Session Management
- On first run, logs into Resamania and saves session cookies
- Automatically re-logins if session expires
- Uses Playwright's `storage_state` to persist cookies and localStorage

### 2. Scraping & Booking (Single Browser Session)
- Navigates to the planning page
- Extracts all available class slots
- Matches against your target classes in `config.json`
- **Immediately books** matching slots by clicking "Book" button
- Checks for success toast messages
- All done in one browser session (no page reloading)

### 3. Scheduler
- Runs the booking check twice per hour (at :00 and :01 minutes)
- Logs each run with timestamp
- Continues running indefinitely
- Gracefully handles SIGTERM/SIGINT for shutdown

## Troubleshooting

### Session Not Persisting

If you're being asked to login every time:

1. Check that `data/resamania_session.json` exists and has recent timestamp
2. Verify the session file contains cookies for both `api.resamania.com` and `member.resamania.com`
3. The session cookies are converted to persistent cookies (expires timestamp, not -1)
4. Try deleting the session file and logging in fresh:
   ```bash
   rm data/resamania_session.json
   docker-compose restart
   ```

### No Classes Found

- Verify your `config.json` target classes match the actual class names
- Check day/time format matches exactly ("Monday" not "Mon", "12:30" not "12h30")
- Run with `--verbose` to see detailed logging
- Check the planning_url in config is correct

### Booking Fails

- Set `"headless": false` in config.json to watch the browser in action
- Check logs: `docker-compose logs -f`
- Verify you're not already booked for that class
- Check that the class is actually available (not "Full")

### Docker Issues

```bash
# Check if container is running
docker-compose ps

# View container logs
docker-compose logs -f

# Restart container
docker-compose restart

# Rebuild from scratch
docker-compose down
docker-compose up -d --build
```

## Development

### Local Development Mode

```bash
# Watch mode for TypeScript
npm run watch

# Run scheduler locally (not in Docker)
npm run dev:scheduler
```

### Build and Test

```bash
# Clean build
npm run clean
npm run build

# Test one-time run
npm start

# Test scheduler
npm run start:scheduler
```

### TypeScript Checking

```bash
npx tsc --noEmit
```

## Scripts Reference

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to JavaScript |
| `npm start` | Run one-time booking check |
| `npm run start:scheduler` | Run scheduler (twice per hour at :00 and :01) |
| `npm run dev` | Run one-time in development mode |
| `npm run dev:scheduler` | Run scheduler in development mode |
| `npm run watch` | Watch mode for development |
| `npm run clean` | Remove dist directory |

## Production Deployment

### Using Docker Compose (Recommended)

1. Clone the repo on your server
2. Configure `.env` and `config.json`
3. Run: `docker-compose up -d`
4. Monitor: `docker-compose logs -f`

### Using systemd (Alternative)

If you prefer running without Docker:

1. Build the project: `npm run build`
2. Create a systemd service file
3. Enable and start the service

The scheduler will handle running twice per hour automatically.

## Scheduling Interval

The default schedule is **twice per hour at :00 and :01 minutes**. To change it:

Edit `src/scheduler.ts`:
```typescript
// Run at minute 00 of every hour
cron.schedule('0 * * * *', async () => {
  await this.runBooking();
});

// Run at minute 01 of every hour
cron.schedule('1 * * * *', async () => {
  await this.runBooking();
});
```

Use standard cron syntax. Then rebuild:
```bash
npm run build
docker-compose up -d --build
```

## Logs and Debugging

- **Docker logs:** `docker-compose logs -f`
- **Session:** `data/resamania_session.json`
- **Verbose logging:** Set `"headless": false` in config.json to watch the browser

## License

MIT

## Disclaimer

This tool is for personal use only. Use responsibly and in accordance with Resamania's terms of service.
