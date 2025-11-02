# Collaborative Whiteboard Load Testing Tool

Simulate multiple students drawing simultaneously to test the performance and scalability of your collaborative whiteboard application.

## What This Does

This tool simulates **real students** connecting to your whiteboard application and drawing strokes in real-time:

- ✅ Connects multiple simulated students to a room
- ✅ Each student draws random strokes at configurable intervals
- ✅ Tracks messages sent/received
- ✅ Monitors connection stability
- ✅ Reports performance statistics
- ✅ Tests Ably real-time sync under load

## Web Console Quick Start (Recommended)

1. Start the load-testing server:
   ```bash
   cd /Users/etdadmin/Desktop/Ably/load-testing
   npm run server
   ```
2. Open `http://localhost:8080/` to access the dashboard (it hits the same `/api/*` endpoints the React app uses).
3. Prefer the React UI instead? Keep the server running, then from the project root start Vite (`npm run dev`) and visit `http://localhost:5173/load-testing`.

The web console lets you:

- Pick curated load presets (light, moderate, spike, soak)
- Tune concurrency, draw cadence, ramp-up and test duration
- Launch/stop tests with one click
- Watch live metrics in real time (connections, throughput, errors)
- Stream structured event logs for investigation
- Point at a remote API (for example `http://146.190.100.142`) or switch back to localhost at any time through the UI field

### Zero-install Remote Dashboard

If you deploy or run this load-testing server alone (for example at `http://146.190.100.142`), simply open that URL in a browser. The root path serves the same dashboard, pre-configured to target whichever host you visited. This lets you operate the load test runner directly from the remote machine without cloning the repository or running Vite locally.

## CLI Quick Start

### 1. Install Dependencies

```bash
cd /Users/etdadmin/Desktop/Ably/load-testing
npm install
```

### 2. Run the Load Test

```bash
npm start
```

> Need custom settings? Either prefix the command with env vars (`NUM_STUDENTS=50 npm start`) or create a `.env` file using `.env.example` as a reference—totally optional if you are happy with the defaults.

## 🎯 Testing with Feather Application (Recommended)

The load test is **fully compatible** with the Feather application's test mode, allowing you to visually verify student connections and real-time drawing on the teacher dashboard!

### Quick Start: Visual Load Testing

**Step 1: Start the Feather server**
```bash
cd /Users/etdadmin/Desktop/Ably/Feather
npm run dev
```

**Step 2: Open the simplified load test dashboard**

Open in your browser:
```
http://localhost:5173/test/load?room=LOADTEST
```

**Why `/test/load`?** It's optimized for load testing:
- ✅ **Dark theme** - Better for extended testing sessions
- ✅ **Minimal UI** - Focus only on student cards
- ✅ **Live stats overlay** - See test metrics in real-time
- ✅ **Load test badges** - Easily identify load test students
- ✅ **No session validation** - Perfect for testing

*Alternative:* Use `/test/teacher?room=LOADTEST` for the full dashboard with all features.

**Step 3: Run the load test**

In a new terminal:
```bash
cd /Users/etdadmin/Desktop/Ably/load-testing
ROOM_CODE=LOADTEST NUM_STUDENTS=10 npm start
```

**Step 4: Watch it work! 🎉**

In the Feather teacher dashboard, you should see:
- ✅ **10 student cards appear** with names like "Load Test 1", "Load Test 2", etc.
- ✅ **Real-time strokes** appearing on each student's canvas every 2 seconds
- ✅ **Click any card** to open the full canvas and see detailed drawing
- ✅ **Console logs** showing student connections and drawing events

### What Makes This Work?

The load test now sends Feather-compatible data:
- **Persistent studentId**: Each student has a unique ID like `load-test-student-1`
- **Presence data**: Includes student name, ID, and visibility status
- **Proper stroke format**: Includes metadata (canvas dimensions, scale) that Feather expects
- **Event handling**: Responds to session lifecycle events (start, end, clear)

### Advanced Testing Options

#### Test with Bot Students (UI Comparison)

Add pre-populated bot students to the dashboard for comparison:
```
http://localhost:5173/test/teacher?room=LOADTEST&bot=5
```

This creates 5 static bot students in the UI. Load test students will appear alongside them, making it easy to distinguish real Ably connections from UI-only bots.

#### Scale Testing

