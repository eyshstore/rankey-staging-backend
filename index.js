const http = require("http");

const { connectDB } = require('./providers/db');
const { startServer } = require('./app');
const { startCleanupJob } = require('./utilities/scan-cleanup');

init = async () => {
  await connectDB().then(() => console.log('Database ON'));
  await startServer(process.env['PORT']).then(() => console.log(`HTTP server is running on port ${process.env['PORT']}`));

  // Start cleanup job for stuck scans
  startCleanupJob();
};

init();
