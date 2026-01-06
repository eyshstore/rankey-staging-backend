const { createScanFromType, getScanTypes } = require("./scans-registry");

const { ScanModel } = require("../collections/scan");
const { HttpError } = require("../utilities/HttpError");
const { notifyScansUpdate } = require("../routes/sse/scans-list");

class ScanManager {
  constructor() {
    this.activeScan = null;
    this.onScanCompleted = this.onScanCompleted.bind(this);
    this.isCreatingScan = false;
  }

  async getScans(page = 1) {
    const limit = 5;
    const skip = (page - 1) * limit;

    // Count total documents
    const totalScans = await ScanModel.countDocuments();
    const totalPages = Math.ceil(totalScans / limit);

    // Fetch scans with pagination
    let scans = await ScanModel.find({}, {
      _id: 1,
      type: 1,
      state: 1,
      domain: 1,
      numberOfProductsToGather: 1,
      maxRequests: 1,
      maxRerequests: 1,
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("mainCategoryId", "_id name")
      .lean();

    if (this.activeScan && this.activeScan.config.id) {
      const target = scans.find(scan => String(scan._id) == String(this.activeScan.config.id));
      if (target) {
        target.state = this.activeScan.state;
      }
    }
    
    return {
      scans: scans.map(scan => ({
        ...scan,
        mainCategory: scan.mainCategoryId,
        mainCategoryId: undefined,
      })),
      totalPages,
    };
  }

  // Modal should close immediately - don't await
  async enqueue(config) {
    // General info
    if (this.isCreatingScan) {
      throw new HttpError(400, "Currently creating a scan from config. Please, try again later.");
    }

    const validDomains = ['com', 'de'];
    if (!validDomains.includes(config.domain)) {
      throw new HttpError(400, "Invalid domain. Must be one of: com, de");
    }

    const scanTypes = getScanTypes();
    if (!(config.type in scanTypes)) {
      throw new HttpError(400, `Invalid type. Must be one of: ${JSON.stringify(scanTypes)}`);
    }

    // Validate data
    await scanTypes[config.type].validate(config);

    console.log(`Enqueue config: ${JSON.stringify(config, null, 2)}`);

    // Create scan
    this.isCreatingScan = true;

    const scan = createScanFromType(config.type);

    if (!this.activeScan) {
      scan.on("completed", this.onScanCompleted);
      await scan.startImmediately(config);
      this.activeScan = scan;
    } else {
      await scan.enqueue(config);
    }

    this.isCreatingScan = false;
  }

  resume() {
    if (!this.activeScan) {
      throw new HttpError(404, "No scan to resume.");
    }

    if (this.activeScan.state !== "stalled") {
      throw new HttpError(400, `Cannot resume scan in state: ${this.activeScan.state}`);
    }

    this.activeScan.resume();
  }

  async delete(scanId) {
    const scan = await ScanModel.findById(scanId, { state: 1 }).lean();
    if (!scan) {
      throw new HttpError(404, `Scan ${scanId} doesn't exist`);
    }
    if (!(["enqueued", "completed"].includes(scan.state))) {
      throw new HttpError(400, `Scan ${scanId} is currently active`);
    }
    await ScanModel.findByIdAndDelete(scanId);
  }

  async onScanCompleted() {
    this.activeScan = null;
    this.isCreatingScan = true;
    const nextScanConfig = await ScanModel.findOne({ state: "enqueued" }).select("_id type").sort({ createdAt: 1 }).lean();
    if (nextScanConfig) {
      const scan = createScanFromType(nextScanConfig.type);
      scan.on("completed", this.onScanCompleted);
      await scan.loadAndStart(nextScanConfig._id);
      this.activeScan = scan;
    }
    this.isCreatingScan = false;
  }

  haltCurrentScan() {
    if (!this.activeScan) {
      throw new HttpError(404, "No active scan to stop");
    }

    this.activeScan.halt();
  }

  async getDetails(scanId) {
    const currentScanIsSelected = this.activeScan && this.activeScan.config && this.activeScan.config.id && this.activeScan.config.id == scanId;
    if (currentScanIsSelected) {
      const details = await this.activeScan.getActiveScanDetails();
      return details;
    }

    const details = await this.getDetailsFromDb(scanId);
    return details;
  }

  async getDetailsFromDb(scanId) {
    const scan = await ScanModel.findById(scanId, { type: 1 }).lean();
    if (!scan) {
      throw new HttpError(404, `Scan ${scanId} doesn't exist.`);
    }
    return getScanTypes()[scan.type].getDetailsFromDb(scanId);
  }
}

const scanManager = new ScanManager();

const getScanManager = () => scanManager;

module.exports = { getScanManager };