Test with more students to see performance:
```bash
# Light load (10 students)
ROOM_CODE=LOADTEST NUM_STUDENTS=10 npm start

# Moderate load (30 students)
ROOM_CODE=LOADTEST NUM_STUDENTS=30 npm start

# Heavy load (50 students)
ROOM_CODE=LOADTEST NUM_STUDENTS=50 npm start
```

#### Adjust Drawing Frequency

Make students draw faster or slower:
```bash
# Draw every second (high traffic)
ROOM_CODE=LOADTEST NUM_STUDENTS=10 DRAW_INTERVAL_MS=1000 npm start

# Draw every 5 seconds (low traffic)
ROOM_CODE=LOADTEST NUM_STUDENTS=10 DRAW_INTERVAL_MS=5000 npm start
```

### Testing on iPad

1. **Find your computer's local IP address:**
   ```bash
   ipconfig getifaddr en0  # macOS/Linux
   ```

2. **Start Feather with host binding:**
   ```bash
   cd /Users/etdadmin/Desktop/Ably/Feather
   npm run dev -- --host
   ```

3. **Open simplified dashboard on iPad:**
   ```
   http://YOUR_IP:5173/test/load?room=LOADTEST
   ```
   
   **iPad-optimized features:**
   - Dark theme reduces eye strain
   - Large touch targets for grid controls
   - Stats overlay in top-right corner
   - Landscape mode recommended for best view

4. **Run load test from computer:**
   ```bash
   cd /Users/etdadmin/Desktop/Ably/load-testing
   ROOM_CODE=LOADTEST NUM_STUDENTS=10 npm start
   ```

5. **Watch students appear on iPad in real-time!**
   - Cards appear with green "LOAD TEST" badges
   - Stats update live in the overlay
   - Tap any card to see full canvas

### Troubleshooting Feather Integration

**Students don't appear on dashboard:**
- ✅ Check that room codes match (URL parameter and `ROOM_CODE` env var)
- ✅ Ensure Feather server is running on port 5173
- ✅ Check browser console for connection errors
- ✅ Verify token server is accessible at `http://localhost:8080/api/token`

**Strokes don't appear:**
- ✅ Check browser console for "student-layer" events
- ✅ Verify students entered presence (should see join toasts)
- ✅ Try clicking a student card to see the full canvas

**Token server errors:**
- ✅ Make sure Feather's `server.js` is running (it provides `/api/token`)
- ✅ Default port is 8080, check if it's in use
- ✅ Restart the Feather server if needed

### Session Lifecycle Events

Load test students now respond to Feather session events:

- **Session Started**: Logged when teacher starts the session
- **Session Ended**: Students gracefully stop drawing and disconnect
- **Clear All Drawings**: Logged when teacher sends new content

Check the load test console output to see these events in action!

## Configuration Options

### NUM_STUDENTS
**Default:** `10`
**Description:** Number of simulated students to connect

```env
NUM_STUDENTS=50   # Simulate 50 students
```

### ROOM_CODE
**Default:** `load-test-room`
**Description:** Which room the students join

```env
ROOM_CODE=my-test-room
```

### DRAW_INTERVAL_MS
**Default:** `2000`
**Description:** How often each student draws (in milliseconds)

```env
DRAW_INTERVAL_MS=1000   # Draw every second
DRAW_INTERVAL_MS=5000   # Draw every 5 seconds
```

### STROKES_PER_DRAW
**Default:** `3`
**Description:** Number of strokes per drawing action

```env
STROKES_PER_DRAW=5   # Each draw sends 5 strokes
```

### TEST_DURATION_SECONDS
**Default:** `60`
**Description:** How long to run the test

```env
TEST_DURATION_SECONDS=120   # Run for 2 minutes
TEST_DURATION_SECONDS=300   # Run for 5 minutes
```

### TOKEN_SERVER_URL
**Default:** `http://localhost:8080/api/token`
**Description:** Your Ably token server endpoint (switch to a remote runner—e.g. `http://146.190.100.142/api/token`—when needed)

```env
# Test locally
TOKEN_SERVER_URL=http://localhost:8080/api/token

# Test production server
TOKEN_SERVER_URL=http://146.190.100.142/api/token

# Test with domain
TOKEN_SERVER_URL=https://yourapp.com/api/token
```

