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

function validateCurrencyUSD(html, pricePosition) {
  // Extract 200 chars before and after the price position
  const start = Math.max(0, pricePosition - 200);
  const end = Math.min(html.length, pricePosition + 200);
  const context = html.substring(start, end);

  // Check for non-USD currency symbols
  const nonUSDSymbols = ['S$', '£', '€', 'A$', 'C$', 'CA$', 'AU$', '¥', '₹', 'R$'];
  const hasNonUSDSymbol = nonUSDSymbols.some(symbol => context.includes(symbol));

  // Check for non-USD currency code in JSON
  const currencyMatch = context.match(/"currencyCode":"([^"]+)"/);
  const hasNonUSDCode = currencyMatch && currencyMatch[1] !== 'USD';

  if (hasNonUSDSymbol || hasNonUSDCode) {
    const detected = currencyMatch ? currencyMatch[1] : 'non-USD symbol';
    console.log(`[validateCurrencyUSD] Rejected: ${detected}`);
    return false;
  }
  return true;
}

function setPrice(product, $) {
  const html = $.html();

  // PRIORITY 1: priceToPay - get FIRST element only
  const priceToPayEl = $(".priceToPay .a-offscreen").first();
  if (priceToPayEl.length > 0) {
    const priceText = priceToPayEl.text().trim();
    const priceMatch = priceText.match(/^\$?([\d,]+\.?\d*)$/);
    if (priceMatch) {
      const priceValue = priceMatch[1].replace(/,/g, '');
      product["price"] = "$" + priceValue;
      return;
    }
  }

  // PRIORITY 2: Standard a-offscreen - get FIRST only
  const offscreenEl = $(".a-price .a-offscreen").first();
  if (offscreenEl.length > 0) {
    const priceText = offscreenEl.text().trim();
    const priceMatch = priceText.match(/^\$?([\d,]+\.?\d*)$/);
    if (priceMatch) {
      product["price"] = "$" + priceMatch[1].replace(/,/g, '');
      return;
    }
  }

  // PRIORITY 3: reinventPricePriceToPayMargin - get FIRST only
  const reinventEl = $(".a-price.reinventPricePriceToPayMargin.priceToPay .a-offscreen").first();
  if (reinventEl.length > 0) {
    const priceText = reinventEl.text().trim();
    const priceMatch = priceText.match(/^\$?([\d,]+\.?\d*)$/);
    if (priceMatch) {
      product["price"] = "$" + priceMatch[1].replace(/,/g, '');
      return;
    }
  }

  // PRIORITY 4: data-a-color price - get FIRST only
  const colorEl = $("[data-a-color='price'] .a-offscreen").first();
  if (colorEl.length > 0) {
    const priceText = colorEl.text().trim();
    const priceMatch = priceText.match(/^\$?([\d,]+\.?\d*)$/);
    if (priceMatch) {
      product["price"] = "$" + priceMatch[1].replace(/,/g, '');
      return;
    }
  }

  // PRIORITY 5: Fallbacks - get FIRST only
  const fallbackSelectors = [
    "#size_name_0_price",
    "span.a-text-price span.a-offscreen"
  ];

  for (const selector of fallbackSelectors) {
    const el = $(selector).first();
    if (el.length > 0) {
      const priceText = el.text().trim();
      const priceMatch = priceText.match(/^\$?([\d,]+\.?\d*)$/);
      if (priceMatch) {
        product["price"] = "$" + priceMatch[1].replace(/,/g, '');
        return;
      }
    }
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

  // Fallback 3: Table layout with prodDetSectionEntry (75% of failed products)
  if (!rank) {
    $('th.prodDetSectionEntry').each((_, el) => {
      const text = $(el).text();
      if (/best sellers?\s*rank/i.test(text)) {
        const tdText = $(el).next('td').text();
        rank = extractRankFromText(tdText);
        if (rank) return false;
      }
    });
  }

  // Fallback 4: Bullet list with a-text-bold (25% of failed products)
  if (!rank) {
    $('span.a-text-bold').each((_, el) => {
      const text = $(el).text();
      if (/best sellers?\s*rank/i.test(text)) {
        const parentText = $(el).parent().text();
        rank = extractRankFromText(parentText);
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
  const html = $.html();

  // Step 1: Basic structure validation
  const hasCouponLabel = html.includes('couponLabelText');
  const hasCheckbox = html.includes('type="checkbox"') &&
                      html.includes('id="checkboxpctch');

  if (!hasCouponLabel || !hasCheckbox) {
    return "none";
  }

  // Step 2: Extract ONLY the VISIBLE accordion section (not hidden S&S section)
  // Amazon pages have TWO coupon sections:
  // - reinvent_price_desktop_newAccordionRow (VISIBLE - regular coupon)
  // - reinvent_price_desktop_snsAccordionRowMiddle (HIDDEN - S&S only)
  let visibleSection = null;
  const newAccordionMatch = html.match(/<div id="reinvent_price_desktop_newAccordionRow"[^>]*>([\s\S]*?)(?=<div id="reinvent_price_desktop_snsAccordionRowMiddle"|<\/div>\s*<\/div>\s*<\/div>)/);

  if (newAccordionMatch) {
    visibleSection = newAccordionMatch[1];
  }

  // Step 3: Find coupon container with slot-id
  let couponContainer = visibleSection || html;
  const slotIdMatch = couponContainer.match(/data-csa-c-slot-id="(dp-aod-price-block-promotion-0|dp-promo-price-block-message)"[\s\S]{0,2000}?couponLabelText/);

  if (slotIdMatch) {
    const slotIdIndex = couponContainer.indexOf(slotIdMatch[0]);
    couponContainer = couponContainer.substring(slotIdIndex, slotIdIndex + 2000);
  } else if (visibleSection && visibleSection.includes('couponLabelText')) {
    // Use visible section as container
    couponContainer = visibleSection;
  } else if (!visibleSection) {
    // No accordion found, no slot-id found - coupon not in primary position
    return "none";
  }

  // Step 4: Filter Subscribe & Save ONLY coupons
  const snsOnlyPhrases = [
    'on your first Subscribe and Save',
    'on your first Subscribe & Save',
    'on your first Subscribe &amp; Save',
    'extra 15% on your first Subscribe',
    'when you subscribe and save',
    'when you Subscribe and Save',
    'Coupon available when you select',
    'Subscribe & Save orders only',
    'when you select Subscribe',
    'when you selectSubscribe',
    'first Subscribe and Save',
    ':amzn1.bot.SNS',
    'with Subscribe and Save order',
    'with Subscribe & Save order'
  ];

  const containerLower = couponContainer.toLowerCase();
  const isSNSOnly = snsOnlyPhrases.some(phrase =>
    containerLower.includes(phrase.toLowerCase())
  );

  if (isSNSOnly) {
    return "none";
  }

  // Step 5: Extract coupon value
  const couponText = $(".couponLabelText").first().text().trim();

  const valueMatch = couponContainer.match(/Apply[\s\S]{0,50}?(\d+%|\$\d+(?:\.\d{2})?)[\s\S]{0,50}?coupon/i) ||
                     couponContainer.match(/Save[\s\S]{0,50}?(\d+%|\$\d+(?:\.\d{2})?)[\s\S]{0,50}?(?:with\s+)?coupon/i) ||
                     couponContainer.match(/coupon[\s\S]{0,50}?(\d+%|\$\d+(?:\.\d{2})?)/i) ||
                     couponText.match(/(\d+%|\$\d+(?:\.\d{2})?)/);

  const couponValue = valueMatch ? valueMatch[1] : couponText;
  return couponValue || "none";
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
