const { ScrapingProvider } = require("./ScrapingProvider");

const axios = require('axios');

const { HttpError } = require("../../utilities/HttpError");

class ZenScrape extends ScrapingProvider {
  constructor() {
    super(
      "https://app.zenscrape.com/api/v1/get",
      {},
      { apikey: "" },

    );
  }

  setApiKey(value) {
    super.setApiKey(value);
    this.headers.apikey = value;
  }

  async updateStatus() {
    try {
      await axios.get('https://app.zenscrape.com/api/v1/status', {
        headers: { ...this.headers, },
      });
      // TODO: set max concurrent requests
    } catch (error) {
      delete this.apiKey;
      throw new HttpError(403, "Failed to update ZenScrape status. Please, try different api key or again in a minute.", "SCRAPING_PROVIDER_ERROR");
    }
  }
}

module.exports = { ZenScrape };