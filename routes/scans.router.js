const express = require("express");
const { ScanModel } = require("../collections/scan");

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

module.exports = { scansRouter };