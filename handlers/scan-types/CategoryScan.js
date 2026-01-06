const { Types } = require("mongoose");

const { Scan } = require("./Scan");

const { ScanModel } = require("../../collections/scan");
const { CategoryModel } = require("../../collections/category");

const { parseProductData, parseCategoryPage, parseIsLastPage } = require("../pages-parser");
const { getScrapingProviderManager } = require("../../providers/ScrapingProviderManager");
const { notifyScansUpdate } = require("../../routes/sse/scans-list");

const { HttpError } = require("../../utilities/HttpError");

class CategoryScan extends Scan {
  constructor() {
    super();
    // Functional
    this.categoriesConcurrentRequests = 0;
    this.productsConcurrentRequests = 0;
    this.productsGathered = 0;

    this.unscannedCategories = [];
    this.currentlySkippingPages = false;
    this.allCategoriesWereScanned = false;

    this.productsQueue = [];
    this.checkedASINs = new Set();
    this.averageNumberOfProductsOnCategoryPage = 24;

    // Bindings
    this.handleCategoryPageSuccess = this.handleCategoryPageSuccess.bind(this);
    this.handleCategoryPageError = this.handleCategoryPageError.bind(this);
    this.handleProductPageSuccess = this.handleProductPageSuccess.bind(this);
    this.handleProductPageError = this.handleProductPageError.bind(this);

    // Details
    // Only Real-time
    this.categoryPagesBeingRequested = [];
    this.productASINsBeingRequested = [];

    // Persistent
    this.categoryPagesRequestsSent = 0;
    this.categoryPagesRequestsSucceeded = 0;
    this.productPagesRequestsSent = 0;
    this.productPagesRequestsSucceeded = 0;
  }

  getStringSizeInMB(str) {
    const bytes = str.length * 2;
    const megabytes = bytes / (1024 * 1024);
    return megabytes;
  }

  static async validate(config) {
    super.validate(config);

    if (!config.mainCategoryId) {
      throw new HttpError(400, "Category scan requires a valid category ID");
    }

    const mainCategory = await CategoryModel.findOne({ _id: config.mainCategoryId, isMain: true }, { _id: 1 }).lean();
    if (!mainCategory) {
      throw new HttpError(404, `Main category with id ${config.mainCategoryId} doesn't exist`);
    }

    if (!config.numberOfProductsToGather || config.numberOfProductsToGather < 1) {
      throw new HttpError(400, "Number of products to check must be at least 1");
    }

    if (!["breadth-first-start", "breadth-first-end", "depth-first-start", "depth-first-end"].includes(config.strategy)) {
      throw new HttpError(400, "Strategy must be 'breadth-first-start', 'breadth-first-end', 'depth-first-start', or 'depth-first-end'");
    }

    if (config.usePagesSkip) {
      if (config.pagesSkip < 1) {
        throw new HttpError(400, "Pages to skip cannot be negative");
      }
    }

    if (config.minRank < 1 || config.maxRank < config.minRank) {
      throw new HttpError(400, "Invalid rank range: minRank must be at least 1 and maxRank must be greater than or equal to minRank");
    }
  }

  async startImmediately(config) {
    const scan = await ScanModel.create({
      type: "Category",
      state: "enqueued",
      domain: config.domain,
      mainCategoryId: config.mainCategoryId,
      numberOfProductsToGather: config.numberOfProductsToGather,
      strategy: config.strategy,
      usePagesSkip: config.usePagesSkip,
      pagesSkip: config.pagesSkip,
      maxRequests: config.maxRequests,
      maxRerequests: config.maxRerequests,
      minRank: config.minRank,
      maxRank: config.maxRank,
    });

    this.setState("active");
    console.log(`🚀 Scan started: ${scan._id}`);
    this.init(scan, config).then(() => {
      this.startConcurrentRequests();
    });
  }

  async enqueue(config) {
    await ScanModel.create({
      type: "Category",
      state: "enqueued",
      domain: config.domain,
      mainCategoryId: config.mainCategoryId,
      numberOfProductsToGather: config.numberOfProductsToGather,
      strategy: config.strategy,
      usePagesSkip: config.usePagesSkip,
      pagesSkip: config.pagesSkip,
      minRank: config.minRank,
      maxRank: config.maxRank,
      maxConcurrentRequests: config.maxConcurrentRequests,
      maxRequests: config.maxRequests,
      maxRerequests: config.maxRerequests,
    });
    notifyScansUpdate();
  }

