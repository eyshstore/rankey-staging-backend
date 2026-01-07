const { getScrapingProvider } = require("./scraping-providers/scraping-providers-registry");

const { MockAmazonProvider } = require("./scraping-providers/MockAmazonProvider");

const { HttpError } = require("../utilities/HttpError");
const { ScanModel } = require("../collections/scan");

class ScrapingProviderManager {
  constructor() {
    const scrapingBeeApiKey = process.env.SCRAPINGBEE_API_KEY;

    if (scrapingBeeApiKey) {
      try {
        const scrapingBee = getScrapingProvider('ScrapingBee');
        scrapingBee.setApiKey(scrapingBeeApiKey);
        this.selectedScrapingProvider = scrapingBee;
        console.log('✓ Initialized with ScrapingBee provider');
      } catch (error) {
        console.warn('⚠ Failed to initialize ScrapingBee, falling back to MockAmazonProvider:', error.message);
        this.selectedScrapingProvider = getScrapingProvider(MockAmazonProvider.name);
      }
    } else {
      console.log('ℹ No SCRAPINGBEE_API_KEY found, using MockAmazonProvider');
      this.selectedScrapingProvider = getScrapingProvider(MockAmazonProvider.name);
    }
  }

  setApiKey(scrapingProviderName, apiKey) {
    getScrapingProvider(scrapingProviderName).setApiKey(apiKey);
  }

  async select(scrapingProviderName) {
    const scan = await ScanModel.findOne(
      { state: { $in: ["active", "stalling", "stalled", "halting"] } },
      { _id: 1 }
    ).lean();
    if (scan) {
      throw new HttpError(400, "Cannot change scraping provider - there's an active scan running");
    }

    const scrapingProvider = getScrapingProvider(scrapingProviderName);
    if (!scrapingProvider.apiKey) {
      throw new HttpError(400, `${scrapingProviderName} doesn't have API key`, "NO_API_KEY");
    }

    await scrapingProvider.updateStatus();

    this.selectedScrapingProvider = scrapingProvider;
  }

  async getPage(url) {
    const result = await this.selectedScrapingProvider.getPage(url);
    return result;
  }
}

const scrapingProviderManager = new ScrapingProviderManager();

const getScrapingProviderManager = () => scrapingProviderManager;

module.exports = { getScrapingProviderManager };