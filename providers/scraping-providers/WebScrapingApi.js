const { ScrapingProvider } = require("./ScrapingProvider");

class WebScrapingApi extends ScrapingProvider {
  constructor(api_key) {
    super(
      "https://api.webscrapingapi.com/v1",
      { api_key, proxy_type: "datacenter", render_js: 0 },
      {},
      { type: 'query', key: 'api_key' }
    );
    this.api_key = api_key;
  }

  async updateStatus() {
    return { error: 'Status not supported' };
  }
}

module.exports = { WebScrapingApi };