  async loadAndStart(scanId) {
    const config = await ScanModel.findById(scanId, {
      _id: 1,
      domain: 1,
      mainCategoryId: 1,
      numberOfProductsToGather: 1,
      strategy: 1,
      usePagesSkip: 1,
      pagesSkip: 1,
      minRank: 1,
      maxRank: 1,
      maxConcurrentRequests: 1,
      createdAt: 1,
      maxRequests: 1,
      maxRerequests: 1,
    }).lean();

    this.setState("active");
    console.log(`🔄 Loading scan: ${scanId}`);
    this.init(config, config).then(() => {
      this.startConcurrentRequests();
    });
  }

  async init(scan, config) {
    this.config = {
      id: scan._id,
      domain: config.domain,
      createdAt: scan.createdAt,
      startedAt: Date.now(),
      maxConcurrentRequests: config.maxConcurrentRequests,
      maxRequests: config.maxRequests,
      maxRerequests: config.maxRerequests,

      mainCategoryId: config.mainCategoryId,
      numberOfProductsToGather: config.numberOfProductsToGather,
      strategy: config.strategy,
      usePagesSkip: config.usePagesSkip,
      pagesSkip: config.pagesSkip,
      minRank: config.minRank,
      maxRank: config.maxRank,
    };

    const provider = getScrapingProviderManager().selectedScrapingProvider;
    if (provider.hasConcurrencyInfo()) {
      this.config.maxConcurrentRequests = provider.maxConcurrentRequests;
      console.log(`🔧 Max concurrent requests set: ${this.config.maxConcurrentRequests}`);
    }

    if (this.config.usePagesSkip) {
      this.currentlySkippingPages = true;
      console.log(`⏭️ Page skipping enabled: ${this.config.pagesSkip}`);
    }

    await this.setUnscannedCategories();
  }

  async setUnscannedCategories() {
    this.unscannedCategories = [];
    const visited = new Set();

    const mainCategory = await CategoryModel.findById(
      this.config.mainCategoryId,
      { _id: 1, name: 1, title: 1, nodeId: 1, childNodes: 1 }
    ).lean();

    if (!mainCategory) {
      console.log(`❌ Main category not found: ${this.config.mainCategoryId}`);
      return;
    }

    let nodes = [mainCategory];

    while (nodes.length) {
      const isBreadth = this.config.strategy.startsWith("breadth");
      const isStart = this.config.strategy.endsWith("start");

      const category = isBreadth ? nodes.shift() : nodes.pop();
      if (visited.has(category._id.toString())) continue;
      visited.add(category._id.toString());

      if (!isBreadth) {
        this.unscannedCategories.push({ name: category.name, nodeId: category.nodeId, currentPage: 1, isBeingChecked: false, isChecked: false, wasSkipped: false, rerequests: 0, });
      }

      if (category.childNodes && category.childNodes.length) {
        const subCategories = await CategoryModel.find({ _id: { $in: category.childNodes } }).select("_id name nodeId childNodes").lean();

        if (isStart) {
          nodes.push(...subCategories);
        } else {
          nodes.push(...subCategories.reverse());
        }
      }

      if (isBreadth) {
        this.unscannedCategories.push({ name: category.name, nodeId: category.nodeId, currentPage: 1, isBeingChecked: false, isChecked: false, wasSkipped: false, rerequests: 0, });
      }
    }

    // Removing the main category from the list as they do not contain product ASINs
    this.unscannedCategories = this.unscannedCategories.filter(category => category.nodeId !== mainCategory.nodeId);
    console.log(`📋 Unscanned categories count: ${this.unscannedCategories.length}`);
  }

  async resume() {
    console.log(`▶️ Resuming scan: ${this.config.id}`);
    this.setState("active");
    this.startConcurrentRequests();
  }

