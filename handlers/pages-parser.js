const cheerio = require("cheerio");

function parseProductData($) {
  const product = {};
  getSimpleFields(product, $);
  extractDataFromTables(product, $);
  return product;
}

function getSimpleFields(product, $) {
  product["title"] = getTitle($);
  setBrand(product, $);
  setPrice(product, $);
  product["category"] = getCategory($);
  product["isPrime"] = getPrime($);
  product["availabilityStatus"] = getAvailabilityStatus($);
  product["availabilityQuantity"] = getAvailabilityQuantity($);
  product["discountCoupon"] = getDiscountCoupon($);
  product["ratingStars"] = getRatingStars($);
  product["purchaseInfo"] = getPurchaseInfo($);
  product["proxyCountry"] = getProxyCountry($);
}

function getPurchaseInfo($) {
  const selectors = [
    "#social-proofing-faceout-title-tk_bought",
    ".social-proofing-faceout-title",
  ];

  for (const selector of selectors) {
    const text = $(selector).text().trim();
    if (text) return text;
  }

  return "none";
}

/*
// If you need a number instead of "1K+ bought"
function parsePurchaseCount(text) {
  const match = text.match(/([\d.,]+)\+?\s*bought/i);
  if (!match) return null;

  const raw = match[1];
  if (raw.includes("K")) return parseFloat(raw) * 1000;
  if (raw.includes("M")) return parseFloat(raw) * 1000000;

  return parseInt(raw.replace(/,/g, ""), 10);
}
*/

function getTitle($) {
  return $("span#productTitle").text().trim();
}

function setPrice(product, $) {
  if (!product["price"]) {
    product["price"] = $(".a-price .a-offscreen").first().text().trim();
  }
  /*
  $(".a-size-mini.olpMessageWrapper").each(function () {
    const priceText = $(this).text();
    product["price"] += priceText.slice(priceText.indexOf("$")) + " ";
  });
  */
  if (!product["price"]) {
    let prices = $(".a-price.aok-align-center.reinventPricePriceToPayMargin.priceToPay:first-child").text().split("$");
    prices = prices.filter((p) => isFinite(parseInt(p)));
    product["price"] = prices[0];
  }
  if (!product["price"]) {
    const priceString = $(".swatches.swatchesSquare").text();
    const priceRegex = /\$\d/;
    const priceIdx = priceString.search(priceRegex);
    const price = priceString.substring(priceIdx, priceIdx + 6);
    product["price"] = price;
  }
  if (!product["price"].trim()) {
    const priceString = $(".a-price.aok-align-center.reinventPricePriceToPayMargin.priceToPay .a-offscreen").text();
    product["price"] = priceString;
  }
  if (!product["price"]) {
    product["price"] = $("#size_name_0_price").text().trim();
  }
  if (!product["price"]) {
    product["price"] = $("[data-a-color='price'] .a-offscreen").text().trim();
  }
  if (!product["price"]) {
    product["price"] = $("#variation_scent_name > ul").text().trim();
  }
  if (!product["price"]) {
    product["price"] = $("span.a-text-price:nth-child(1) > span:nth-child(1)").text().trim();
  }
}

function getCategory($) {
  const categories = $(".a-unordered-list.a-horizontal.a-size-small").text().split("›").map(string => string.trim());
  return categories.join(", ");
}

function getPrime($) {
  return (
    // the Prime icon <i> tag
    $('i.a-icon.a-icon-prime').length > 0 ||

    // sometimes wrapped in a specific badge container
    $('#primeExclusiveBadge_feature_div').length > 0 ||

    // aria‑label on any element
    $('[aria-label="Amazon Prime"], [aria-label*="Prime"]').length > 0 ||

    // img alt text contains “Prime”
    $('img[alt*="Prime"]').length > 0 ||

    // fallback: any span whose text is exactly “Prime”
    $('span.a-icon-alt')
      .filter((i, el) => $(el).text().trim() === 'Prime')
      .length > 0
  );
}

function setBrand(product, $) {
  $("table#product-specification-table tr").each(function () {
    const text = $(this).text().trim();
    if (text.toLowerCase().startsWith("brand") || text.toLowerCase().startsWith("marke")) {
      const strings = text.split(" ");
      product["brand"] = strings.slice(1).join(" ").trim();
    }
  });

  if (!product.brand) {
    $("#productOverview_feature_div tr").each(function () {
      const text = $(this).text().trim();
      if (text.toLowerCase().startsWith("brand") || text.toLowerCase().startsWith("marke")) {
        const strings = text.split(" ");
        product["brand"] = strings.slice(1).join(" ").trim();
      }
    });
  }

  if (!product["brand"]) {
    product["brand"] = $("#bylineInfo").text().split(": ")[1];
  }
  if (!product["brand"]) {
    product["brand"] = $("#bylineInfo_feature_div").text().trim();
  }
}

function getAvailabilityStatus($) {
  return $(".a-size-medium.a-color-success").text().trim() || $("#availability").text().trim();
}

function getAvailabilityQuantity($) {
  // Try both selectors: sometimes the availability text is in one or the other
  const availabilityText = $(".a-size-medium.a-color-success").text().trim() || $("#availability").text().trim();

  // Try to match "Only X left in stock"
  const match = availabilityText.match(/only\s+(\d+)\s+left in stock/i);

  // Return parsed number if found, otherwise null
  return match ? parseInt(match[1], 10) : null;
}

