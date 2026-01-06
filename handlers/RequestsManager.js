const EventEmitter = require("events");
const { getScrapingProviderManager } = require("../providers/ScrapingProviderManager");

class Mutex {
  constructor() {
    this.queue = [];
    this.locked = false;
  }

  async lock() {
    if (!this.locked) {
      this.locked = true;
      return;
    }

    return new Promise(resolve => {
      this.queue.push(resolve);
    });
  }

  unlock() {
    if (this.queue.length > 0) {
      const resolve = this.queue.shift();
      resolve();
    } else {
      this.locked = false;
    }
  }

  async runExclusive(callback) {
    await this.lock();
    try {
      return await callback();
    } finally {
      this.unlock();
    }
  }
}

class RequestsManager extends EventEmitter {
  constructor(maxRequests, maxConcurrentRequests, pageResponseHandler, pageErrorHandler) {
    super();
    this.requestsSent = 0;
    this.maxRequests = maxRequests;
    this.maxConcurrentRequests = maxConcurrentRequests;
    this.pageResponseHandler = pageResponseHandler;
    this.pageErrorHandler = pageErrorHandler;

    this.occupiedConcurrentRequests = 0;
    this.requestsQueue = [];
    this.isHalted = false;

    this._mutex = new Mutex();
  }

  queueRequest(url, ...args) {
    this.requestsQueue.push({ url, args });
    this.tryToStartNextRequest();
  }

  tryToStartNextRequest() {
    this._mutex.runExclusive(async () => {
      console.log(`[RequestsManager] Trying to start requests... Occupied: ${this.occupiedConcurrentRequests}, Queue: ${this.requestsQueue.length}, Halted: ${this.isHalted}`);
      while (
        this.occupiedConcurrentRequests < this.maxConcurrentRequests &&
        this.requestsQueue.length > 0 &&
        this.requestsSent < this.maxRequests &&
        !this.isHalted
      ) {
        const { url, args } = this.requestsQueue.shift();
        console.log(`[RequestsManager] Starting request for URL: ${url}`);
        this.startRequest(url, ...args);
      }
    });
  }

  startRequest(url, ...args) {
    this.occupiedConcurrentRequests += 1;
    
    if (this.requestsSent == this.maxRequests) {
      this.emit("maxRequestsReached");
      this.isHalted = true;
    }

    this.requestsSent += 1;
    this.request(url, ...args);
    this.emit("requestStarted", url, ...args);
  }

  async request(url, ...args) {
    let requestedAt;
    try {
      requestedAt = Date.now();
      const page = await getScrapingProviderManager().getPage(url);
      const receivedAt = Date.now();
      this.occupiedConcurrentRequests -= 1;
      await this.pageResponseHandler(page, requestedAt, receivedAt, ...args);
    } catch (err) {
      const receivedAt = Date.now();
      this.occupiedConcurrentRequests -= 1;
      await this.pageErrorHandler(err, url, requestedAt, receivedAt, ...args);
    } finally {
      this.emit("requestEnded", url, ...args);
      this.endRequest();
    }
  }

  endRequest() {
    console.log(`[RequestsManager] Ended request, Occupied: ${this.occupiedConcurrentRequests}, Queue: ${this.requestsQueue.length}`);

    this.tryToStartNextRequest();

    if (this.occupiedConcurrentRequests == 0) {
      console.log(`[RequestsManager] All requests completed, emitting allRequestsCompleted event`);
      this.emit("allRequestsCompleted");
    }
  }

  halt() {
    console.log(`[RequestsManager] Stopping, current queue length: ${this.requestsQueue.length}, occupied: ${this.occupiedConcurrentRequests}`);
    this.isHalted = true;
  }

  resume() {
    if (!this.isHalted) {
      console.log(`[RequestsManager] Resume called but manager is already running`);
      return;
    }
    console.log(`[RequestsManager] Resuming... Queue length: ${this.requestsQueue.length}, Occupied: ${this.occupiedConcurrentRequests}`);
    this.isHalted = false;
    this.tryToStartNextRequest();
  }

  waitForAllRequestsToComplete() {
    console.log(`[RequestsManager] Waiting for all requests to complete, occupied: ${this.occupiedConcurrentRequests}`);
    if (this.occupiedConcurrentRequests === 0) {
      console.log(`[RequestsManager] No occupied requests, resolving immediately`);
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.once("allRequestsCompleted", () => {
        console.log(`[RequestsManager] All requests completed event received, resolving promise`);
        resolve();
      });
    });
  }
}

module.exports = { RequestsManager };