  async startConcurrentRequests() {
    this.idleResolvers = [];
    this.tasks = [];
    
    console.log(`🔄 Starting concurrent requests: ${this.config.maxConcurrentRequests}`);
    
    // Spin up workers immediately
    this.concurrentRequests = Array.from(
      { length: this.config.maxConcurrentRequests },
      () => this.startConcurrentRequest()
    );
  
    // Prime the queue
    this.scheduleTasks();
  
    await Promise.all(this.concurrentRequests);
    console.log("🏁 All concurrent requests are completed");
  
    if (this.state == "stalling") {
      this.setState("stalled");
      console.log(`🛑 Scan stalled: ${this.config.id}`);
    } else if (this.state == "halting" || this.unscannedCategories.length == 0) {
      this.setState("completed");
      console.log(`✅ Scan completed: ${this.config.id}`);
    }
  }

  async startConcurrentRequest() {
    while (this.state === "active") {
      const task = await this.getTask();
      if (!task) break; // exit when halting
  
      console.log(`🔄 Processing task: ${task.type}`);
  
      if (task.type === "product") {
        this.productsConcurrentRequests++;
        await this.requestProductPage();
        this.productsConcurrentRequests--;
      } else if (task.type === "category") {
        this.categoriesConcurrentRequests++;
        await this.requestCategoryPage(task.category);
        this.categoriesConcurrentRequests--;
        task.category.isBeingChecked = false;
        console.log(`✅ Category processed: ${task.category.name}`);
      }
  
      this.scheduleTasks();
    }
  }
  

  stopAllConcurrentRequests() {
    this.idleResolvers.forEach(resolve => resolve());
    console.log(`🛑 Stopping all concurrent requests: ${this.idleResolvers.length} resolvers`);
  }

  scheduleTasks() {
    while (this.shouldSendProductPageRequest()) {
      this.scheduleTask({ type: "product" });
    }

    while (this.shouldSendCategoryPageRequest()) {
      const category = this.getUnscannedCategory();
      category.isBeingChecked = true;
      this.scheduleTask({ type: "category", category });
    }
    console.log(`📅 Tasks scheduled: ${this.tasks.length}`);
  }

  scheduleTask(task) {
    this.tasks.push(task);
    console.log(`📌 Task queued: ${task.type}`);

    if (this.idleResolvers.length > 0) {
      const resolve = this.idleResolvers.pop();
      console.log(`🚀 Scheduling task from idle resolver: ${task.type}`);
      resolve(task);
    }
  }

  async getTask() {
    while (true) {
      if (this.state !== "active") {
        return undefined;
      }
      if (this.tasks.length > 0) {
        return this.tasks.pop();
      }
      await new Promise(resolve => this.idleResolvers.push(resolve));
    }
  }

  removeCategory(category) {
    this.unscannedCategories.splice(this.unscannedCategories.indexOf(category), 1);
    console.log(`🗑️ Category removed: ${category.name}`);
  }

  shouldSendProductPageRequest() {
    /*
    const productsSchedulded = this.tasks.reduce((count, task) => count + (task.type === "product" ? 1 : 0), 0);
    const expectedProductsGathered = this.productsGathered + this.productsConcurrentRequests + productsSchedulded;
    const shouldSend = this.productsQueue.length > 0 && expectedProductsGathered < this.config.numberOfProductsToGather;
    console.log(`🔍 Should send product page request: ${shouldSend}, queue length: ${this.productsQueue.length}, expected products: ${expectedProductsGathered}`);
    return shouldSend;
    */
    // Basic lifecycle guards
    if (this.state !== "active") {
      console.log("🔍 Should send product? no — scan not active:", this.state);
      return false;
    }

    if (this.sentRequests >= this.config.maxRequests) {
      console.log("🔍 Should send product? no — maxRequests reached:", this.sentRequests, "/", this.config.maxRequests);
      return false;
    }

    if (!this.productsQueue || this.productsQueue.length === 0) {
      console.log("🔍 Should send product? no — productsQueue empty");
      return false;
    }

    // How many product results we expect to receive if we send more product page requests?
    const scheduledProductTasks = this.tasks.reduce((c, t) => c + (t.type === "product" ? 1 : 0), 0);

    // in-flight product requests are tracked by productsConcurrentRequests
    const expectedProductsIfWeSendMore = this.productsGathered + this.productsConcurrentRequests + scheduledProductTasks;

    if (expectedProductsIfWeSendMore >= this.config.numberOfProductsToGather) {
      console.log("🔍 Should send product? no — expected products would meet/exceed target:", expectedProductsIfWeSendMore, "/", this.config.numberOfProductsToGather);
      return false;
    }

    // Concurrency: do not exceed global concurrency
    const totalInFlight = this.categoriesConcurrentRequests + this.productsConcurrentRequests;
    const totalScheduled = this.tasks.length;
    const usedSlots = totalInFlight + totalScheduled;
    if (usedSlots >= this.config.maxConcurrentRequests) {
      console.log("🔍 Should send product? no — no free concurrency slots:", usedSlots, "/", this.config.maxConcurrentRequests);
      return false;
    }

    console.log("🔍 Should send product? yes — queue length:", this.productsQueue.length, "expectedProducts:", expectedProductsIfWeSendMore, "usedSlots:", usedSlots);
    return true;
  }

