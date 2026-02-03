const express = require("express");
const { ScanModel } = require("../collections/scan");
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const scansRouter = express.Router();

const { getScanManager } = require("../handlers/ScanManager");
const { getResult } = require("../handlers/scans-registry");
const { notifyScansUpdate } = require("./sse/scans-list");

scansRouter.get("/", async (req, res) => {
  const { page } = req.query;
  const scans = await getScanManager().getScans(page);
  res.status(200).json(scans);
});

scansRouter.post("/enqueue", async (req, res) => {
  const { config } = req.body;
  try {
    await getScanManager().enqueue(config);
    res.status(200).json({ message: `Successfully enqueued a ${config.scanType} scan.` });
  } catch (error) {
    console.error(error);
    res.status(error.statusCode).json({ message: error.message });
  }
});

scansRouter.post("/resume", (_req, res) => {
  try {
    getScanManager().resume();
    res.status(200).json({ message: `Successfully resumed current scan.` });
  } catch (error) {
    res.status(error.statusCode).json({ message: error.message });
  }
});

scansRouter.post("/halt", (req, res) => {
  try {
    getScanManager().haltCurrentScan();
    res.status(200).json({ message: `Successfully halted current scan.` });
  } catch (error) {
    res.status(error.statusCode).json({ message: error.message });
  }
});

scansRouter.delete("/", async (req, res) => {
  const { scanId } = req.query;
  try {
    await getScanManager().delete(scanId);
    notifyScansUpdate();
    res.status(200).json({ message: `Successfully deleted scan ${scanId}` });
  } catch (error) {
    res.status(error.statusCode).json({ message: error.message });
  }
});

scansRouter.delete("/all", async (req, res) => {
  try {
    await ScanModel.deleteMany({});
    res.status(200).json({ message: `Successfully deleted all scans` });
  } catch (error) {
    res.status(error.statusCode).json({ message: error.message });
  }
});

scansRouter.get("/:scanId/result", async (req, res) => {
  const { scanId } = req.params;
  try {
    const result = await getResult(scanId);
    res.status(200).json(result);
  } catch (error) {
    res.status(error.statusCode).json({ message: error.message });
  }
});

scansRouter.get("/:scanId/details", async (req, res) => {
  const { scanId } = req.params;
  try {
    const details = await getScanManager().getDetails(scanId);
    res.status(200).json({ details });
  } catch (error) {
    console.log(`DETAILS ERROR: ${error}`);
    res.status(error.statusCode).json({ message: error.message });
  }
});

scansRouter.get("/:scanId/download-debug", async (req, res) => {
  const { scanId } = req.params;

  try {
    const debugDir = path.join(__dirname, '../debug-analysis');
    const htmlDir = path.join(debugDir, scanId);
    const logFile = path.join(debugDir, 'logs', `${scanId}.log.json`);

    // Check if any debug files exist
    const htmlDirExists = fs.existsSync(htmlDir);
    const logFileExists = fs.existsSync(logFile);

    if (!htmlDirExists && !logFileExists) {
      return res.status(404).json({
        message: 'No debug files found for this scan. Debug mode may not have been enabled.'
      });
    }

    // Create ZIP with both HTML files and logs
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    });

    res.attachment(`scan-${scanId}-debug.zip`);
    archive.pipe(res);

    // Add HTML files if they exist
    if (htmlDirExists) {
      const files = fs.readdirSync(htmlDir);
      if (files.length > 0) {
        archive.directory(htmlDir, 'html');
        console.log(`[Download Debug] Adding ${files.length} HTML files from ${htmlDir}`);
      }
    }

    // Add log files
    if (logFileExists) {
      const logContent = JSON.parse(fs.readFileSync(logFile, 'utf8'));

      // Add JSON log
      archive.append(JSON.stringify(logContent, null, 2), { name: 'scan.log.json' });

      // Create and add human-readable text log
      const textLog = logContent.logs.map(entry => {
        let line = `[${entry.timestamp}] [${entry.category}]`;
        if (entry.level) line += ` [${entry.level}]`;
        line += ` ${entry.message}`;
        if (entry.data) line += `\n${entry.data}`;
        if (entry.error) line += `\nError: ${entry.error.message}\n${entry.error.stack}`;
        return line;
      }).join('\n\n');
      archive.append(textLog, { name: 'scan.log' });

      console.log(`[Download Debug] Adding log files for scan ${scanId}`);
    }

    archive.finalize();

    console.log(`[Download Debug] Created debug ZIP for scan ${scanId}`);
  } catch (error) {
    console.error(`[Download Debug] Error creating debug ZIP:`, error);
    res.status(500).json({ message: 'Error creating debug archive', error: error.message });
  }
});

module.exports = { scansRouter };