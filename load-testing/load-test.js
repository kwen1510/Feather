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

    // Return student object with drawing capability
    return {
      studentId,
      clientId,
      ably,
      channel,
      lines: [], // Track cumulative strokes
      drawStroke: async function() {
        const newStroke = generateRandomStroke();
        this.lines.push(newStroke);
        await this.channel.publish('student-layer', {
          lines: this.lines,
          clientId: this.clientId,
        });
        stats.totalMessagesSent++;
        console.log(`✏️ Student ${this.studentId} drew stroke ${this.lines.length} (total: ${this.lines.length})`);
      },
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
  console.log(`\n🎨 Starting drawing sequence: 3 strokes per student with 2s delays\n`);

  // Helper function to draw in batches to avoid rate limit (50 msg/sec)
  const drawInBatches = async (round) => {
    const batchSize = 10; // Draw 10 students at a time
    const delayBetweenBatches = 250; // 250ms between batches

    for (let i = 0; i < students.length; i += batchSize) {
      const batch = students.slice(i, i + batchSize);
      await Promise.all(batch.map(student => student.drawStroke()));
      if (i + batchSize < students.length) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }
  };

  // Round 1: Each student draws 1st stroke
  console.log('📝 Round 1: Drawing first stroke...');
  await drawInBatches(1);
  console.log(`✅ All students drew stroke 1/3\n`);

  // Wait 2 seconds
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Round 2: Each student draws 2nd stroke
  console.log('📝 Round 2: Drawing second stroke...');
  await drawInBatches(2);
  console.log(`✅ All students drew stroke 2/3\n`);

  // Wait 2 seconds
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Round 3: Each student draws 3rd stroke
  console.log('📝 Round 3: Drawing third stroke...');
  await drawInBatches(3);
  console.log(`✅ All students drew stroke 3/3\n`);

  console.log(`🎉 Drawing complete! Each student has 3 strokes (total: ${students.length * 3} strokes)\n`);
  console.log(`⏱️  Students will stay connected for ${CONFIG.testDurationSeconds} seconds...`);
  console.log(`💡 To disconnect all students, press Ctrl+C\n`);

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
