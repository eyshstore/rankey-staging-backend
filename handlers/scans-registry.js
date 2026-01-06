const { ASINScan } = require("./scan-types/ASINScan");
const { CategoryScan } = require("./scan-types/CategoryScan");
const { DealsScan } = require("./scan-types/DealsScan");

const { ScanModel } = require("../collections/scan");

const { HttpError } = require("../utilities/HttpError");

const scanTypes = {
  "ASIN": ASINScan,
  "Category": CategoryScan,
  "Deals": DealsScan,
};

const createScanFromType = (scanType) => {
  if (!(scanType in scanTypes)) {
    throw new HttpError(400, `Invalid scan type. Must be one of: ${Object.keys(scanTypes).join(", ")}`);
  }
  return new scanTypes[scanType]();
};

const getResult = async (scanId) => {
  const populatedScan = await ScanModel.findById(scanId)
    .populate({
      path: "products",
      select: "-__v",
    })
    .lean()
    .exec();

  if (!populatedScan) {
    throw new HttpError(404, `Scan ${scanId} not found`);
  }

  const products = populatedScan.products;

  let processedProducts = products.map((product) => {
    const isPrime = product.isPrime ? "Yes" : "No";

    // Sort history by createdAt ascending
    const history = [...product.changeHistory].sort(
      (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
    );

    // Find last change in this scan
    const scanChangeIndex = history
      .map((h) => h.scanId.toString())
      .lastIndexOf(scanId);

    if (product.scanId.toString() == scanId) {
      // Case 1: product created in this scan
      return {
        ...product,
        changedInThisScan: "Created",
        isPrime,
      };
    }

    if (scanChangeIndex == -1) {
      // Case 2: no changes in this scan
      return {
        ...product,
        changedInThisScan: "No",
        isPrime,
      };
    }

    // Case 3: product updated in this scan
    let productState = { ...product, changeHistory: undefined };

    history.slice(0, scanChangeIndex + 1).forEach((entry) => {
      if (entry.status) {
        productState.status = entry.status;
      }
      if (entry.changedFields?.length) {
        for (const change of entry.changedFields) {
          productState[change.field] = change.newValue;
        }
      }
    });

    const changeEntryInThisScan = history[scanChangeIndex];

    productState.changedInThisScan = changeEntryInThisScan.changedFields?.length
      ? "Yes"
      : "No";
    productState.changedFields =
      changeEntryInThisScan.changedFields?.map((cf) => cf.field).join(", ") ||
      "";

    return {
      ...productState,
      isPrime: productState.isPrime ? "Yes" : "No",
    };
  });

  // ✅ Extra ordering step if scan type is "category"
  if (populatedScan.type?.toLowerCase() === "category") {
    const { minRank, maxRank } = populatedScan;

    const inRange = [];
    const outOfRange = [];

    for (const product of processedProducts) {
      if (
        typeof product.rank === "number" &&
        minRank !== undefined &&
        maxRank !== undefined &&
        product.rank >= minRank &&
        product.rank <= maxRank
      ) {
        inRange.push(product);
      } else {
        outOfRange.push(product);
      }
    }

    processedProducts = [...inRange, {}, {}, {}, ...outOfRange];
  }

  const result = {};
  result.products = processedProducts;
  
  if (populatedScan.categories.length) result.categories = populatedScan.categories;

  return result;
};


const getScanTypes = () => scanTypes;

module.exports = { createScanFromType, getResult, getScanTypes };