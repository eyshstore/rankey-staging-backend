/**
 * Amazon API Parser
 *
 * Transforms ScrapingBee Amazon API JSON responses into our database schema format.
 * This parser extracts structured data from the API response and formats it to match
 * the output of the HTML parser (pages-parser.js) for consistency.
 *
 * Key differences from HTML parsing:
 * - No HTML/Cheerio parsing needed - works with clean JSON
 * - More reliable data extraction (no selector changes)
 * - Better location-based pricing (zip_code parameter)
 *
 * Known limitations:
 * - Quantity field not available in API
 * - dateFirstAvailable not available in API
 */

/**
 * Parse Amazon API response into database schema
 * @param {object} apiResponse - The JSON response from ScrapingBee Amazon API
 * @param {object} logger - Optional logger instance
 * @returns {object} Product data in database schema format
 */
function parseAmazonApiData(apiResponse, logger = null) {
  if (logger) {
    logger.log('AMAZON-API-PARSE', 'Starting API response parsing', {
      hasData: !!apiResponse,
      keys: apiResponse ? Object.keys(apiResponse).slice(0, 20) : []
    });
  }

  const product = {
    scrapeMethod: 'amazon-api',
    scrapedAt: new Date(),
    apiVersion: 'v1'
  };

  // Extract all fields
  product.title = extractTitle(apiResponse, logger);
  product.price = extractPrice(apiResponse, logger);
  product.brand = extractBrand(apiResponse, logger);
  product.category = extractCategory(apiResponse, logger);
  product.rank = extractRank(apiResponse, logger);
  product.discountCoupon = extractCoupon(apiResponse, logger);
  product.ratingStars = extractRating(apiResponse, logger);
  product.reviewsCount = extractReviewsCount(apiResponse, logger);
  product.availabilityStatus = extractAvailability(apiResponse, logger);
  product.isPrime = extractPrime(apiResponse, logger);
  product.color = extractColor(apiResponse, logger);
  product.size = extractSize(apiResponse, logger);
  product.productLink = extractProductLink(apiResponse, logger);
  product.images = extractImages(apiResponse, logger);

  // Fields not available in Amazon API
  product.availabilityQuantity = null;
  product.dateFirstAvailable = null;
  product.purchaseInfo = 'none';
  product.proxyCountry = 'US'; // Always US when using zip_code

  if (logger) {
    logger.log('AMAZON-API-PARSE-COMPLETE', 'Parsing complete', {
      hasTitle: !!product.title,
      hasPrice: !!product.price,
      hasBrand: !!product.brand,
      hasCategory: !!product.category,
      hasRank: !!product.rank,
      hasCoupon: product.discountCoupon !== 'none',
      isPrime: product.isPrime
    });
  }

  return product;
}

/**
 * Extract product title
 */
function extractTitle(apiResponse, logger = null) {
  const title = apiResponse.title || null;

  if (logger) {
    logger.log('AMAZON-API-FIELD', 'Extracting title', {
      found: !!title,
      value: title ? title.substring(0, 100) : null
    });
  }

  return title;
}

/**
 * Extract price with multiple fallbacks
 * Converts number to "$X.XX" format to match HTML parser
 */
function extractPrice(apiResponse, logger = null) {
  // Try multiple price sources with fallback
  const rawPrice =
    (apiResponse.buybox && apiResponse.buybox[0]?.price) ||  // Try buybox first
    apiResponse.price_buybox ||                               // Fallback 1
    apiResponse.price ||                                       // Fallback 2
    null;                                                      // If all fail

  if (logger) {
    logger.log('AMAZON-API-FIELD', 'Extracting price', {
      buyboxPrice: apiResponse.buybox?.[0]?.price,
      price_buybox: apiResponse.price_buybox,
      price: apiResponse.price,
      selected: rawPrice
    });
  }

  if (!rawPrice || typeof rawPrice !== 'number' || rawPrice <= 0) {
    if (logger) {
      logger.log('AMAZON-API-FIELD', 'No valid price found', { rawPrice });
    }
    return null;
  }

  // Convert to "$X.XX" format (match HTML parser format)
  const formattedPrice = `$${rawPrice.toFixed(2)}`;

  if (logger) {
    logger.log('AMAZON-API-FIELD', 'Price extracted and formatted', {
      rawPrice,
      formattedPrice
    });
  }

  return formattedPrice;
}