### RAMP_UP_BATCH_SIZE
**Default:** `10`
**Description:** Number of students to connect in parallel per batch.

```env
RAMP_UP_BATCH_SIZE=25  # Useful for spike tests
```

### RAMP_UP_DELAY_MS
**Default:** `300`
**Description:** Delay between connection batches (milliseconds).

```env
RAMP_UP_DELAY_MS=0  # Connect batches back-to-back
```

### STATS_INTERVAL_MS
**Default:** `5000`
**Description:** How often CLI stats are printed (milliseconds).

```env
STATS_INTERVAL_MS=2000
```

### TEST_PRESET
**Default:** _(none)_
**Description:** Apply one of the curated presets (`light`, `medium`, `spike`, `soak`).

```env
TEST_PRESET=spike
```

## Example Test Scenarios

### Light Shakedown (Preset: `light`)

```bash
NUM_STUDENTS=10
DRAW_INTERVAL_MS=3000
STROKES_PER_DRAW=2
TEST_DURATION_SECONDS=60
```

**Expected:**
- ~600 messages in 60 seconds
- 10 messages/second
- Good for initial testing

### Moderate Class (Preset: `medium`)

```bash
NUM_STUDENTS=30
DRAW_INTERVAL_MS=2000
STROKES_PER_DRAW=3
TEST_DURATION_SECONDS=120
```

**Expected:**
- ~5,400 messages in 120 seconds
- 45 messages/second
- Represents a typical busy classroom

### Spike Storm (Preset: `spike`)

```bash
NUM_STUDENTS=75
DRAW_INTERVAL_MS=1500
STROKES_PER_DRAW=4
TEST_DURATION_SECONDS=90
RAMP_UP_BATCH_SIZE=25
RAMP_UP_DELAY_MS=100
```

**Expected:**
- Rapid ramp to 75 concurrent students
- ~18,000 messages in 90 seconds
- Validates burst handling and connection churn

### Soak Session (Preset: `soak`)

```bash
NUM_STUDENTS=20
DRAW_INTERVAL_MS=4000
STROKES_PER_DRAW=2
TEST_DURATION_SECONDS=600
```

**Expected:**
- ~6,000 messages across 10 minutes
- Surfaces slow leaks and long-running stability issues

## Understanding the Output

### During Test

```
✅ Student 1 connected (1/10)
✅ Student 2 connected (2/10)
...
✅ Student 10 connected (10/10)

✨ All students connected! Starting drawing simulation...

📊 Load Test Statistics:
═══════════════════════════════════════
⏱️  Duration: 5.2s
👥 Active Connections: 10/10
📤 Messages Sent: 26 (5.00/sec)
📥 Messages Received: 234 (45.00/sec)
❌ Errors: 0
═══════════════════════════════════════
```

### What the Stats Mean

- **Duration**: How long the test has been running
- **Active Connections**: Current students connected vs. target
- **Messages Sent**: Total messages published by all students
- **Messages Received**: Total messages received (each student receives messages from all others)
- **Errors**: Connection failures or publish errors

### Message Calculation

With 10 students, each sending 1 message every 2 seconds:
- **Sent**: 5 messages/second (10 students × 0.5 msg/sec)
- **Received**: 45 messages/second (9 other students × 5 msg/sec)

## Testing Different Scenarios

### Test Local Server

```bash
# Terminal 1: Start your local server
cd /Users/etdadmin/Desktop/Ably
npm run server

# Terminal 2: Run load test
cd /Users/etdadmin/Desktop/Ably/load-testing
TOKEN_SERVER_URL=http://localhost:8080/api/token npm start
```

### Test Production Server

```bash
# Edit .env
TOKEN_SERVER_URL=http://146.190.100.142/api/token

# Run test
npm start
```

### Test While Watching the App

1. Open your whiteboard app in a browser:
   - Local: `http://localhost:3000`
   - Production: `http://146.190.100.142`

2. Join the same room as the load test:
   - Enter room code: `load-test-room`
   - Choose "Teacher" or "Student"

3. Run the load test:
   ```bash
   npm start
   ```

4. **Watch the canvas!** You should see random strokes appearing from all simulated students in real-time!

## Monitoring Performance

### Watch Ably Dashboard

