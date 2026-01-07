const axios = require("axios");

class ScrapingProvider {
  constructor(scrapingApiEndpoint, params, headers, statusApiEndpoint = "") {
    this.scrapingApiEndpoint = scrapingApiEndpoint;
    this.params = params;
    this.headers = headers;
    this.statusApiEndpoint = statusApiEndpoint;
  }

  setApiKey(apiKey) {
    this.apiKey = apiKey;
  }

  async getPage(url) {
    const config = {
      params: { url, ...this.params },
      headers: this.headers
    };
    const response = await axios.get(this.scrapingApiEndpoint, config);
    return response.data;
  }

  hasStatusApiEndpoint() {
    return !!this.statusApiEndpoint;
  }

  hasConcurrencyInfo() {
    return typeof this.maxConcurrentRequests === 'number';
  }
}

module.exports = { ScrapingProvider };