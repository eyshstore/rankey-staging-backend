const { ScrapingProvider } = require("./ScrapingProvider");

class ScrapeStack extends ScrapingProvider {
  constructor(apiKey) {
    super("https://api.scrapestack.com/scrape", { access_key: apiKey, render_js: 1 }, {});
  }
}

module.exports = { ScrapeStack };
