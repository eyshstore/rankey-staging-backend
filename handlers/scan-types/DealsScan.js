const { Types } = require("mongoose");
const { Scan } = require("./Scan");
const { ScanModel } = require("../../collections/scan");
const { CategoryModel } = require("../../collections/category");

const { notifyScansUpdate } = require("../../routes/sse/scans-list");
const { HttpError } = require("../../utilities/HttpError");

const puppeteer = require("puppeteer");
const { parseProductData } = require("../pages-parser");
const { parseAmazonApiData } = require("../amazon-api-parser");
const { amazonApiScraper } = require("../amazon-api-scraper");
const { getScrapingProviderManager } = require("../../providers/ScrapingProviderManager");
const ScanLogger = require("../../utilities/logger");
const fs = require('fs');
const path = require('path');

class DealsScan extends Scan {
  constructor() {
    super();
    this.checkedASINs = new Set();
    this.productsQueue = [];
    this.productsGathered = 0;
    this.concurrentRequestsOccupied = 0;
    this.productPagesRequestsSucceeded = 0;
    this.productASINsBeingRequested = new Set();
    this.completedGatheringASINs = false;
    this.logger = null;
    this.debugHtmlDir = null;

    this.handleProductPageSuccess = this.handleProductPageSuccess.bind(this);
    this.handleProductPageError = this.handleProductPageError.bind(this);
  }

  static async validate(config) {
    super.validate(config);

    if (config.mainCategoryId) {
      const mainCategory = await CategoryModel.findOne({ _id: config.mainCategoryId, isMain: true }, { _id: 1, nodeId: 1, }).lean();
      if (!mainCategory) {
        throw new HttpError(404, `Main category with node id ${config.nodeId} doesn't exist`);
      }
      config.mainCategoryNodeId = mainCategory.nodeId;
    }

    if (!config.numberOfProductsToGather || config.numberOfProductsToGather < 1) {
      throw new HttpError(400, "Number of products to check must be at least 1");
    }
  }

  async enqueue(config) {
    await ScanModel.create({
      type: "Deals",
      state: "enqueued",
      domain: config.domain,
      numberOfProductsToGather: config.numberOfProductsToGather,
      maxConcurrentRequests: config.maxConcurrentRequests,
      maxRequests: config.maxRequests,
      maxRerequests: config.maxRerequests,
      useAmazonAPI: config.useAmazonAPI || false,
      mainCategoryId: config.mainCategoryId,
      mainCategoryNodeId: config.mainCategoryNodeId,
    });
    notifyScansUpdate();
    console.log(`📥 Scan enqueued: ${config.numberOfProductsToGather} products from ${config.domain}`);
  }

  async loadAndStart(scanId) {
    const config = await ScanModel.findById(scanId, {
      _id: 1,
      domain: 1,
      mainCategoryId: 1,
      numberOfProductsToGather: 1,
      maxConcurrentRequests: 1,
      createdAt: 1,
      maxRequests: 1,
      maxRerequests: 1,
      useAmazonAPI: 1,
      mainCategoryId: 1,
      mainCategoryNodeId: 1,
    }).lean();

    this.setState("active");
    console.log(`🔄 Loading scan: ${scanId}`);
    this.init(config, config);
    this.scrapeProductASINs();
  }

  async startImmediately(config) {
    const scan = await ScanModel.create({
      type: "Deals",
      state: "active",
      domain: config.domain,
      numberOfProductsToGather: config.numberOfProductsToGather,
      maxConcurrentRequests: config.maxConcurrentRequests,
      maxRequests: config.maxRequests,
      maxRerequests: config.maxRerequests,
      useAmazonAPI: config.useAmazonAPI || false,
      mainCategoryId: config.mainCategoryId,
      mainCategoryNodeId: config.mainCategoryNodeId,
    });

    this.setState("active");
    console.log(`🚀 Scan started: ${scan._id}`);
    this.init(scan, config);
    this.scrapeProductASINs();
  }

