const EventEmitter = require("events");

const { ScanModel } = require("../../collections/scan");
const { ProductModel } = require("../../collections/product");

const { notifyScansUpdate } = require("../../routes/sse/scans-list");

const { HttpError } = require("../../utilities/HttpError");

const { getScrapingProviderManager } = require("../../providers/ScrapingProviderManager");

const cheerio = require("cheerio");

class Scan extends EventEmitter {
  constructor() {
    super();
    this.state = "enqueued";
    this.config = {};
    console.log("[Scan] Constructor initialized with state 'enqueued'");
    this.sentRequests = 0;
    this.stateUpdateQueue = Promise.resolve(); // Queue to prevent setState() race conditions
  }

  async requestPage(url, successCallback, errorCallback, ...args) {
    const requestedAt = Date.now();
    try {
      this.sentRequests++;
      console.log(`📤 Sending request: ${this.sentRequests}`);
      if (this.sentRequests == this.config.maxRequests) {
        this.setState("halting");
        if (this.stopAllConcurrentRequests) {
          this.stopAllConcurrentRequests();
        }
        console.log(`⛔ Max requests reached: ${this.config.maxRequests}`);
      }
      let html = await getScrapingProviderManager().getPage(url);
      const $ = cheerio.load(html);
      html = null;
      // Not waiting for the handler
      successCallback($, requestedAt, Date.now(), ...args);
    } catch (err) {
      // Not waiting for the handler
      errorCallback(err, requestedAt, Date.now(), ...args);
    }
  }

  static validate(config) {
    console.log("[validate] Starting scan config validation...", config);

    // Max Concurrent Requests
    if (getScrapingProviderManager().selectedScrapingProvider.hasConcurrencyInfo()) {
      console.log("Scan -> [validate] ℹ️ Validation: Scraping provider has concurrency info, skipping maxConcurrentRequests check");
    } else if (!config.maxConcurrentRequests || typeof config.maxConcurrentRequests !== "number" || config.maxConcurrentRequests < 1) {
      console.log(`[validate] ❌ Validation failed: Invalid maxConcurrentRequests: ${config.maxConcurrentRequests}`);
      throw new HttpError(400, "Max concurrent requests has to be a number 1 or above");
    }

    // Max Rerequests
    if (!config.maxRerequests || typeof config.maxRerequests !== "number" || config.maxRerequests < 0) {
      console.log(`Scan -> [validate] ❌ Validation failed: Invalid maxRerequests: ${config.maxRerequests}`);
      throw new HttpError(400, "maxRerequests has to be a number 0 or above");
    }

    // Max Requests
    if (!config.maxRequests || typeof config.maxRequests !== "number" || config.maxRequests < 1) {
      console.log(`Scan -> [validate] ❌ Validation failed: Invalid maxRequests: ${config.maxRequests}`);
      throw new HttpError(400, "maxRequests has to be a number 1 or above");
    }

    console.log("[validate] ✅ Validation passed");
  }

  async setState(newState) {
    // Queue this update to prevent race conditions
    this.stateUpdateQueue = this.stateUpdateQueue.then(async () => {
      console.log(`[setState] Current state: ${this.state}, New state: ${newState}`);
      if (this.state == "stalling" && newState != "stalled") return;
      if (this.state == "halting" && newState != "completed") return;

      this.state = newState;
      notifyScansUpdate();
      console.log(`[setState] State updated to: ${this.state}`);

      // Build update fields
      const updateFields = { state: newState };

      // Set startedAt timestamp when transitioning to 'active'
      if (newState === "active") {
        updateFields.startedAt = new Date();
        console.log(`[setState] Setting startedAt timestamp`);
      }

      // Set completedAt timestamp when transitioning to terminal states
      if (newState === "completed" || newState === "failed") {
        updateFields.completedAt = new Date();
        console.log(`[setState] Setting completedAt timestamp`);
      }

      // Persist state to database for ALL state changes
      try {
        console.log(`[setState] Persisting state '${newState}' to database for scan ${this.config.id}`);
        await ScanModel.findByIdAndUpdate(this.config.id, { $set: updateFields });
        console.log(`[setState] Successfully updated database with state '${newState}'`);
      } catch (error) {
        console.error(`[setState] ERROR: Failed to update scan state in database:`, error);
        // Continue execution - don't throw, as in-memory state is already updated
      }

      // Special handling for completed state
      if (newState === "completed") {
        console.log("[setState] Emitting 'completed' event");
        await this.recordDetailsToDb();
        this.emit("completed");
      }
    });

    return this.stateUpdateQueue;
  }

  async getState() {
    console.log("[getState] Fetching state from DB for scanId:", this.config.id);
    if (!this.config.id) return "enqueued";
    const scan = await ScanModel.findById(this.config.id, { state: 1 }).lean();
    const state = scan ? scan.state : "enqueued";
    console.log("[getState] Retrieved state:", state);
    return state;
  }

  halt() {
    console.log("[halt] Attempting to halt scan with state:", this.state);
    if (!["active", "stalled"].includes(this.state)) {
      console.log("[halt] ❌ Cannot stop scan - invalid state");
      throw new HttpError(404, `Cannot stop scan ${this.config.id} - it's not active nor stalled.`);
    }
    console.log("[halt] Scan halted successfully");
    this.emit("halted");
    if (this.state === "active") return this.setState("halting");
    if (this.state === "stalled") return this.setState("completed");
  }

  async recordProductToDb(ASIN, data) {
    console.log("[recordProductToDb] Recording product", ASIN, "to DB");

    const existingProduct = await ProductModel.findOne({ ASIN, domain: this.config.domain }).lean();

    let changeHistoryEntry = null;
    let productId;

    if (existingProduct) {
      const changedFields = [];
      const fieldsToCompare = [
        "title",
        "price",
        "category",
        "isPrime",
        "brand",
        "rank",
        "availabilityQuantity",
        "availabilityStatus",
        "color",
        "size",
        "dateFirstAvailable",
        "discountCoupon",
        "ratingStars",
        "purchaseInfo",
      ];

      for (const field of fieldsToCompare) {
        const oldValue = existingProduct[field];
        const newValue = data[field];
        if (oldValue !== newValue && !(oldValue === undefined && newValue === null)) {
          changedFields.push({ field, oldValue, newValue });
        }
      }

      changeHistoryEntry = {
        scanId: this.config.id,
        changedFields,
        status: "recorded",
        requestedAt: data.requestedAt,
        receivedAt: data.receivedAt,
      };

      // Update product with new data AND add change history
      await ProductModel.findOneAndUpdate(
        { ASIN, domain: this.config.domain },
        {
          $set: { ...data, ASIN, domain: this.config.domain },  // Overwrite all fields with new data
          $push: { changeHistory: changeHistoryEntry }
        }
      );

      console.log("[recordProductToDb] Updated existing product with new data and change history");
      productId = existingProduct._id;
    } else {
      const product = await ProductModel.create({
        ...data,
        scanId: this.config.id,
        status: "recorded",
        domain: this.config.domain,
        ASIN,
      });

      console.log("[recordProductToDb] Created new product with ID:", product._id);
      productId = product._id;
    }

    return productId;
  }
}

module.exports = { Scan };