  shouldSendCategoryPageRequest() {
    /*
    let productsScheduled = 0;
    let categoriesScheduled = 0;
    this.tasks.forEach((task) => {
      if (task.type === "product") productsScheduled++;
      else if (task.type === "category") categoriesScheduled++;
    });
    // Condition to prevent from initial requests from keep requesting (5 = maxConcurrentRequests)

    const expectedProducts = this.productsGathered + this.productsQueue.length + (this.categoriesConcurrentRequests + categoriesScheduled) * this.averageNumberOfProductsOnCategoryPage + this.productsConcurrentRequests + productsScheduled;
    let expectedProductsExceedsNumberToGather = expectedProducts >= this.config.numberOfProductsToGather;
    console.log(`🔍 Should send category page request: expected products - ${expectedProducts}, to gather: ${this.config.numberOfProductsToGather}, exceeds - ${expectedProductsExceedsNumberToGather}`);
    if (expectedProductsExceedsNumberToGather) {
      return false;
    }
    
    const expectedCategoriesRequests = categoriesScheduled + this.categoriesConcurrentRequests;
    const occupiedConcurrentRequests = this.categoriesConcurrentRequests + this.productsConcurrentRequests;
    const shouldSend = occupiedConcurrentRequests < this.config.maxConcurrentRequests && this.productsQueue.length == 0;
    console.log(`🔍🔍 Should send category page request: occupied concurrent requests - ${occupiedConcurrentRequests}, queue length: ${this.productsQueue.length}, should send: ${shouldSend}`);
    
    return shouldSend;
    */
    if (this.state !== "active") {
      console.log("🔍 Should send category? no — scan not active:", this.state);
      return false;
    }

    if (this.sentRequests >= this.config.maxRequests) {
      console.log("🔍 Should send category? no — maxRequests reached:", this.sentRequests, "/", this.config.maxRequests);
      return false;
    }

    if (!this.unscannedCategories || this.unscannedCategories.length === 0) {
      console.log("🔍 Should send category? no — no unscanned categories");
      return false;
    }

    // If product queue is already large relative to concurrency, avoid fetching more categories
    // Estimate how many products categories in flight/scheduled will produce:
    const scheduledCategoryTasks = this.tasks.reduce((c, t) => c + (t.type === "category" ? 1 : 0), 0);

    // Estimate of products that will be produced by in-flight+scheduled category requests:
    const expectedProductsFromCategories = (this.categoriesConcurrentRequests + scheduledCategoryTasks) * this.averageNumberOfProductsOnCategoryPage;

    // Total expected products we will have if we schedule more categories now:
    const totalExpectedProducts = this.productsGathered + this.productsQueue.length + this.productsConcurrentRequests + expectedProductsFromCategories;

    // If we already expect to meet the target, don't request more categories
    if (totalExpectedProducts >= this.config.numberOfProductsToGather) {
      console.log("🔍 Should send category? no — expected products from current queue and categories already meet/exceed target:", totalExpectedProducts, "/", this.config.numberOfProductsToGather);
      return false;
    }

    // Concurrency check — categories share the same pool
    const totalInFlight = this.categoriesConcurrentRequests + this.productsConcurrentRequests;
    const totalScheduled = this.tasks.length;
    const usedSlots = totalInFlight + totalScheduled;
    if (usedSlots >= this.config.maxConcurrentRequests) {
      console.log("🔍 Should send category? no — no free concurrency slots:", usedSlots, "/", this.config.maxConcurrentRequests);
      return false;
    }

    // Small safety: if productsQueue is already >= maxConcurrentRequests we probably want to process products first
    if (this.productsQueue.length >= this.config.maxConcurrentRequests) {
      console.log("🔍 Should send category? no — productsQueue is already large relative to concurrency slots:", this.productsQueue.length);
      return false;
    }

    console.log("🔍 Should send category? yes — unscanned:", this.unscannedCategories.length, "expectedTotalProducts:", totalExpectedProducts, "usedSlots:", usedSlots);
    return true;
  }

