const express = require("express");

const scrapingProvidersRouter = express.Router();

const { getAvailableScrapingProviders, renewMockAmazonProvider } = require("../providers/scraping-providers/scraping-providers-registry");
const { getScrapingProviderManager } = require("../providers/ScrapingProviderManager");

scrapingProvidersRouter.post("/key", async (req, res) => {
  const { providerName, apiKey } = req.body;
  
  try {
    getScrapingProviderManager().setApiKey(providerName, apiKey);
    res.status(200).json({ message: `Successfully changed API key of ${providerName}` });
  } catch (error) {
    res.status(error.statusCode).json({ message: error.message });
  }
});

// Setting current scraping provider
scrapingProvidersRouter.post("/select", async (req, res) => {
  const { providerName } = req.body;
  try {
    await getScrapingProviderManager().select(providerName);
    // 200 OK
    res.status(200).json({ message: `Successfully selected ${providerName}` });
  } catch (error) {
    console.log(error.statusCode, error.message, error.code);
    res.status(error.statusCode).json({ message: error.message, code: error.code });
  }
});

scrapingProvidersRouter.get("/", async (_req, res) => {
  const availableScrapingProviders = getAvailableScrapingProviders();
  const selectedScrapingProviderName = getScrapingProviderManager().selectedScrapingProvider.constructor.name;
  res.status(200).send({ availableScrapingProviders, selectedScrapingProviderName });
});

scrapingProvidersRouter.get("/concurrency", (_req, res) => {
  return res.status(200).json({
    selectedScrapingProviderHasConcurrencyInfo: getScrapingProviderManager().selectedScrapingProvider.hasConcurrencyInfo()
  });
});

scrapingProvidersRouter.post("/renew", async (_req, res) => {
  renewMockAmazonProvider();
  res.status(200).send({ message: "Successfully renewed credits" });
});

module.exports = { scrapingProvidersRouter };