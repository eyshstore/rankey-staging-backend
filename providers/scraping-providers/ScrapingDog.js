const { ScrapingProvider } = require("./ScrapingProvider");

class ScrapingDog extends ScrapingProvider {
  constructor(apiKey) {
    super("https://api.scrapingdog.com/scrape", { api_key: apiKey, dynamic: false }, {});
  }

  async getPage(url) {
    const data = await super.getPage(url);

    // TODO: browser rendering depending on scraping provider

    if (data) {
      return data;
    }
  }
}

module.exports = { ScrapingDog };