  async requestCategoryPage(category) {
    const categoryPageUrl = `https://www.amazon.${this.config.domain}/s?rh=n:${category.nodeId}&fs=true&page=${category.currentPage}`;
    this.categoryPagesBeingRequested.push({ name: category.name, page: category.currentPage });
    this.categoryPagesRequestsSent += 1;
    console.log(`📤 Requesting category page: ${category.name}, page: ${category.currentPage}`);
    await this.requestPage(categoryPageUrl, this.handleCategoryPageSuccess, this.handleCategoryPageError, category);
  }

  async requestProductPage() {
    const product = this.productsQueue.shift();
    const productPageUrl = `https://www.amazon.${this.config.domain}/dp/${product.ASIN}`;
    this.productASINsBeingRequested.push(product.ASIN);
    this.productPagesRequestsSent += 1;
    console.log(`📤 Requesting product page: ${product.ASIN}`);
    await this.requestPage(productPageUrl, this.handleProductPageSuccess, this.handleProductPageError, product);
  }

  getUnscannedCategory() {
    const unscannedCategory = this.unscannedCategories.find(category => {
      const categoryHasBeenPageSkipped = this.currentlySkippingPages && category.wasSkipped;
      return !categoryHasBeenPageSkipped && !category.isBeingChecked;
    });

    if (!unscannedCategory && this.currentlySkippingPages) {
      this.currentlySkippingPages = false;
      console.log(`🔄 Page skipping completed, selecting first category`);
      return this.unscannedCategories[0];
    }

    console.log(`🔍 Unscanned category: ${unscannedCategory ? unscannedCategory.name : 'none'}`);
    return unscannedCategory;
  }

  handleCategoryPageSuccess($, requestedAt, receivedAt, category) {
    this.categoryPagesBeingRequested.splice(this.categoryPagesBeingRequested.findIndex(c => (c.name == category.name && c.page == c.currentPage)), 1);
    this.categoryPagesRequestsSucceeded += 1;
    console.log(`✅ Category page success: ${category.name}, page: ${category.currentPage}`);

    const { ASINs, proxyCountry } = parseCategoryPage($);

    const uniqueASINs = [...new Set(ASINs)];
    const uncheckedUniqueASINs = uniqueASINs.filter(ASIN => !this.checkedASINs.has(ASIN));
    this.productsQueue.push(...uncheckedUniqueASINs.map(ASIN => ({ ASIN, rerequests: 0 })));
    this.checkedASINs = new Set([...this.checkedASINs, ...uncheckedUniqueASINs]);
    console.log(`📥 Added products to queue: ${uncheckedUniqueASINs.length}`);

    const categoryEntry = { name: category.name, nodeId: category.nodeId, page: category.currentPage, proxyCountry, domain: this.config.domain, sentRequests: category.rerequests + 1, status: "recorded", requestedAt, receivedAt, ASINs, };
    ScanModel.findByIdAndUpdate(this.config.id, { $push: { categories: categoryEntry, } }).then(() => console.log(`Successfully recorded category ${category.name}, page: ${category.currentPage} to scan ${this.config.id}`));

    const isLastPage = parseIsLastPage($);
    if (isLastPage) {
      this.removeCategory(category);
      console.log(`🏁 Last page reached for category: ${category.name}`);
      return;
    }

    const shouldSkip = this.config.usePagesSkip && this.currentlySkippingPages && category.currentPage == this.config.pagesSkip;
    if (shouldSkip) {
      category.wasSkipped = true;
      console.log(`⏭️ Category page skipped: ${category.name}, page: ${category.currentPage}`);
      return;
    }

    category.currentPage += 1;
    console.log(`📄 Advancing to next page: ${category.name}, page: ${category.currentPage}`);
  }

