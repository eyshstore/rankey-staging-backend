const { Scan } = require("./Scan");
const { ScanModel } = require("../../collections/scan");
const { parseProductData } = require("../pages-parser");
const { Types } = require("mongoose");
const { getScrapingProviderManager } = require("../../providers/ScrapingProviderManager");
const { notifyScansUpdate } = require("../../routes/sse/scans-list");
const { HttpError } = require("../../utilities/HttpError");
const ScanLogger = require("../../utilities/logger");
const fs = require('fs');
const path = require('path');

class ASINScan extends Scan {
  constructor() {
    super();
    this.productsQueue = [];
    this.activeASINs = [];
    this.occupiedConcurrentRequests = 0;
    this.config = null;
    this.logger = null;
    this.debugHtmlDir = null;

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
      debugPriceLogging: config.debugPriceLogging || false,
    };
    console.log(`INIT CALLED`);

    // Initialize logger
    this.logger = new ScanLogger(scan._id, 'ASIN');
    this.logger.log('SCAN', 'Starting ASIN scan', {
      scanId: scan._id,
      asins: config.ASINs,
      domain: config.domain,
      debugPriceLogging: this.config.debugPriceLogging,
      maxConcurrentRequests: config.maxConcurrentRequests,
      maxRequests: config.maxRequests,
      maxRerequests: config.maxRerequests
    });

    // Setup debug HTML directory if debug mode is enabled
    if (this.config.debugPriceLogging) {
      this.debugHtmlDir = path.join(__dirname, '../../debug-analysis', scan._id.toString());
      if (!fs.existsSync(this.debugHtmlDir)) {
        fs.mkdirSync(this.debugHtmlDir, { recursive: true });
      }
      this.logger.log('DEBUG', 'Debug HTML directory created', { path: this.debugHtmlDir });
    }

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

      this.logger.log('REQUEST', `Sending request for ASIN: ${product.ASIN}`, {
        asin: product.ASIN,
        url,
        provider: getScrapingProviderManager().selectedScrapingProvider.name,
        rerequests: product.rerequests
      });

      await this.requestPageWithHtml(url, this.handleProductPageSuccess, this.handleProductPageError, product);
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

  async requestPageWithHtml(url, successCallback, errorCallback, ...args) {
    const requestedAt = Date.now();
    try {
      this.sentRequests++;
      console.log(`📤 Sending request: ${this.sentRequests}`);
      if (this.sentRequests == this.config.maxRequests) {
        this.setState("halting");
        console.log(`⛔ Max requests reached: ${this.config.maxRequests}`);
      }

      const html = await getScrapingProviderManager().getPage(url);
      const receivedAt = Date.now();

      this.logger.log('RESPONSE', `Response received for ${args[0].ASIN}`, {
        asin: args[0].ASIN,
        htmlLength: html?.length || 0,
        htmlSample: html?.substring(0, 200),
        responseTime: receivedAt - requestedAt
      });

      // Save HTML if debug mode is enabled
      if (this.config.debugPriceLogging && html && this.debugHtmlDir) {
        const filename = `${args[0].ASIN}.html`;
        const filepath = path.join(this.debugHtmlDir, filename);
        fs.writeFileSync(filepath, html);
        this.logger.log('DEBUG', `HTML saved for ${args[0].ASIN}`, { filepath, size: html.length });
      }

      const cheerio = require('cheerio');
      const $ = cheerio.load(html);

      // Not waiting for the handler
      successCallback($, requestedAt, receivedAt, ...args);
    } catch (err) {
      this.logger.error('REQUEST-ERROR', `Request failed for ${args[0].ASIN}`, err);
      // Not waiting for the handler
      errorCallback(err, requestedAt, Date.now(), ...args);
    }
  }