/**
 * Extract brand
 */
function extractBrand(apiResponse, logger = null) {
  const brand = apiResponse.brand || null;

  if (logger) {
    logger.log('AMAZON-API-FIELD', 'Extracting brand', {
      found: !!brand,
      value: brand
    });
  }

  return brand;
}

/**
 * Extract category from ladder
 * Joins category names with ", " to match HTML parser format
 */
function extractCategory(apiResponse, logger = null) {
  const categoryData = apiResponse.category;

  if (logger) {
    logger.log('AMAZON-API-FIELD', 'Extracting category', {
      hasCategory: !!categoryData,
      categoryCount: Array.isArray(categoryData) ? categoryData.length : 0
    });
  }

  if (!categoryData || !Array.isArray(categoryData) || categoryData.length === 0) {
    if (logger) {
      logger.log('AMAZON-API-FIELD', 'No category data', { category: null });
    }
    return null;
  }

  const ladder = categoryData[0]?.ladder;

  if (!ladder || !Array.isArray(ladder)) {
    if (logger) {
      logger.log('AMAZON-API-FIELD', 'No ladder in category', { category: null });
    }
    return null;
  }

  // Join category names with ", "
  const category = ladder.map(cat => cat.name).filter(Boolean).join(', ');

  if (logger) {
    logger.log('AMAZON-API-FIELD', 'Category extracted', {
      ladderCount: ladder.length,
      category: category || null
    });
  }

  return category || null;
}

/**
 * Extract Best Seller Rank from primary category
 */
function extractRank(apiResponse, logger = null) {
  const salesRank = apiResponse.sales_rank;

  if (logger) {
    logger.log('AMAZON-API-FIELD', 'Extracting rank', {
      hasSalesRank: !!salesRank,
      rankCount: Array.isArray(salesRank) ? salesRank.length : 0
    });
  }

  if (!salesRank || !Array.isArray(salesRank) || salesRank.length === 0) {
    if (logger) {
      logger.log('AMAZON-API-FIELD', 'No sales rank data', { rank: null });
    }
    return null;
  }

  const rank = salesRank[0]?.rank;

  if (logger) {
    logger.log('AMAZON-API-FIELD', 'Rank extracted', {
      rank,
      category: salesRank[0]?.category || 'unknown'
    });
  }

  return rank || null;
}

/**
 * Extract coupon from coupon field (NOT discount_percentage!)
 * discount_percentage = List Price discount (strikethrough price)
 * coupon = Clippable checkbox coupon
 * Returns "X%" format or "none"
 */
function extractCoupon(apiResponse, logger = null) {
  const couponText = apiResponse.coupon || "";

  if (logger) {
    logger.log('AMAZON-API-FIELD', 'Extracting coupon', {
      couponText,
      discount_percentage: apiResponse.discount_percentage  // For debugging, but NOT used
    });
  }

  if (couponText.trim() === "") {
    if (logger) {
      logger.log('AMAZON-API-FIELD', 'No coupon found', { coupon: 'none' });
    }
    return 'none';
  }

  // Extract percentage from string like "Save 20%"
  const match = couponText.match(/(\d+)%/);
  if (match) {
    const coupon = `${match[1]}%`;
    if (logger) {
      logger.log('AMAZON-API-FIELD', 'Coupon detected', {
        couponText,
        extractedCoupon: coupon
      });
    }
    return coupon;
  }

  // Return as-is if no percentage found
  if (logger) {
    logger.log('AMAZON-API-FIELD', 'Coupon text without percentage', {
      couponText
    });
  }
  return couponText;
}

/**
 * Extract rating stars
 */
function extractRating(apiResponse, logger = null) {
  const rating = apiResponse.rating;

  if (logger) {
    logger.log('AMAZON-API-FIELD', 'Extracting rating', {
      rating,
      ratingType: typeof rating
    });
  }

  return rating || null;
}

