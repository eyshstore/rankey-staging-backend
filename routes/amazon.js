const express = require("express");
const router = express.Router();

const categoriesHandler = require("../handlers/categories-handler");
const { CategoryModel } = require("../collections/category");

// Domains
const { domainListRouter } = require("./sse/domain-list");
const { domainDetailsRouter } = require("./sse/domain-details");

router.use("/domain-list/events", domainListRouter);
router.use("/domain-details/events", domainDetailsRouter);

router.get("/domains-state", async (_req, res) => {
  return res.status(200).json({ domainsState: categoriesHandler.getDomainsState() });
});

router.get("/domain-details", async (req, res) => {
  const { domain } = req.query;
  try {
    const mainCategoriesState = await categoriesHandler.getMainCategoriesState(domain);
    const breadcrumbs = categoriesHandler.getBreadcrumbs()[domain];
    return res.status(200).json({ breadcrumbs, mainCategoriesState });
  } catch (err) {
    console.error("Request failed: ", err.message);
    return res.status(500).json({ message: "Error fetching regions", error: err.message });
  }
});

router.post("/gather-categories", async (req, res) => {
  const { domain } = req.query;
  const result = await categoriesHandler.startGathering(domain);
  return res.status(result.status).json(result.message);
});

router.get("/main-categories", async (req, res) => {
  const { domain } = req.query;
  let mainCategories = await CategoryModel.find({ isMain: true, state: "completed", domain }).select("_id name").lean();
  return res.status(200).json({ mainCategories });
});

// Scraping Provider
const { scrapingProvidersRouter } = require("./scraping-providers.router");
router.use("/scraping-providers", scrapingProvidersRouter);

// Scans
const { scansRouter } = require("./scans.router");
router.use("/scans", scansRouter);

const { scansListRouter } = require("./sse/scans-list");
const { scanDetailsRouter } = require("./sse/scan-details");
router.use("/scans-list/events", scansListRouter);
router.use("/scan-details/events", scanDetailsRouter);

module.exports = router;