  async handleProductPageSuccess($, requestedAt, receivedAt, product) {
    this.logger.log('PARSE', `Parsing product data for ${product.ASIN}`);

    const productData = {
      ...parseProductData($),
      requestedAt,
      receivedAt,
      sentRequests: product.rerequests + 1,
    };

    this.logger.log('PARSE', `Parse complete for ${product.ASIN}`, {
      asin: product.ASIN,
      titleFound: !!productData.title,
      title: productData.title || 'EMPTY',
      priceFound: !!productData.price,
      price: productData.price || 'EMPTY',
      brand: productData.brand || 'EMPTY',
      category: productData.category || 'EMPTY',
      rank: productData.rank || 'EMPTY',
      hasCoupon: productData.discountCoupon ? 'YES' : 'NO',
      status: productData.status || 'unknown'
    });

    await this.saveProductData(product.ASIN, productData);
  }

  async handleProductPageError(error, requestedAt, receivedAt, product) {
    const { statusCode } = error;
    console.log(`CONFIG: ${this.config}`);

    this.logger.error('PARSE-ERROR', `Failed to process ${product.ASIN}`, error);
    this.logger.log('ERROR-DETAILS', `Error details for ${product.ASIN}`, {
      asin: product.ASIN,
      statusCode,
      errorMessage: error.message,
      rerequests: product.rerequests
    });

    const errorConfig = {
      scanId: this.config.id,
      status: "failed",
      sentRequests: product.rerequests + 1,
      requestedAt,
      receivedAt,
    };

    switch (statusCode) {
      case 401:
        this.logger.log('ERROR-HANDLING', 'API key issue - stalling scan', { asin: product.ASIN });
        this.productsQueue.push(product);
        return this.setState("stalling");
      case 429:
        this.logger.log('ERROR-HANDLING', 'Rate limit - reducing concurrency', {
          asin: product.ASIN,
          currentConcurrency: this.config.maxConcurrentRequests
        });
        this.productsQueue.push(product);
        this.occupiedConcurrentRequests--;
        if (this.config.maxConcurrentRequests > 1) this.config.maxConcurrentRequests--;
        return;
      case 404:
      case 410:
        this.logger.log('ERROR-HANDLING', 'Product not found', { asin: product.ASIN, statusCode });
        return this.saveProductData(product.ASIN, { ...errorConfig,  status: "absent" });
      case 500:
        if (product.rerequests < this.config.maxRerequests) {
          this.logger.log('ERROR-HANDLING', 'Server error - retrying', {
            asin: product.ASIN,
            rerequests: product.rerequests,
            maxRerequests: this.config.maxRerequests
          });
          product.rerequests++;
          return this.productsQueue.push(product);
        }
        this.logger.log('ERROR-HANDLING', 'Max retries reached - marking as failed', {
          asin: product.ASIN
        });
        return this.saveProductData(product.ASIN, errorConfig);
      default:
        this.logger.log('ERROR-HANDLING', 'Unknown error - marking as failed', {
          asin: product.ASIN,
          statusCode
        });
        return this.saveProductData(product.ASIN, errorConfig);
    }
  }

  async saveProductData(ASIN, productData) {
    this.logger.log('SAVE', `Saving product ${ASIN} to database`, {
      asin: ASIN,
      status: productData.status,
      hasPrice: !!productData.price,
      hasTitle: !!productData.title
    });

    const productId = await this.recordProductToDb(ASIN, productData);

    this.logger.log('SAVE', 'Product saved successfully', {
      asin: ASIN,
      productId: productId.toString()
    });

    await ScanModel.findByIdAndUpdate(this.config.id, { $push: { products: productId } });
  }

  async handleAllRequestsCompleted() {
    if (this.state === "stalling") {
      this.logger.log('COMPLETE', 'Scan stalling - waiting for resolution');
      return this.setState("stalled");
    }

    if (this.state === "halting" || this.productsQueue.length === 0 || this.sentRequests === this.config.maxRequests) {
      const duration = Date.now() - this.config.startedAt;
      const details = await this.getActiveScanDetails();

      this.logger.log('COMPLETE', 'Scan completed', {
        totalRequests: this.sentRequests,
        productsGathered: details.productsGathered,
        totalProducts: details.numberOfProductsToGather,
        duration: `${Math.round(duration / 1000)}s`,
        reason: this.state === "halting" ? "max_requests" : this.productsQueue.length === 0 ? "all_products" : "completed"
      });

      // Save log file
      const logFile = this.logger.saveToFile();
      console.log(`[ASINScan] Log file saved: ${logFile}`);

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