/**
 * Extract reviews count
 */
function extractReviewsCount(apiResponse, logger = null) {
  const reviewsCount = apiResponse.reviews_count;

  if (logger) {
    logger.log('AMAZON-API-FIELD', 'Extracting reviews count', {
      reviewsCount,
      reviewsType: typeof reviewsCount
    });
  }

  return reviewsCount || null;
}

/**
 * Extract availability status and clean any HTML/JS contamination
 */
function extractAvailability(apiResponse, logger = null) {
  let stock = apiResponse.stock || "";

  if (logger) {
    logger.log('AMAZON-API-FIELD', 'Extracting availability (raw)', {
      stock: stock.substring(0, 200),
      stockType: typeof stock
    });
  }

  if (!stock || typeof stock !== 'string') {
    return null;
  }

  // Clean any HTML/JS if present
  stock = stock
    .replace(/<[^>]*>/g, "")       // Remove HTML tags
    .replace(/P\.when.*?;/gs, "")  // Remove P.when() JavaScript
    .trim();

  if (logger) {
    logger.log('AMAZON-API-FIELD', 'Availability cleaned', {
      stock: stock || 'Unknown'
    });
  }

  return stock || "Unknown";
}

/**
 * Extract Prime eligibility from is_prime boolean field
 */
function extractPrime(apiResponse, logger = null) {
  // Use the direct boolean field from API
  const isPrime = apiResponse.is_prime === true;

  if (logger) {
    logger.log('AMAZON-API-FIELD', 'Extracting Prime status', {
      is_prime: apiResponse.is_prime,
      isPrime
    });
  }

  return isPrime;
}

/**
 * Extract color from selected variation or product_details
 */
function extractColor(apiResponse, logger = null) {
  let color = null;

  // Try variations first
  const variations = apiResponse.variations;
  if (variations && Array.isArray(variations)) {
    const selectedVariation = variations.find(v => v.selected === true);
    if (selectedVariation && selectedVariation.dimensions) {
      color = selectedVariation.dimensions.Color || null;
    }
  }

  // Fallback to product_details if variations didn't work
  if (!color) {
    const details = apiResponse.product_details || {};
    color = details.color || null;
  }

  if (logger) {
    logger.log('AMAZON-API-FIELD', 'Color extracted', {
      color,
      source: color ? (variations ? 'variations' : 'product_details') : 'none'
    });
  }

  return color;
}

/**
 * Extract size from selected variation or product_details
 */
function extractSize(apiResponse, logger = null) {
  let size = null;

  // Try variations first
  const variations = apiResponse.variations;
  if (variations && Array.isArray(variations)) {
    const selectedVariation = variations.find(v => v.selected === true);
    if (selectedVariation && selectedVariation.dimensions) {
      size = selectedVariation.dimensions.Size || null;
    }
  }

  // Fallback to product_details if variations didn't work
  if (!size) {
    const details = apiResponse.product_details || {};
    size = details.memory_storage_capacity || details.size || null;
  }

  if (logger) {
    logger.log('AMAZON-API-FIELD', 'Size extracted', {
      size,
      source: size ? (variations ? 'variations' : 'product_details') : 'none'
    });
  }

  return size;
}

/**
 * Extract product link
 */
function extractProductLink(apiResponse, logger = null) {
  const url = apiResponse.url || apiResponse.product_link || null;

  if (logger) {
    logger.log('AMAZON-API-FIELD', 'Extracting product link', {
      found: !!url,
      url: url ? url.substring(0, 100) : null
    });
  }

  return url;
}

/**
 * Extract images array
 */
function extractImages(apiResponse, logger = null) {
  const images = apiResponse.images;

  if (logger) {
    logger.log('AMAZON-API-FIELD', 'Extracting images', {
      hasImages: !!images,
      imageCount: Array.isArray(images) ? images.length : 0
    });
  }

  if (!images || !Array.isArray(images) || images.length === 0) {
    if (logger) {
      logger.log('AMAZON-API-FIELD', 'No images', { images: [] });
    }
    return [];
  }

  return images;
}

module.exports = {
  parseAmazonApiData
};