1. Go to https://ably.com/dashboard
2. Select your app
3. View **Messages** and **Connections** in real-time
4. Monitor API usage

### Watch Server Resources

On your server:

```bash
# Monitor CPU and memory
htop

# Watch PM2 logs
pm2 logs whiteboard-api

# Watch Nginx logs
tail -f /var/log/nginx/whiteboard-access.log
```

## Troubleshooting

### "Failed to get token" Error

**Problem:** Can't connect to token server

**Solutions:**
```bash
# Check token server is running
curl http://localhost:8080/api/token?clientId=test

# Check .env has correct URL
cat .env

# For production, use full domain/IP
TOKEN_SERVER_URL=http://146.190.100.142/api/token
```

### "Connection failed" Error

**Problem:** Ably connection issues

**Solutions:**
- Check your API key is valid
- Verify Ably dashboard shows your app
- Check internet connection
- Reduce number of students

### Too Many Students Won't Connect

**Problem:** System resource limits

**Solutions:**
```bash
# Reduce students
NUM_STUDENTS=10

# Increase draw interval
DRAW_INTERVAL_MS=5000

# Test in smaller batches
```

### High Message Loss

**Problem:** Messages sent but not received

**Possible causes:**
- Network congestion
- Ably rate limits
- Server overwhelmed

**Solutions:**
- Reduce message frequency
- Check Ably free tier limits
- Upgrade Ably plan if needed

## Command Line Quick Tests

You can override .env settings from command line:

```bash
# Quick 5-student test
NUM_STUDENTS=5 npm start

# 30-second stress test
NUM_STUDENTS=100 TEST_DURATION_SECONDS=30 npm start

# Test specific room
ROOM_CODE=classroom-a NUM_STUDENTS=20 npm start

# Test remote server
TOKEN_SERVER_URL=http://146.190.100.142/api/token NUM_STUDENTS=50 npm start
```


## Sample Output

```
🚀 Starting Collaborative Whiteboard Load Test

Configuration:
  - Number of Students: 50
  - Room Code: load-test-room
  - Draw Interval: 2000ms
  - Strokes per Draw: 3
  - Test Duration: 60s
  - Token Server: http://localhost:8080/api/token


✅ Student 1 connected (1/50)
✅ Student 2 connected (2/50)
✅ Student 3 connected (3/50)
...
✅ Student 50 connected (50/50)

✨ All students connected! Starting drawing simulation...

📊 Load Test Statistics:
═══════════════════════════════════════
⏱️  Duration: 60.1s
👥 Active Connections: 50/50
📤 Messages Sent: 1,500 (24.96/sec)
📥 Messages Received: 73,500 (1,223.13/sec)
❌ Errors: 0
═══════════════════════════════════════

🛑 Stopping load test...

📊 Load Test Statistics:
═══════════════════════════════════════
⏱️  Duration: 60.2s
👥 Active Connections: 0/50
📤 Messages Sent: 1,503 (24.97/sec)
📥 Messages Received: 73,647 (1,223.55/sec)
❌ Errors: 0
═══════════════════════════════════════

✅ Load test completed!
```

## Tips for Effective Load Testing

1. **Start Small**: Begin with 5-10 students to verify it works
2. **Increase Gradually**: Double the load each test (10 → 20 → 40 → 80)
3. **Monitor Resources**: Watch CPU, memory, and network
4. **Check Ably Limits**: Free tier has message limits
5. **Test Realistic Scenarios**: Match expected classroom sizes
6. **Visual Verification**: Open the app and watch strokes appear
7. **Long Duration Tests**: Run for 5-10 minutes to catch issues

## Next Steps

After running load tests:

1. **Analyze Results**: Check message throughput and error rates
2. **Identify Bottlenecks**: CPU, memory, network, or Ably limits
3. **Optimize**: Adjust draw frequency, batch messages, or upgrade server
4. **Scale**: If needed, upgrade Ably plan or server resources
5. **Document**: Record max students supported at acceptable performance

## Files

- `load-test.js` - Main load testing script
- `package.json` - Dependencies
- `.env.example` - Configuration template
- `README.md` - This file

## Support

If you need help:
- Check error messages in console
- Review Ably dashboard for connection issues
- Monitor server logs: `pm2 logs whiteboard-api`
- Adjust configuration parameters
- Start with smaller tests

---

Happy load testing! 🚀