  async rerequestCategoryPage(category, requestedAt, receivedAt) {
    if (category.rerequests < this.config.maxRerequests) {
      category.rerequests += 1;
      console.log(`🔄 Rerequesting category page: ${category.name}, attempt: ${category.rerequests}`);
    } else {
      const { name, nodeId, currentPage } = category;
      const categoryEntry = { name, nodeId, page: currentPage, status: "failed", requestedAt, receivedAt, domain: this.config.domain, sentRequests: category.rerequests + 1, };
      this.removeCategory(category);
      await ScanModel.findByIdAndUpdate(this.config.id, { $push: { categories: categoryEntry } });
      console.log(`❌ Max rerequests reached for category: ${name}`);
    }
  }

  async handleCategoryPageError(error, requestedAt, receivedAt, category) {
    this.errorStats = this.errorStats || {};
    this.errorStats[error.statusCode] = (this.errorStats[error.statusCode] || 0) + 1;
    console.log(`❌ Category page error: ${category.name}, status: ${error.statusCode}, error: ${error}`);

    this.categoryPagesBeingRequested.splice(this.categoryPagesBeingRequested.findIndex(c => (c.name == category.name && c.page == category.currentPage)), 1);

    const categoryEntry = { name: category.name, nodeId: category.nodeId, page: category.currentPage, domain: this.config.domain, sentRequests: category.rerequests + 1, };

    switch (error.statusCode) {
      case 401:
        this.setState("stalling");
        console.log(`🛑 Stalling due to 401 error: ${category.name}`);
        break;
      case 429:
        if (this.config.maxConcurrentRequests > 1) {
          this.config.maxConcurrentRequests -= 1;
          console.log(`🔄 Reducing max concurrent requests to: ${this.config.maxConcurrentRequests}`);
        }
        break;
      case 404:
      case 410:
        this.removeCategory(category);
        await ScanModel.findByIdAndUpdate(this.config.id, { $push: { categories: { ...categoryEntry, requestedAt, receivedAt, status: "absent", } } });
        console.log(`🗑️ Category absent: ${category.name}, status: ${error.statusCode}`);
        break;
      case 500:
        this.rerequestCategoryPage(category, requestedAt, receivedAt);
        break;
      default:
        await ScanModel.findByIdAndUpdate(this.config.id, { $push: { categories: { ...categoryEntry, requestedAt, receivedAt, status: "failed", } } });
        console.log(`❌ Category page failed: ${category.name}`);
        break;
    }
  }

  async handleProductPageSuccess($, requestedAt, receivedAt, product) {
    this.productPagesRequestsSucceeded += 1;
    this.productASINsBeingRequested.splice(this.productASINsBeingRequested.findIndex(productASIN => productASIN == product.ASIN), 1);
    console.log(`✅ Product page success: ${product.ASIN}`);

    const productData = parseProductData($);

    if (productData.rank >= this.config.minRank && productData.rank <= this.config.maxRank) {
      this.productsGathered += 1;
      console.log(`📈 Product gathered: ${product.ASIN}, total: ${this.productsGathered}`);
      if (this.productsGathered == this.config.numberOfProductsToGather) {
        this.setState("halting");
        this.stopAllConcurrentRequests();
        console.log(`⛔ Max products gathered, halting: ${this.productsGathered}`);
      }
    } else {
      console.log(`⚠️ Product ASIN: ${product.ASIN} rank ${productData.rank} outside range ${this.config.minRank}-${this.config.maxRank}, adding to scan`);
    }

    // Record
    const productId = await this.recordProductToDb(product.ASIN, { requestedAt, receivedAt, ...productData, sentRequests: product.rerequests + 1 });
    ScanModel.findByIdAndUpdate(this.config.id, { $addToSet: { products: productId } }).then(() => console.log(`Product ${productId} has been recorded to scan ${this.config.id}`));
  }