function extractRankFromText(text) {
  // Match things like "#1,234 in Category" or "Nr. 1.234 in ..."
  const match = text.match(/#?\s*([\d,.]+)/);
  if (!match) return null;

  return parseInt(match[1].replace(/[.,]/g, ""), 10);
}

function getRank($) {
  let rank = null;

  // --- Check detail bullets
  $('#detailBulletsWrapper_feature_div li, #detailBullets_feature_div .a-list-item').each((_, el) => {
    const text = $(el).text();
    if (/best sellers? rank/i.test(text) || /bestseller-rang/i.test(text)) {
      rank = extractRankFromText(text);
      if (rank) return false; // break loop once found
    }
  });

  // --- Check product details tables
  if (!rank) {
    $('#productDetails_detailBullets_sections1 tr, #productDetails_techSpec_section_1 tr').each((_, el) => {
      const field = $(el).find('th').text().trim().toLowerCase();
      const value = $(el).find('td').text().trim();
      if (field.includes('best sellers rank') || field.includes('bestseller-rang')) {
        rank = extractRankFromText(value);
        if (rank) return false;
      }
    });
  }

  return rank;
}

function extractDataFromTables(product, $) {
  // Date First Available (leave as-is)
  $("#detailBulletsWrapper_feature_div li").each(function () {
    const text = $(this).text().trim();
    if (text.toLowerCase().startsWith("date first available") && !product.dateFirstAvailable) {
      product.dateFirstAvailable = text.slice(text.indexOf(":") + 1).trim();
    }
  });

  // Dimensions, etc. (leave as-is)
  $("#detailBullets_feature_div .a-list-item").each(function () {
    const label = $(this).find(".a-text-bold").text().trim().toLowerCase();
    const value = $(this).find("span:nth-child(2)").text().trim();
    if (label.startsWith("date first available") && !product.dateFirstAvailable) {
      product.dateFirstAvailable = value;
    }
    if (label.startsWith("package dimensions")) {
      product.size = value;
    }
  });

  // Unified rank extraction
  if (!product.rank) {
    product.rank = getRank($);
  }
}

function writeProduct(object, field, value) {
  const normalizedField = field.trim().toLowerCase();

  switch (normalizedField) {
    case "date first available":
      object.dateFirstAvailable = value;
      break;
    case "brand":
    case "brand name":
      object.brand = value;
      break;
    case "color":
      object.color = value;
      break;
    case "product dimensions":
      object.size = value;
      break;
    case "best sellers rank":
      const rankMatch = value.match(/#([\d,]+)/);
      if (rankMatch) {
        object.rank = parseInt(rankMatch[1].replace(/,/g, ""), 10);
      }
      break;
    default:
      // console.log(`Unmapped field: ${field} → ${value}`);
      break;
  }
}

function getDiscountCoupon($) {
  const coupon = $(".couponLabelText").get(0);
  if (coupon) {
    return coupon.children[0] ? coupon.children[0].data : "none";
  }
  return "none";
}

function getRatingStars($) {
  return $("#averageCustomerReviews > span:nth-child(1) > span:nth-child(1) > span:nth-child(1) > a:nth-child(1) > span:nth-child(1)").text().trim().split(" ")[0];
}

/*
function parseIsLastPage(html) {
  const $ = cheerio.load(html);
  return $('.s-pagination-strip').children().find((_, elem) => $(elem).text().includes("Next")).hasClass("s-pagination-disabled");
}
*/

function parseIsLastPage($) {
  // Try real Amazon style first
  const amazonNext = $('.a-pagination li.a-last');
  if (amazonNext.length) {
    return amazonNext.hasClass('a-disabled');
  }

  // Fall back to mock style
  const mockNext = $('.s-pagination-strip')
    .children()
    .filter((_, el) => $(el).text().trim() === "Next");
  return mockNext.hasClass("s-pagination-disabled");
}

function parseNextCategoryPageLink($) {
  return $(".s-pagination-selected").next("a").attr("href");
}

function getProxyCountry($) {
  let text = $("#glow-ingress-line2").text().trim();

  if (!text || text.toLowerCase().includes("update location")) {
    text = $("#glow-ingress-block").text().trim();
  }
  
  return text;
}

function parseCategoryPage($) {
  const asinSet = new Set();

  // --- Method A: Extract ASINs from result items
  $('.s-result-item[data-asin]').each((_, el) => {
    const asin = $(el).attr('data-asin');
    if (asin && /^[A-Z0-9]{10}$/.test(asin)) {
      asinSet.add(asin);
    }
  });

  // --- Method B: Extract ASINs from /dp/ links (fallback)
  $('a[href*="/dp/"]').each((_, el) => {
    const href = $(el).attr('href');
    const match = href.match(/\/dp\/([A-Z0-9]{10})/);
    if (match) {
      asinSet.add(match[1]);
    }
  });

  // Extract proxy country consistently
  const proxyCountry = getProxyCountry($);

  return {
    ASINs: Array.from(asinSet),
    proxyCountry: proxyCountry || null, // null instead of undefined
  };
}

module.exports = { parseProductData, parseIsLastPage, parseNextCategoryPageLink, parseCategoryPage, };
