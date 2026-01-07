const { MockAmazonProvider } = require("./MockAmazonProvider");
const { ScrapingBee } = require("./ScrapingBee");
const { ZenScrape } = require("./ZenScrape");

const { HttpError } = require("../../utilities/HttpError");

const scrapingProviders = [
  new MockAmazonProvider(),
  new ScrapingBee(),
];

const getAvailableScrapingProviders = () => scrapingProviders.map(scrapingProvider => ({ name: scrapingProvider.constructor.name, hasApiKey: !!scrapingProvider.apiKey }));

const getScrapingProvider = scrapingProviderName => {
  const scrapingProvider = scrapingProviders.find(scrapingProvider => scrapingProvider.constructor.name === scrapingProviderName);
  if (!scrapingProvider) {
    throw new HttpError(404, `${scrapingProviderName} isn't available`, "WRONG_PROVIDER");
  }
  return scrapingProvider;
}

const renewMockAmazonProvider = () => scrapingProviders[0].renew();

module.exports = { getAvailableScrapingProviders, renewMockAmazonProvider, getScrapingProvider };