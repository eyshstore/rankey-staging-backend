const { ScanModel } = require('../collections/scan');
const { cleanupOldZips } = require('./debug-html-saver');

const CLEANUP_INTERVAL = 2 * 60 * 60 * 1000; // 2 hours
const ENQUEUED_THRESHOLD = 60 * 60 * 1000; // 1 hour
const ACTIVE_THRESHOLD = 6 * 60 * 60 * 1000; // 6 hours
const HALTING_STALLING_THRESHOLD = 5 * 60 * 1000; // 5 minutes

async function cleanupStuckScans() {
  try {
    console.log('[cleanup] Checking for stuck scans...');

    // Clean up old debug ZIPs (7+ days old)
    cleanupOldZips();

    const now = new Date();
    const oneHourAgo = new Date(Date.now() - ENQUEUED_THRESHOLD);
    const sixHoursAgo = new Date(Date.now() - ACTIVE_THRESHOLD);
    const fiveMinutesAgo = new Date(Date.now() - HALTING_STALLING_THRESHOLD);

    // Find stuck scans in different states
    const stuckEnqueuedScans = await ScanModel.find({
      state: 'enqueued',
      createdAt: { $lt: oneHourAgo }
    }).select('_id state createdAt');

    const stuckActiveScans = await ScanModel.find({
      state: 'active',
      startedAt: { $lt: sixHoursAgo }
    }).select('_id state startedAt');

    const stuckHaltingStalling = await ScanModel.find({
      state: { $in: ['halting', 'stalling'] },
      updatedAt: { $lt: fiveMinutesAgo }
    }).select('_id state updatedAt');

    const allStuckScans = [...stuckEnqueuedScans, ...stuckActiveScans, ...stuckHaltingStalling];

    if (allStuckScans.length === 0) {
      console.log('[cleanup] No stuck scans found');
      return;
    }

    // Log found scans
    console.log(`[cleanup] Found ${allStuckScans.length} stuck scans:`);
    console.log(`[cleanup] - Enqueued > 1hr: ${stuckEnqueuedScans.length}`);
    console.log(`[cleanup] - Active > 6hrs: ${stuckActiveScans.length}`);
    console.log(`[cleanup] - Halting/Stalling > 5min: ${stuckHaltingStalling.length}`);

    // Update each scan and log individually
    for (const scan of allStuckScans) {
      const stuckSince = scan.startedAt || scan.createdAt || scan.updatedAt;
      const stuckMinutes = Math.floor((Date.now() - new Date(stuckSince).getTime()) / 60000);

      await ScanModel.updateOne(
        { _id: scan._id },
        {
          state: 'failed',
          completedAt: now
        }
      );

      console.log(`[cleanup] ✓ Updated scan ${scan._id} from ${scan.state} to failed (stuck for ${stuckMinutes} minutes)`);
    }

  } catch (error) {
    console.error('[cleanup] Error during scan cleanup:', error);
  }
}

function startCleanupJob() {
  console.log('[cleanup] 🔄 Starting scan cleanup job (runs every 2 hours)');

  // Run immediately on startup
  cleanupStuckScans();

  // Then run every 2 hours
  setInterval(cleanupStuckScans, CLEANUP_INTERVAL);
}

module.exports = { startCleanupJob, cleanupStuckScans };
