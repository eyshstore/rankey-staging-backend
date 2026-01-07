const { ScrapingProvider } = require("./ScrapingProvider");

const axios = require('axios');

const { HttpError } = require("../../utilities/HttpError");

class ScrapingBee extends ScrapingProvider {
  constructor() {
    super(
      "https://app.scrapingbee.com/api/v1/",
      { render_js: false },
      {},
      "https://app.scrapingbee.com/api/v1/usage"
    );
  }

  setApiKey(apiKey) {
    super.setApiKey(apiKey);
    this.params.api_key = apiKey;
  }

  async updateStatus() {
    try {
      const response = await axios.get(this.statusApiEndpoint, {
        params: { api_key: this.params.api_key }
      });
      this.maxConcurrentRequests = response.data.max_concurrency;
      console.log(`SET CONCURRENCY OF ${this.constructor.name} to ${this.maxConcurrentRequests}`);
    } catch (error) {
      delete this.apiKey;
      throw new HttpError(403, "Failed to update ScrapingBee status. Please, try different api key or again in a minute.", "SCRAPING_PROVIDER_ERROR");
    }
  }

}

module.exports = { ScrapingBee };