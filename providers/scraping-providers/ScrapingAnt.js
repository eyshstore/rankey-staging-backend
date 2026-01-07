const { ScrapingProvider } = require("./ScrapingProvider");

class ScrapingAnt extends ScrapingProvider {
  constructor(apiKey) {
    super("https://api.scrapingant.com/v1/general", {}, { "x-api-key": apiKey });
  }

  async getPage(url) {
    const data = await super.getPage(url);
    if (data) {
      console.log(`The received [${url}] page's length: ${data.content.length}`);
      return data.content;
    } else {
      console.log(`The received [${url}] page has no content.`);
    }
  }
}

module.exports = { ScrapingAnt };
