# Quick Start Guide

## 🚀 Get Started in 3 Steps

### 1. Configure Credentials

```bash
# Copy example environment file
cp .env.example .env

# Edit with your Resamania credentials
nano .env
```

Add your login:
```
RESAMANIA_USERNAME=your.email@example.com
RESAMANIA_PASSWORD=your_password
```

### 2. Configure Target Classes

Edit `config.json` to specify which classes to auto-book:

```json
{
  "target_classes": [
    {
      "day": "Monday",
      "time": "12:30",
      "activity": "CAF",
      "enabled": true
    }
  ]
}
```

### 3. Start Docker Container

```bash
# Start the scheduler (runs every 10 minutes)
docker-compose up -d

# View logs
docker-compose logs -f
```

**That's it!** The system will now:
- ✅ Check for slots every 10 minutes
- ✅ Auto-book matching classes
- ✅ Save session (no repeated logins)
- ✅ Run 24/7 until you stop it

## Common Commands

```bash
# View logs
docker-compose logs -f

# Stop the container
docker-compose down

# Restart after config changes
docker-compose restart

# Rebuild after code changes
docker-compose up -d --build

# Check status
docker-compose ps
```

## What Gets Booked?

Classes are booked when ALL conditions match:
- **Day** matches (e.g., "Monday")
- **Time** matches (e.g., "12:30")
- **Activity** matches (e.g., class name contains "CAF")
- **enabled** is `true` in config
- Class is **available** (not full, not already booked)

## Monitoring

- **Real-time logs:** `docker-compose logs -f`
- **Log files:** `logs/resamania.log`
- **Database:** `data/resamania.db` (SQLite - use DB Browser)
- **Session:** `data/resamania_session.json` (valid 24h)

## Troubleshooting

### Not booking anything?
1. Check logs: `docker-compose logs -f`
2. Verify config.json matches actual class names
3. Make sure day/time format is exact

### Always re-logging?
1. Check `data/resamania_session.json` exists
2. Session expires after 24 hours
3. Delete session file to force fresh login

### Container keeps stopping?
1. Check credentials in `.env` are correct
2. View error logs: `docker-compose logs`
3. Restart: `docker-compose restart`

## Advanced

### Change Schedule Interval

Edit `src/scheduler.ts`:
```typescript
const INTERVAL_MINUTES = 10; // Change to 5, 15, 30, etc.
```

Then rebuild:
```bash
yarn build
docker-compose up -d --build
```

### Run Manually (One-Time)

```bash
# Test without Docker
yarn dev

# Dry run (don't actually book)
yarn dev --dry-run
```

### Development Mode

```bash
# Install dependencies
yarn install

# Install Playwright
yarn playwright install chromium

# Run scheduler locally
yarn dev:scheduler
```

---

**Need more help?** See full [README.md](README.md)
