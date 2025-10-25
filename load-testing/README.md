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

## Quick Start

### 1. Install Dependencies

```bash
cd /Users/etdadmin/Desktop/Ably/load-testing
npm install
```

### 2. Configure Test Parameters

```bash
cp .env.example .env
nano .env
```

Edit the configuration:

```env
NUM_STUDENTS=10              # Number of simulated students
ROOM_CODE=load-test-room     # Room to join
DRAW_INTERVAL_MS=2000        # How often to draw (ms)
STROKES_PER_DRAW=3           # Strokes per draw action
TEST_DURATION_SECONDS=60     # Test duration
TOKEN_SERVER_URL=http://localhost:8080/api/token
```

### 3. Run the Load Test

```bash
npm start
```

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
**Description:** Your Ably token server endpoint

```env
# Test locally
TOKEN_SERVER_URL=http://localhost:8080/api/token

# Test production server
TOKEN_SERVER_URL=http://146.190.100.142/api/token

# Test with domain
TOKEN_SERVER_URL=https://yourapp.com/api/token
```

## Example Test Scenarios

### Light Load Test (10 students)

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

### Medium Load Test (50 students)

```bash
NUM_STUDENTS=50
DRAW_INTERVAL_MS=2000
STROKES_PER_DRAW=3
TEST_DURATION_SECONDS=120
```

**Expected:**
- ~4,500 messages in 120 seconds
- 37.5 messages/second
- Tests moderate classroom size

### Heavy Load Test (100 students)

```bash
NUM_STUDENTS=100
DRAW_INTERVAL_MS=1000
STROKES_PER_DRAW=5
TEST_DURATION_SECONDS=300
```

**Expected:**
- ~30,000 messages in 300 seconds
- 100 messages/second
- Stress test for large classrooms

### Stress Test (200+ students)

```bash
NUM_STUDENTS=200
DRAW_INTERVAL_MS=500
STROKES_PER_DRAW=3
TEST_DURATION_SECONDS=600
```

**Expected:**
- ~120,000 messages in 600 seconds
- 200 messages/second
- Maximum stress test

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

# Test production
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
  - Token Server: http://146.190.100.142/api/token


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
