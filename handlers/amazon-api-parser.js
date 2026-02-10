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
 * Extract price from buybox
 * Converts number to "$X.XX" format to match HTML parser
 */
function extractPrice(apiResponse, logger = null) {
  const buybox = apiResponse.buybox;

  if (logger) {
    logger.log('AMAZON-API-FIELD', 'Extracting price from buybox', {
      hasBuybox: !!buybox,
      buyboxCount: Array.isArray(buybox) ? buybox.length : 0
    });
  }

  if (!buybox || !Array.isArray(buybox) || buybox.length === 0) {
    if (logger) {
      logger.log('AMAZON-API-FIELD', 'No buybox data available', { price: null });
    }
    return null;
  }

  const price = buybox[0]?.price;

  if (!price || typeof price !== 'number') {
    if (logger) {
      logger.log('AMAZON-API-FIELD', 'No valid price in buybox', {
        priceValue: price,
        priceType: typeof price
      });
    }
    return null;
  }

  // Convert to "$X.XX" format (match HTML parser format)
  const formattedPrice = `$${price.toFixed(2)}`;

  if (logger) {
    logger.log('AMAZON-API-FIELD', 'Price extracted and formatted', {
      rawPrice: price,
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
 * Extract coupon from discount_percentage
 * Returns "X%" format or "none"
 */
function extractCoupon(apiResponse, logger = null) {
  const discountPercentage = apiResponse.discount_percentage;

  if (logger) {
    logger.log('AMAZON-API-FIELD', 'Extracting coupon', {
      discountPercentage,
      discountType: typeof discountPercentage
    });
  }

  // Validate discount percentage
  if (
    discountPercentage === null ||
    discountPercentage === undefined ||
    typeof discountPercentage !== 'number' ||
    discountPercentage <= 0 ||
    discountPercentage > 100
  ) {
    if (logger) {
      logger.log('AMAZON-API-FIELD', 'No valid coupon', {
        discountPercentage,
        coupon: 'none'
      });
    }
    return 'none';
  }

  // Round to integer and format as percentage
  const couponValue = Math.round(discountPercentage);
  const coupon = `${couponValue}%`;

  if (logger) {
    logger.log('AMAZON-API-FIELD', 'Coupon detected', {
      rawDiscount: discountPercentage,
      roundedDiscount: couponValue,
      coupon
    });
  }

  return coupon;
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
 * Extract availability status
 */
function extractAvailability(apiResponse, logger = null) {
  const stock = apiResponse.stock;

  if (logger) {
    logger.log('AMAZON-API-FIELD', 'Extracting availability', {
      stock,
      stockType: typeof stock
    });
  }

  return stock || null;
}

/**
 * Extract Prime eligibility from delivery details
 */
function extractPrime(apiResponse, logger = null) {
  const deliveryDetails = apiResponse.delivery_details;

  if (logger) {
    logger.log('AMAZON-API-FIELD', 'Extracting Prime status', {
      hasDeliveryDetails: !!deliveryDetails,
      deliveryDetailsType: typeof deliveryDetails
    });
  }

  if (!deliveryDetails || typeof deliveryDetails !== 'string') {
    // Also check buybox delivery details
    const buyboxDelivery = apiResponse.buybox?.[0]?.delivery_details;
    if (buyboxDelivery && typeof buyboxDelivery === 'string') {
      const isPrime = buyboxDelivery.toLowerCase().includes('prime');
      if (logger) {
        logger.log('AMAZON-API-FIELD', 'Prime status from buybox', {
          isPrime,
          deliveryDetails: buyboxDelivery.substring(0, 100)
        });
      }
      return isPrime;
    }

    if (logger) {
      logger.log('AMAZON-API-FIELD', 'No valid delivery details', { isPrime: false });
    }
    return false;
  }

  // Check if delivery details contain "Prime" (case-insensitive)
  const isPrime = deliveryDetails.toLowerCase().includes('prime');

  if (logger) {
    logger.log('AMAZON-API-FIELD', 'Prime status determined', {
      isPrime,
      deliveryDetails: deliveryDetails.substring(0, 100)
    });
  }

  return isPrime;
}

/**
 * Extract color from selected variation
 */
function extractColor(apiResponse, logger = null) {
  const variations = apiResponse.variations;

  if (logger) {
    logger.log('AMAZON-API-FIELD', 'Extracting color', {
      hasVariations: !!variations,
      variationsCount: Array.isArray(variations) ? variations.length : 0
    });
  }

  if (!variations || !Array.isArray(variations)) {
    if (logger) {
      logger.log('AMAZON-API-FIELD', 'No variations', { color: null });
    }
    return null;
  }

  // Find selected variation
  const selectedVariation = variations.find(v => v.selected === true);

  if (!selectedVariation || !selectedVariation.dimensions) {
    if (logger) {
      logger.log('AMAZON-API-FIELD', 'No selected variation or dimensions', { color: null });
    }
    return null;
  }

  const color = selectedVariation.dimensions.Color || null;

  if (logger) {
    logger.log('AMAZON-API-FIELD', 'Color extracted', {
      color,
      dimensions: Object.keys(selectedVariation.dimensions)
    });
  }

  return color;
}

/**
 * Extract size from selected variation
 */
function extractSize(apiResponse, logger = null) {
  const variations = apiResponse.variations;

  if (logger) {
    logger.log('AMAZON-API-FIELD', 'Extracting size', {
      hasVariations: !!variations,
      variationsCount: Array.isArray(variations) ? variations.length : 0
    });
  }

  if (!variations || !Array.isArray(variations)) {
    if (logger) {
      logger.log('AMAZON-API-FIELD', 'No variations', { size: null });
    }
    return null;
  }

  // Find selected variation
  const selectedVariation = variations.find(v => v.selected === true);

  if (!selectedVariation || !selectedVariation.dimensions) {
    if (logger) {
      logger.log('AMAZON-API-FIELD', 'No selected variation or dimensions', { size: null });
    }
    return null;
  }

  const size = selectedVariation.dimensions.Size || null;

  if (logger) {
    logger.log('AMAZON-API-FIELD', 'Size extracted', {
      size,
      dimensions: Object.keys(selectedVariation.dimensions)
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
