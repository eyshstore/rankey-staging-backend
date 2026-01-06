const { Scan } = require("./Scan");
const { ScanModel } = require("../../collections/scan");
const { parseProductData } = require("../pages-parser");
const { Types } = require("mongoose");
const { getScrapingProviderManager } = require("../../providers/ScrapingProviderManager");
const { notifyScansUpdate } = require("../../routes/sse/scans-list");
const { HttpError } = require("../../utilities/HttpError");

class ASINScan extends Scan {
  constructor() {
    super();
    this.productsQueue = [];
    this.activeASINs = [];
    this.occupiedConcurrentRequests = 0;
    this.config = null;

    this.handleProductPageSuccess = this.handleProductPageSuccess.bind(this);
    this.handleProductPageError = this.handleProductPageError.bind(this);
  }

  static validate(config) {
    super.validate(config);
    if (!Array.isArray(config.ASINs) || config.ASINs.length === 0) {
      throw new HttpError(400, "ASIN scan requires at least one ASIN");
    }
    const invalidAsins = config.ASINs.filter(a => !/^[A-Z0-9]{10}$/.test(a));
    if (invalidAsins.length) {
      throw new HttpError(400, `Invalid ASINs: ${invalidAsins.join(", ")}`);
    }
    config.ASINs = [...new Set(config.ASINs)];
  }

  async startImmediately(config) {
    const scan = await this.createScan(config);
    this.init(scan, config);
    this.setState("active");
    this.startConcurrentRequests();
  }

  async enqueue(config) {
    await ScanModel.create({
      type: "ASIN",
      state: "enqueued",
      domain: config.domain,
      ASINs: config.ASINs,
      numberOfProductsToGather: config.ASINs.length,
      maxConcurrentRequests: config.maxConcurrentRequests,
      maxRequests: config.maxRequests,
      maxRerequests: config.maxRerequests,
    });
    notifyScansUpdate();
  }

  async loadAndStart(scanId) {
    const config = await ScanModel.findById(scanId, {
      _id: 1, ASINs: 1, domain: 1, maxConcurrentRequests: 1,
      createdAt: 1, maxRequests: 1, maxRerequests: 1,
    }).lean();

    if (!config) throw new HttpError(404, `Scan ${scanId} not found`);

    this.init(config, config);
    this.setState("active");
    this.startConcurrentRequests();
  }

  init(scan, config) {
    this.config = {
      id: scan._id,
      domain: config.domain,
      createdAt: scan.createdAt,
      startedAt: Date.now(),
      maxConcurrentRequests: config.maxConcurrentRequests,
      maxRequests: config.maxRequests,
      maxRerequests: config.maxRerequests,
    };
    console.log(`INIT CALLED`);

    const provider = getScrapingProviderManager().selectedScrapingProvider;
    if (provider.hasConcurrencyInfo()) {
      this.config.maxConcurrentRequests = provider.maxConcurrentRequests;
    }

    this.productsQueue = config.ASINs.map(ASIN => ({ ASIN, rerequests: 0 }));
  }

  resume() {
    this.setState("active");
    this.startConcurrentRequests();
  }

  startConcurrentRequests() {
    for (let i = 0; i < this.config.maxConcurrentRequests; i++) {
      this.runConcurrentRequest();
    }
  }

  async runConcurrentRequest() {
    this.occupiedConcurrentRequests++;

    while (this.shouldGetPage()) {
      const product = this.productsQueue.pop();
      const url = `https://www.amazon.${this.config.domain}/dp/${product.ASIN}`;
      this.activeASINs.push(product.ASIN);
      await this.requestPage(url, this.handleProductPageSuccess, this.handleProductPageError, product);
      this.activeASINs = this.activeASINs.filter(a => a !== product.ASIN);
    }

    this.occupiedConcurrentRequests--;

    if (this.occupiedConcurrentRequests === 0) {
      await this.handleAllRequestsCompleted();
    }
  }

  shouldGetPage() {
    return this.state === "active" && this.productsQueue.length > 0 && this.sentRequests < this.config.maxRequests;
  }

  async handleProductPageSuccess($, requestedAt, receivedAt, product) {
    const productData = {
      ...parseProductData($),
      requestedAt,
      receivedAt,
      sentRequests: product.rerequests + 1,
    };
    await this.saveProductData(product.ASIN, productData);
  }

  async handleProductPageError(error, requestedAt, receivedAt, product) {
    const { statusCode } = error;
    console.log(`CONFIG: ${this.config}`);
    const errorConfig = {
      scanId: this.config.id,
      status: "failed",
      sentRequests: product.rerequests + 1,
      requestedAt,
      receivedAt,
    };

    switch (statusCode) {
      case 401:
        this.productsQueue.push(product);
        return this.setState("stalling");
      case 429:
        this.productsQueue.push(product);
        this.occupiedConcurrentRequests--;
        if (this.config.maxConcurrentRequests > 1) this.config.maxConcurrentRequests--;
        return;
      case 404:
      case 410:
        return this.saveProductData(product.ASIN, { ...errorConfig,  status: "absent" });
      case 500:
        if (product.rerequests < this.config.maxRerequests) {
          product.rerequests++;
          return this.productsQueue.push(product);
        }
        return this.saveProductData(product.ASIN, errorConfig);
      default:
        return this.saveProductData(product.ASIN, errorConfig);
    }
  }

  async saveProductData(ASIN, productData) {
    const productId = await this.recordProductToDb(ASIN, productData);
    await ScanModel.findByIdAndUpdate(this.config.id, { $push: { products: productId } });
  }

  async handleAllRequestsCompleted() {
    if (this.state === "stalling") {
      return this.setState("stalled");
    }

    if (this.state === "halting" || this.productsQueue.length === 0 || this.sentRequests === this.config.maxRequests) {
      this.setState("completed");
    }
  }

  async createScan(config) {
    return ScanModel.create({
      type: "ASIN",
      state: "active",
      domain: config.domain,
      maxRequests: config.maxRequests,
      maxRerequests: config.maxRerequests,
      maxConcurrentRequests: config.maxConcurrentRequests,
      numberOfProductsToGather: config.ASINs.length,
    });
  }

  async getActiveScanDetails() {
    const [result] = await ScanModel.aggregate([
      { $match: { _id: Types.ObjectId(this.config.id) } },
      { $project: { productsGathered: { $size: "$products" }, createdAt: 1, startedAt: 1, numberOfProductsToGather: 1 } },
    ]);
    return {
      ASINsRequests: this.activeASINs,
      sentRequests: this.sentRequests,
      numberOfProductsToGather: result?.numberOfProductsToGather,
      productsGathered: result?.productsGathered,
      createdAt: result?.createdAt,
      startedAt: result?.startedAt,
    };
  }

  async recordDetailsToDb() {
    await ScanModel.findByIdAndUpdate(this.config.id, {
      $set: { sentRequests: this.sentRequests, completedAt: Date.now(), startedAt: this.config.startedAt, },
    });
  }

  static async getDetailsFromDb(scanId) {
    const [result] = await ScanModel.aggregate([
      { $match: { _id: Types.ObjectId(scanId) } },
      { $project: { productsGathered: { $size: "$products" }, createdAt: 1, startedAt: 1, completedAt: 1, sentRequests: 1, numberOfProductsToGather: 1 } },
    ]);
    return {
      sentRequests: result?.sentRequests,
      numberOfProductsToGather: result?.numberOfProductsToGather,
      productsGathered: result?.productsGathered,
      createdAt: result?.createdAt,
      startedAt: result?.startedAt,
      completedAt: result?.completedAt,
    };
  }
}

module.exports = { ASINScan };