  async init(scan, config) {
    this.config = {
      id: scan._id,
      domain: config.domain,
      createdAt: scan.createdAt,
      startedAt: Date.now(),
      numberOfProductsToGather: config.numberOfProductsToGather,
      maxConcurrentRequests: config.maxConcurrentRequests,
      maxRequests: config.maxRequests,
      maxRerequests: config.maxRerequests,
      debugPriceLogging: config.debugPriceLogging || false,
      useAmazonAPI: config.useAmazonAPI || false,

      mainCategoryId: config.mainCategoryId,
      mainCategoryNodeId: config.mainCategoryNodeId,
    };

    console.log(`⚙️ Initializing scan for ${config.numberOfProductsToGather} products on ${config.domain} (mode: ${this.config.useAmazonAPI ? 'amazon-api' : 'html'})`);

    // Initialize logger
    this.logger = new ScanLogger(scan._id, 'DEALS');
    this.logger.log('SCAN', 'Starting deals scan', {
      scanId: scan._id,
      domain: config.domain,
      debugPriceLogging: this.config.debugPriceLogging,
      numberOfProductsToGather: config.numberOfProductsToGather,
      mainCategoryId: config.mainCategoryId
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
      console.log(`🔧 Max concurrent requests set: ${this.config.maxConcurrentRequests}`);
    }
  }

  async scrapeProductASINs() {
    console.log(`🌐 Starting ASIN scraping...`);
    await this.setupBrowser();
    await this.loadDealsPage();
    await this.gatherASINs();
  }

  async setupBrowser() {
    console.log(`🖥️ Setting up browser...`);
    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
    });

    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 1366, height: 768 });
    console.log(`✅ Browser ready`);
  }

  async loadDealsPage() {
    let url;
    if (this.config.mainCategoryNodeId) {
      url = `https://www.amazon.${this.config.domain}/deals?bubble-id=deals-collection-coupons&discounts-widget="{\"state\":{\"refinementFilters\":{\"departments\":[\"${this.config.mainCategoryNodeId}\"]}},\"version\":1}"`;
    } else {
      url = `https://www.amazon.${this.config.domain}/deals?bubble-id=deals-collection-coupons`;
    }

    console.log(`📄 Loading deals page: ${url}`);
    try {
      await this.page.goto(url, { waitUntil: "networkidle2", timeout: 45000 });
      console.log(`✅ Deals page loaded successfully`);
    } catch (error) {
      console.log(`❌ Error loading deals page: ${error.message}`);
    }
  }

  async resume() {
    console.log(`▶️ Resuming scan: ${this.config.id}`);
    this.setState("active");
    this.startConcurrentProductRequests();
  }

  async gatherASINs() {
    console.log("🔍 Scanning products...");
  
    const maxPageReattempts = 3;
    let pageReattempts = 0;
  
    const delay = (ms) => new Promise(res => setTimeout(res, ms));
  
    const collectNewProducts = async () => {
      const asinData = await this.page.$$eval("[data-asin]", els => {
        return els
          .map(e => {
            const asin = e.getAttribute("data-asin");
            if (!asin) return null;
    
            let discountEl = e.querySelector(".CouponExperienceBadge-module__label_Qzf0b6DKge1SbAxIoQeY");
            let discount = null;
            if (discountEl) {
              discount = discountEl.textContent.trim();
              console.log( `Discount: ${discount}` );
            }
            return { asin, discount };
          })
          .filter(Boolean);
      });
    
      // Filter out ASINs already checked
      const newAsins = asinData.filter(item => !this.checkedASINs.has(item.asin));
    
      return newAsins;
    };
  
    const tryLoadMore = async () => {
      const loadMoreButton = await this.page.$('[data-testid="load-more-view-more-button"]');
      if (loadMoreButton) {
        await loadMoreButton.click();
        console.log("👆 Clicked 'View More'...");
        await delay(3000);
      } else {
        console.log("📜 No 'View More' button found. Scrolling instead...");
        await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight - 2048));
        await delay(3000);
      }
    };
  
    while (
      this.state != "halting" && this.state != "completed" &&
      this.checkedASINs.size < this.config.numberOfProductsToGather
    ) {
      const newProductsOnPage = await collectNewProducts();
      newProductsOnPage.forEach(product => this.checkedASINs.add(product.asin));
      newProductsOnPage.forEach(product => this.productsQueue.push({ ASIN: product.asin, discount: product.discount, rerequests: 0, }));
      this.startConcurrentProductRequests();
  
      console.log(`📊 Gathered ${this.checkedASINs.size}/${this.config.numberOfProductsToGather} ASINs so far.`);
      if (newProductsOnPage.length == 0) {
        pageReattempts += 1;
        console.log(`🔄 No new ASINs on page found. Retry ${pageReattempts} of ${maxPageReattempts}.`);
        if (pageReattempts === maxPageReattempts) {
          console.log("⏹️ Reached maximum page reattempts. Stopping ASIN gathering.");
          break;
        }
      } else {
        pageReattempts = 0;
      }
  
      await tryLoadMore();
    }

    console.log(`✅ ASIN gathering completed. Total: ${this.checkedASINs.size}`);
    this.completedGatheringASINs = true;
    if (this.state != "halting") {
      await this.waitForAllConcurrentRequestsToEnd();
    }
    console.log(`🔒 Closing browser`);
    this.browser.close();
    if (this.state == "halting") {
      this.setState("completed");
    }
  }

  waitForAllConcurrentRequestsToEnd() {
    return new Promise(resolve => {
      this.on("allRequestsCompleted", resolve);
      this.on("halted", resolve);
    });
  }

  startConcurrentProductRequests() {
    while (
      this.state == "active" &&
      this.concurrentRequestsOccupied < this.config.maxConcurrentRequests &&
      this.productsQueue.length > 0 && 
      this.sentRequests < this.config.maxRequests &&
      this.productsGathered < this.config.numberOfProductsToGather
    ) {
      this.concurrentRequestsOccupied += 1;
      const product = this.productsQueue.shift();
      this.requestProductPage(product);
    }
  }

  async requestProductPage(product) {
    const productPageUrl = `https://www.amazon.${this.config.domain}/dp/${product.ASIN}`;
    this.productASINsBeingRequested.add(product.ASIN);
    console.log(`📤 Requesting product page: ${product.ASIN}`);

    this.logger.log('REQUEST', `Requesting product: ${product.ASIN}`, {
      asin: product.ASIN,
      url: productPageUrl,
      discount: product.discount
    });

    if (this.config.useAmazonAPI) {
      await this.requestProductWithAmazonAPI(product);
    } else {
      await this.requestPageWithHtml(productPageUrl, this.handleProductPageSuccess, this.handleProductPageError, product);
    }
  }

  async requestPageWithHtml(url, successCallback, errorCallback, product) {
    const requestedAt = Date.now();
    try {
      this.sentRequests++;
      if (this.sentRequests == this.config.maxRequests) {
        this.setState("halting");
        console.log(`⛔ Max requests reached: ${this.config.maxRequests}`);
      }

      const html = await getScrapingProviderManager().getPage(url);
      const receivedAt = Date.now();

      this.logger.log('RESPONSE', `Product received: ${product.ASIN}`, {
        asin: product.ASIN,
        htmlLength: html?.length || 0,
        responseTime: receivedAt - requestedAt
      });

      // Save HTML if debug mode is enabled
      if (this.config.debugPriceLogging && html && this.debugHtmlDir) {
        const filename = `product_${product.ASIN}.html`;
        const filepath = path.join(this.debugHtmlDir, filename);
        fs.writeFileSync(filepath, html);
        this.logger.log('DEBUG', `HTML saved for product ${product.ASIN}`, {
          filepath,
          size: html.length
        });
      }

      const cheerio = require('cheerio');
      const $ = cheerio.load(html);

      // Not waiting for the handler
      successCallback($, requestedAt, receivedAt, product);
    } catch (err) {
      this.logger.error('REQUEST-ERROR', `Request failed for ${product.ASIN}`, err);
      // Not waiting for the handler
      errorCallback(err, requestedAt, Date.now(), product);
    }
  }

  async handleProductPageSuccess($, requestedAt, receivedAt, product) {
    this.productsGathered += 1;
    this.productPagesRequestsSucceeded += 1;
    console.log(`📈 Product gathered: ${product.ASIN}, total: ${this.productsGathered}/${this.config.numberOfProductsToGather}`);
    this.productASINsBeingRequested.delete(product.ASIN);
    console.log(`✅ Product page success: ${product.ASIN}`);

    this.logger.log('PARSE', `Parsing product data for ${product.ASIN}`);

    const productData = parseProductData($, this.logger);
    productData.discountCoupon = product.discount;

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
      discount: product.discount
    });

    if (this.productsGathered == this.config.numberOfProductsToGather) {
      console.log(`🎉 Target reached! ${this.productsGathered}/${this.config.numberOfProductsToGather} products gathered`);
      this.logger.log('COMPLETE', `Target reached: ${this.productsGathered} products gathered`);
      this.setState("halting");
    }

    this.onRequestEnd();

    this.logger.log('SAVE', `Saving product ${product.ASIN} to database`);
    const productId = await this.recordProductToDb(product.ASIN, { requestedAt, receivedAt, ...productData, sentRequests: product.rerequests + 1 });
    this.logger.log('SAVE', `Product saved: ${product.ASIN}`, { productId: productId.toString() });
    await ScanModel.findByIdAndUpdate(this.config.id, { $addToSet: { products: productId } }).then(() => console.log(`💾 Product ${productId} recorded to scan ${this.config.id}`));
  }

  async handleProductPageError(error, requestedAt, receivedAt, product) {
    this.errorStats = this.errorStats || {};
    this.errorStats[error.statusCode] = (this.errorStats[error.statusCode] || 0) + 1;
    console.log(`❌ Product page error: ${product.ASIN}, status: ${error.statusCode}, error: ${error.message}`);

    this.logger.error('PRODUCT-ERROR', `Failed to process product ${product.ASIN}`, error);
    this.logger.log('ERROR-DETAILS', `Error details for product ${product.ASIN}`, {
      asin: product.ASIN,
      statusCode: error.statusCode,
      errorMessage: error.message,
      rerequests: product.rerequests
    });

    switch (error.statusCode) {
      case 401:
        this.productsQueue.push(product);
        this.setState("stalling");
        console.log(`🛑 Stalling due to 401 error: ${product.ASIN}`);
        break;
      case 429:
        this.productsQueue.push(product);
        if (this.config.maxConcurrentRequests > 1) {
          this.config.maxConcurrentRequests -= 1;
          console.log(`🔄 Reducing max concurrent requests to: ${this.config.maxConcurrentRequests}`);
        }
        break;
      case 404:
      case 410:
        this.recordProductToDb(product.ASIN, { scanId: this.config.id, discountCoupon: product.discount, requestedAt, receivedAt, sentRequests: product.rerequests + 1, status: "absent" });
        console.log(`🗑️ Product absent: ${product.ASIN}, status: ${error.statusCode}`);
        break;
      case 500:
        if (product.rerequests < this.config.maxRerequests) {
          product.rerequests += 1;
          this.productsQueue.push(product);
          console.log(`🔄 Rerequesting product: ${product.ASIN}, attempt: ${product.rerequests}/${this.config.maxRerequests}`);
        }
        this.recordProductToDb(product.ASIN, { scanId: this.config.id, discountCoupon: product.discount, requestedAt, sentRequests: product.rerequests + 1, receivedAt, status: "failed" });
        console.log(`❌ Max rerequests reached for product: ${product.ASIN}`);
        break;
      default:
        this.recordProductToDb(product.ASIN, { scanId: this.config.id, discountCoupon: product.discount, requestedAt, receivedAt, sentRequests: product.rerequests + 1, status: "failed" });
        console.log(`❌ Product page failed: ${product.ASIN}`);
    }

    this.onRequestEnd();
  }

  onRequestEnd() {
    const exceededMaxRequests = this.sentRequests >= this.config.maxRequests;
    const outOfProducts = this.productsQueue.length == 0 && this.completedGatheringASINs;
    if (exceededMaxRequests || outOfProducts) {
      console.log(`🏁 Scan halting - ${exceededMaxRequests ? 'Max requests reached' : 'Out of products'}`);
      this.setState("halting");
    }

    if (this.state == "active" && this.productsQueue.length > 0) {
      const product = this.productsQueue.shift();
      this.requestProductPage(product);
    } else {
      this.concurrentRequestsOccupied -= 1;
      console.log(`✅ Concurrent requests: ${this.concurrentRequestsOccupied}`);
      if (this.concurrentRequestsOccupied == 0) {
        console.log(`✅ All concurrent requests completed`);
        this.emit("allRequestsCompleted");
        switch (this.state) {
          case "halting":
            console.log(`🎊 Scan completed successfully!`);
            const duration = Date.now() - this.config.startedAt;
            this.logger.log('COMPLETE', 'Deals scan completed', {
              totalRequests: this.sentRequests,
              productsGathered: this.productsGathered,
              targetProducts: this.config.numberOfProductsToGather,
              duration: `${Math.round(duration / 1000)}s`
            });

            // Save log file
            const logFile = this.logger.saveToFile();
            console.log(`[DealsScan] Log file saved: ${logFile}`);

            this.setState("completed");
            break;
          case "stalling":
            console.log(`⚠️ Scan stalled`);
            this.logger.log('COMPLETE', 'Scan stalling - waiting for resolution');
            this.setState("stalled");
            break;
        }
      }
    }
  }

  async getActiveScanDetails() {
    let mainCategory = { name: "All" };
    if (this.config.mainCategoryId) {
      mainCategory = await CategoryModel.findById(this.config.mainCategoryId).select("name").lean();
    }
    const details = {
      sentRequests: this.sentRequests,
      mainCategoryName: mainCategory.name,

      productASINsBeingRequested: Array.from(this.productASINsBeingRequested),
      productPagesRequestsSucceeded: this.productPagesRequestsSucceeded,

      productsGathered: this.productsGathered,

      createdAt: this.config.createdAt,
      startedAt: this.config.startedAt,
    };
    return details;
  }

  async recordDetailsToDb() {
    await ScanModel.findByIdAndUpdate(
      this.config.id,
      {
        $set: {
          sentRequests: this.sentRequests,
          productPagesRequestsSucceeded: this.productPagesRequestsSucceeded,
          startedAt: this.config.startedAt,
          completedAt: Date.now(),
        }
      }
    );
  }

  static async getDetailsFromDb(scanId) {
    const [details] = await ScanModel.aggregate([
      { $match: { _id: Types.ObjectId(scanId) } },
      {
        $lookup: {
          from: 'products',
          localField: 'products',
          foreignField: '_id',
          as: 'productDetails'
        }
      },
      {
        $lookup: {
          from: 'categories',
          localField: 'mainCategoryId',
          foreignField: '_id',
          as: 'mainCategory'
        }
      },
      {
        $unwind: { path: "$mainCategory", preserveNullAndEmptyArrays: true }
      },
      {
        $project: {
          sentRequests: 1,
          numberOfProductsToGather: 1,
          productPagesRequestsSucceeded: 1,
          createdAt: 1,
          startedAt: 1,
          completedAt: 1,
          mainCategoryName: { $ifNull: ["$mainCategory.name", "All"] },
          productsGathered: { $size: "$products", },
        }
      }
    ]);

    return details;
  }

  // Amazon API Mode Methods
  async requestProductWithAmazonAPI(product) {
    const requestedAt = Date.now();

    try {
      this.sentRequests++;
      if (this.sentRequests == this.config.maxRequests) {
        this.logger.log('INFO', `Reached max requests limit (${this.config.maxRequests})`);
      }

      this.logger.log('INFO', `Using Amazon API mode for product: ${product.ASIN}`);

      const apiResponse = await amazonApiScraper.scrapeProduct(product.ASIN, {
        zipCode: '10001',
        logger: this.logger
      });

      await this.handleAmazonApiSuccess(apiResponse, product, requestedAt);
    } catch (error) {
      await this.handleAmazonApiError(error, product, requestedAt);
    }
  }

  async handleAmazonApiSuccess(apiResponse, product, requestedAt) {
    const respondedAt = Date.now();
    const parsedProduct = parseAmazonApiData(apiResponse, this.logger);

    if (!parsedProduct) {
      this.logger.log('ERROR', `Failed to parse Amazon API response for ${product.ASIN}`);
      this.productASINsBeingRequested.delete(product.ASIN);
      this.concurrentRequestsOccupied -= 1;
      this.runConcurrentRequest();
      return;
    }

    // Keep the original discount from the deals page
    parsedProduct.discount = product.discount;

    this.logger.log('SUCCESS', `Amazon API request succeeded for ${product.ASIN}`, {
      asin: product.ASIN,
      price: parsedProduct.price,
      discount: parsedProduct.discount,
      responseTime: respondedAt - requestedAt
    });

    const dbProduct = await this.enqueueProduct(parsedProduct);

    // Check if target reached
    if (this.productsGathered == this.config.numberOfProductsToGather) {
      console.log(`🎉 Target reached! ${this.productsGathered}/${this.config.numberOfProductsToGather} products gathered`);
      this.logger.log('COMPLETE', `Target reached: ${this.productsGathered} products gathered`);
      this.setState("halting");
    }

    this.productASINsBeingRequested.delete(product.ASIN);
    this.concurrentRequestsOccupied -= 1;
    this.runConcurrentRequest();

    return dbProduct;
  }

  async handleAmazonApiError(error, product, requestedAt) {
    const respondedAt = Date.now();

    this.logger.log('ERROR', `Amazon API request failed for ${product.ASIN}`, {
      asin: product.ASIN,
      error: error.message,
      responseTime: respondedAt - requestedAt
    });

    this.productASINsBeingRequested.delete(product.ASIN);
    this.concurrentRequestsOccupied -= 1;
    this.runConcurrentRequest();
  }
}

module.exports = { DealsScan };