  async handleProductPageError(error, requestedAt, receivedAt, product) {
    this.errorStats = this.errorStats || {};
    this.errorStats[error.statusCode] = (this.errorStats[error.statusCode] || 0) + 1;
    console.log(`❌ Product page error: ${product.ASIN}, status: ${error.statusCode}, error: ${error}`);

    this.productASINsBeingRequested.splice(this.productASINsBeingRequested.findIndex(productASIN => productASIN == product.ASIN), 1);

    switch (error.statusCode) {
      case 401:
        this.productsQueue.push(product);
        this.setState("stalling");
        this.stopAllConcurrentRequests();
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
        await this.recordProductToDb(product.ASIN, { scanId: this.config.id, requestedAt, receivedAt, sentRequests: product.rerequests + 1, status: "absent" });
        console.log(`🗑️ Product absent: ${product.ASIN}, status: ${error.statusCode}`);
        break;
      case 500:
        if (product.rerequests < this.config.maxRerequests) {
          product.rerequests += 1;
          this.productsQueue.push(product);
          console.log(`🔄 Rerequesting product: ${product.ASIN}, attempt: ${product.rerequests}`);
          return;
        }
        await this.recordProductToDb(product.ASIN, { scanId: this.config.id, requestedAt, sentRequests: product.rerequests + 1, receivedAt, status: "failed" });
        console.log(`❌ Max rerequests reached for product: ${product.ASIN}`);
        break;
      default:
        await this.recordProductToDb(product.ASIN, { scanId: this.config.id, requestedAt, receivedAt, sentRequests: product.rerequests + 1, status: "failed" });
        console.log(`❌ Product page failed: ${product.ASIN}`);
    }
  }

  async getActiveScanDetails() {
    const mainCategory = await CategoryModel.findById(this.config.mainCategoryId).select("name").lean();
    const details = {
      categoryPagesBeingRequested: this.categoryPagesBeingRequested,
      categoryPagesRequestsSent: this.categoryPagesRequestsSent,
      categoryPagesRequestsSucceeded: this.categoryPagesRequestsSucceeded,
      sentRequests: this.sentRequests,

      maxRank: this.config.maxRank, minRank: this.config.minRank,
      mainCategoryName: mainCategory.name,

      productASINsBeingRequested: this.productASINsBeingRequested,
      productPagesRequestsSent: this.productPagesRequestsSent,
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

          categoryPagesRequestsSent: this.categoryPagesRequestsSent,
          categoryPagesRequestsSucceeded: this.categoryPagesRequestsSucceeded,

          productPagesRequestsSent: this.productPagesRequestsSent,
          productPagesRequestsSucceeded: this.productPagesRequestsSucceeded,

          startedAt: this.config.startedAt,
          completedAt: Date.now(),
        }
      }
    );
    console.log(`📝 Recording scan details: ${this.config.id}`);
  }

  static async getDetailsFromDb(scanId) {
    const [details] = await ScanModel.aggregate([
      { $match: { _id: Types.ObjectId(scanId) } },
      { $lookup: { from: 'products', localField: 'products', foreignField: '_id', as: 'productDetails' } },
      { $lookup: { from: 'categories', localField: 'mainCategoryId', foreignField: '_id', as: 'mainCategory' } },
      {
        $unwind: { path: "$mainCategory", preserveNullAndEmptyArrays: true }
      },
      {
        $project: {
          sentRequests: 1, numberOfProductsToGather: 1, categoryPagesRequestsSent: 1,
          categoryPagesRequestsSucceeded: 1,
          productPagesRequestsSent: 1,
          productPagesRequestsSucceeded: 1,
          minRank: 1, maxRank: 1,
          createdAt: 1, startedAt: 1, completedAt: 1,
          mainCategoryName: "$mainCategory.name",
          productsGathered: {
            $size: {
              $filter: { input: "$productDetails", as: "product", cond: { $and: [{ $gte: ["$$product.rank", "$minRank"] }, { $lte: ["$$product.rank", "$maxRank"] }] } }
            }
          }
        }
      }
    ]);

    return details;
  }

}

module.exports = { CategoryScan };