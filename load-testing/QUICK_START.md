# Quick Start - Load Testing

## 3-Minute Setup

### 1. Install

```bash
cd /Users/etdadmin/Desktop/Ably/load-testing
npm install
```

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env` to set:
- `NUM_STUDENTS` - How many students to simulate (default: 10)
- `TOKEN_SERVER_URL` - Your server URL

**For local testing:**
```env
TOKEN_SERVER_URL=http://localhost:8080/api/token
```

**For production testing:**
```env
TOKEN_SERVER_URL=http://146.190.100.142/api/token
```

### 3. Run

```bash
npm start
```

## Watch It Live!

While the test runs, open your whiteboard app:

1. Go to `http://146.190.100.142` (or your server URL)
2. Enter room code: `load-test-room`
3. Choose "Teacher" or "Student"
4. **Watch random strokes appear from all simulated students!**

## Quick Tests

```bash
# Test with 5 students
NUM_STUDENTS=5 npm start

# Test with 50 students for 2 minutes
NUM_STUDENTS=50 TEST_DURATION_SECONDS=120 npm start

# Stress test: 100 students drawing every second
NUM_STUDENTS=100 DRAW_INTERVAL_MS=1000 npm start
```

## What You'll See

```
🚀 Starting Collaborative Whiteboard Load Test

Configuration:
  - Number of Students: 10
  - Room Code: load-test-room
  - Draw Interval: 2000ms
  - Test Duration: 60s

✅ Student 1 connected (1/10)
✅ Student 2 connected (2/10)
...
✅ Student 10 connected (10/10)

✨ All students connected! Starting drawing simulation...

📊 Load Test Statistics:
⏱️  Duration: 5.0s
👥 Active Connections: 10/10
📤 Messages Sent: 25 (5.00/sec)
📥 Messages Received: 225 (45.00/sec)
❌ Errors: 0
```

## Configuration Options

| Variable | Default | Description |
|----------|---------|-------------|
| `NUM_STUDENTS` | 10 | Number of simulated students |
| `ROOM_CODE` | load-test-room | Room to join |
| `DRAW_INTERVAL_MS` | 2000 | How often to draw (ms) |
| `STROKES_PER_DRAW` | 3 | Strokes per draw |
| `TEST_DURATION_SECONDS` | 60 | Test duration |
| `TOKEN_SERVER_URL` | localhost:8080 | Token server URL |

## Troubleshooting

**Can't connect?**
```bash
# Check your server is running
curl http://146.190.100.142/api/token?clientId=test
```

**Want more details?**
Read the full [README.md](README.md)

---

That's it! You're load testing! 🚀
