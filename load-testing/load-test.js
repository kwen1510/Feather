import dotenv from 'dotenv';
import { LoadTestRunner } from './loadTestRunner.js';

dotenv.config();

const rawConfig = {
  numberOfStudents: parseInt(process.env.NUM_STUDENTS, 10),
  roomCode: process.env.ROOM_CODE,
  drawIntervalMs: parseInt(process.env.DRAW_INTERVAL_MS, 10),
  strokesPerDraw: parseInt(process.env.STROKES_PER_DRAW, 10),
  testDurationSeconds: parseInt(process.env.TEST_DURATION_SECONDS, 10),
  tokenServerUrl: process.env.TOKEN_SERVER_URL,
  rampUpBatchSize: parseInt(process.env.RAMP_UP_BATCH_SIZE, 10),
  rampUpDelayMs: parseInt(process.env.RAMP_UP_DELAY_MS, 10),
  statsIntervalMs: parseInt(process.env.STATS_INTERVAL_MS, 10),
  preset: process.env.TEST_PRESET,
};

const presetKey = rawConfig.preset;
const configOverrides = Object.fromEntries(
  Object.entries(rawConfig)
    .filter(([key, value]) => key !== 'preset' && value !== undefined && value !== null && !Number.isNaN(value)),
);

const runner = new LoadTestRunner();

runner.on('state', (payload) => {
  console.log(`🔄 State: ${payload.state}`);
});

runner.on('stats', (payload) => {
  const { stats } = payload;
  if (!stats || !stats.startTime) {
    return;
  }

  console.log('\n📊 Load Test Statistics:');
  console.log('═══════════════════════════════════════');
  console.log(`⏱️  Duration: ${stats.durationSeconds || 0}s`);
  console.log(`👥 Active Connections: ${stats.activeConnections}/${payload.config.numberOfStudents}`);
  console.log(`📤 Messages Sent: ${stats.totalMessagesSent} (${stats.messagesPerSecond || 0}/sec)`);
  console.log(`📥 Messages Received: ${stats.totalMessagesReceived} (${stats.receivedPerSecond || 0}/sec)`);
  console.log(`🖌️ Draw Actions: ${stats.totalDrawActions}`);
  console.log(`❌ Errors: ${stats.errors}`);
  console.log('═══════════════════════════════════════\n');
});

runner.on('log', (entry) => {
  const icon = entry.level === 'error'
    ? '❌'
    : entry.level === 'warn'
      ? '⚠️'
      : entry.level === 'success'
        ? '✅'
        : 'ℹ️';
  console.log(`${icon} ${entry.message}`);
});

process.on('SIGINT', async () => {
  console.log('\n🛑 Interrupt received. Stopping load test...\n');
  await runner.stop();
  process.exit(0);
});

process.on('unhandledRejection', async (error) => {
  console.error('Unhandled error:', error);
  await runner.stop();
  process.exit(1);
});

runner.start(configOverrides, presetKey).catch(async (error) => {
  console.error('Load test failed:', error);
  await runner.stop();
  process.exit(1);
});
