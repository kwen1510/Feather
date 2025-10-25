import Ably from 'ably/promises.js';
import dotenv from 'dotenv';

dotenv.config();

// Configuration
const CONFIG = {
  numberOfStudents: parseInt(process.env.NUM_STUDENTS) || 10,
  roomCode: process.env.ROOM_CODE || 'load-test-room',
  drawIntervalMs: parseInt(process.env.DRAW_INTERVAL_MS) || 2000,
  strokesPerDraw: parseInt(process.env.STROKES_PER_DRAW) || 3,
  testDurationSeconds: parseInt(process.env.TEST_DURATION_SECONDS) || 60,
  tokenServerUrl: process.env.TOKEN_SERVER_URL || 'http://localhost:8080/api/token',
};

// Statistics tracking
const stats = {
  totalConnections: 0,
  activeConnections: 0,
  totalMessagesSent: 0,
  totalMessagesReceived: 0,
  errors: 0,
  startTime: null,
};

// Generate random drawing data (matches app's format)
function generateRandomStroke() {
  // Generate 3 points as a flat array [x, y, x, y, x, y]
  const points = [];
  for (let i = 0; i < 3; i++) {
    points.push(Math.random() * 800); // x (match student canvas width)
    points.push(Math.random() * 600); // y (match student canvas height)
  }

  return {
    tool: 'pen',
    points: points,
    color: 'black',
    strokeWidth: 3,
  };
}

// Create a simulated student
async function createStudent(studentId) {
  const clientId = `load-test-student-${studentId}`;

  try {
    // Get auth token
    const tokenUrl = `${CONFIG.tokenServerUrl}?clientId=${clientId}`;
    const response = await fetch(tokenUrl);

    if (!response.ok) {
      throw new Error(`Failed to get token: ${response.status}`);
    }

    const tokenRequest = await response.json();

    // Connect to Ably
    const ably = new Ably.Realtime({
      authCallback: async (tokenParams, callback) => {
        callback(null, tokenRequest);
      },
      clientId: clientId,
    });

    // Wait for connection
    await new Promise((resolve, reject) => {
      ably.connection.on('connected', resolve);
      ably.connection.on('failed', reject);
    });

    stats.totalConnections++;
    stats.activeConnections++;

    console.log(`✅ Student ${studentId} connected (${stats.activeConnections}/${CONFIG.numberOfStudents})`);

    // Get channel (matches the app's channel format)
    const channel = ably.channels.get(`room-${CONFIG.roomCode}`);

    // Subscribe to receive messages from other students and teacher
    channel.subscribe('student-layer', (message) => {
      stats.totalMessagesReceived++;
    });

    channel.subscribe('teacher-layer', (message) => {
      stats.totalMessagesReceived++;
    });

    // Enter presence so teacher can see this student
    await channel.presence.enter();

    console.log(`👋 Student ${studentId} entered presence`);

    // Draw ONE stroke
    const singleStroke = generateRandomStroke();
    await channel.publish('student-layer', {
      lines: [singleStroke],
    });
    stats.totalMessagesSent++;
    console.log(`✏️ Student ${studentId} drew one stroke`);

    // Return cleanup function
    return {
      studentId,
      ably,
      cleanup: () => {
        ably.close();
        stats.activeConnections--;
      },
    };

  } catch (error) {
    stats.errors++;
    console.error(`❌ Student ${studentId} failed to connect:`, error.message);
    return null;
  }
}

// Print statistics
function printStats() {
  const duration = (Date.now() - stats.startTime) / 1000;
  const messagesPerSecond = (stats.totalMessagesSent / duration).toFixed(2);
  const receivedPerSecond = (stats.totalMessagesReceived / duration).toFixed(2);

  console.log('\n📊 Load Test Statistics:');
  console.log('═══════════════════════════════════════');
  console.log(`⏱️  Duration: ${duration.toFixed(1)}s`);
  console.log(`👥 Active Connections: ${stats.activeConnections}/${CONFIG.numberOfStudents}`);
  console.log(`📤 Messages Sent: ${stats.totalMessagesSent} (${messagesPerSecond}/sec)`);
  console.log(`📥 Messages Received: ${stats.totalMessagesReceived} (${receivedPerSecond}/sec)`);
  console.log(`❌ Errors: ${stats.errors}`);
  console.log('═══════════════════════════════════════\n');
}

// Main load test function
async function runLoadTest() {
  console.log('\n🚀 Starting Collaborative Whiteboard Load Test\n');
  console.log('Configuration:');
  console.log(`  - Number of Students: ${CONFIG.numberOfStudents}`);
  console.log(`  - Room Code: ${CONFIG.roomCode}`);
  console.log(`  - Draw Interval: ${CONFIG.drawIntervalMs}ms`);
  console.log(`  - Strokes per Draw: ${CONFIG.strokesPerDraw}`);
  console.log(`  - Test Duration: ${CONFIG.testDurationSeconds}s`);
  console.log(`  - Token Server: ${CONFIG.tokenServerUrl}`);
  console.log('\n');

  stats.startTime = Date.now();

  // Create students in batches to avoid overwhelming the system
  const batchSize = 10; // Increased for 50 students
  const students = [];

  for (let i = 0; i < CONFIG.numberOfStudents; i += batchSize) {
    const batch = [];
    for (let j = 0; j < batchSize && (i + j) < CONFIG.numberOfStudents; j++) {
      batch.push(createStudent(i + j + 1));
    }

    const batchResults = await Promise.all(batch);
    students.push(...batchResults.filter(s => s !== null));
    studentsRef = students; // Update global ref for Ctrl+C handler

    // Small delay between batches
    if (i + batchSize < CONFIG.numberOfStudents) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  console.log(`\n✨ All ${students.length} students connected successfully!\n`);
  console.log(`📡 Students are connected and visible in teacher dashboard`);
  console.log(`⏱️  Test will run for ${CONFIG.testDurationSeconds} seconds...`);
  console.log(`\n💡 To disconnect all students, press Ctrl+C\n`);

  // Print stats periodically
  const statsInterval = setInterval(printStats, 5000);

  // Run for specified duration
  await new Promise(resolve => setTimeout(resolve, CONFIG.testDurationSeconds * 1000));

  // Cleanup
  clearInterval(statsInterval);
  console.log('\n🛑 Stopping load test...\n');

  for (const student of students) {
    student.cleanup();
  }

  // Final stats
  printStats();

  console.log('✅ Load test completed!\n');
  process.exit(0);
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error('Unhandled error:', error);
  stats.errors++;
});

// Handle Ctrl+C gracefully
let studentsRef = [];
process.on('SIGINT', () => {
  console.log('\n\n🛑 Disconnecting all students...\n');
  for (const student of studentsRef) {
    student.cleanup();
  }
  console.log('✅ All students disconnected!\n');
  process.exit(0);
});

// Run the test
runLoadTest().catch(error => {
  console.error('Load test failed:', error);
  process.exit(1);
});
