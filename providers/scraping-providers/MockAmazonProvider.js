const { ScrapingProvider } = require("./ScrapingProvider");
const { faker } = require("@faker-js/faker");

const { HttpError } = require("../../utilities/HttpError");

function getRandomInteger(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

class MockAmazonProvider extends ScrapingProvider {
  constructor() {
    super(
      "mock://amazon-mock",
      {},
      {},
      "mock://amazon-mock/status"
    );
    this.apiKey = "mock";
    this.maxConcurrentRequests = 10;
    this.creditsRemaining = 1000000;
    this.maxPagesPerCategory = 100;
    this.maxProductsPerPage = 24;
  }

  renew() {
    this.creditsRemaining = 50;
  }
 
  async getPage(url) {
    if (Math.random() < 0.005) {
      throw new HttpError(500, "Provider internal server error.");
    }

    this.requestsSent += 1;
    // Simulate delay to mimic network request
    await new Promise(resolve => setTimeout(resolve, getRandomInteger(1000, 12000)));

    // ❗️Simulate "out of credits"
    if (this.creditsRemaining <= 0) {
      const error = new HttpError(401, "No more credits available");
      throw error;
    }

    // ❗️Simulate "too many concurrent requests"
    if (this.maxConcurrentRequests !== undefined && this.currentConcurrency >= this.maxConcurrentRequests) {
      const error = new HttpError(429, "Too many concurrent requests");
      throw error;
    }

    this.currentConcurrency = (this.currentConcurrency || 0) + 1;
    try {
      this.creditsRemaining--;

      if (url.includes("/s?")) {
        return this.generateMockCategoryPage(url);
      } else if (url.includes("/dp/")) {
        return this.generateMockProductPage(url);
      } else {
        const error = new HttpError(400, "Unsupported mock URL");
        throw error;
      }
    } finally {
      this.currentConcurrency--;
    }
  }

  generateMockCategoryPage(url) {
    const pageMatch = url.match(/page=(\d+)/);
    const page = pageMatch ? parseInt(pageMatch[1]) : 1;

    const hasNextPage = page < this.maxPagesPerCategory;

    // 10–20 ASINs per page
    const asins = Array.from(
      { length: hasNextPage ? this.maxProductsPerPage : faker.number.int({ min: 1, max: this.maxProductsPerPage }) },
      () => faker.string.alphanumeric({ length: 10, casing: "upper" })
    );

    let html = '<div class="s-pagination-strip">';
    if (hasNextPage) {
      html += `<a class="s-pagination-selected" href="/s?rh=n%3A12345&page=${page}">${page}</a>`;
      html += `<a href="/s?rh=n%3A12345&page=${page + 1}" class="s-pagination-next">Next</a>`;
    } else {
      html += `<a class="s-pagination-selected" href="/s?rh=n%3A12345&page=${page}">${page}</a>`;
      html += '<span class="s-pagination-disabled">Next</span>';
    }
    html += "</div>";

    asins.forEach(asin => {
      html += `<div class="s-result-item s-asin" data-asin="${asin}"></div>`;
    });

    return html + this.makeFillerMB(2);
  }

  generateMockProductPage(url) {
    const asinMatch = url.match(/\/dp\/([A-Z0-9]{10})/);
    const asin = asinMatch
      ? asinMatch[1]
      : faker.string.alphanumeric({ length: 10, casing: "upper" });

    const product = {
      ASIN: asin,
      title: faker.commerce.productName(),
      price: `$${faker.number.float({ min: 5, max: 500 }).toFixed(2)}`,
      category: faker.commerce.department(),
      isPrime: faker.datatype.boolean(),
      brand: faker.company.name(),
      rank: faker.number.int({ min: 1, max: 10000 }),
      availabilityQuantity: faker.number.int({ min: 0, max: 100 }),
      availabilityStatus: faker.helpers.arrayElement([
        "In Stock",
        "Out of Stock",
        "Only 3 left in stock"
      ]),
      color: faker.color.human(),
      size: faker.helpers.arrayElement(["Small", "Medium", "Large", "N/A"]),
      dateFirstAvailable: faker.date.past({ years: 5 }).toISOString(),
      discountCoupon: faker.helpers.arrayElement([
        "none",
        "Save $5",
        "10% off",
        "20% off"
      ]),
      ratingStars: faker.number.float({ min: 0, max: 5, precision: 0.1 }).toFixed(1),
      purchaseInfo: `${faker.number.int({ min: 0, max: 1000 })} bought in past month`
    };

    let html = `
      <span id="productTitle">${product.title}</span>
  
      <!-- Prices in multiple selector-compatible places -->
      <div class="a-size-mini olpMessageWrapper">New from ${product.price}</div>
      <div class="a-price aok-align-center reinventPricePriceToPayMargin priceToPay">
        <span class="a-offscreen">${product.price}</span>
      </div>
      <div id="corePrice_desktop">
        <div>
          <table>
            <tbody>
              <tr>
                <td class="a-span12">
                  <span class="a-price a-text-price a-size-medium apexPriceToPay">${product.price}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="swatches swatchesSquare">Various sizes from ${product.price}</div>
      <div id="size_name_0_price">${product.price}</div>
      <span data-a-color="price"><span class="a-offscreen">${product.price}</span></span>
      <span class="a-text-price"><span>${product.price}</span></span>
  
      <!-- Category -->
      <ul class="a-unordered-list a-horizontal a-size-small">
        <li>${product.category}</li>
        <li>› Accessories</li>
      </ul>
  
      <!-- Brand in multiple fallback spots -->
      <table id="product-specification-table">
        <tr><td>Brand ${product.brand}</td></tr>
      </table>
      <div id="productOverview_feature_div">
        <tr><td>Brand ${product.brand}</td></tr>
      </div>
      <div id="bylineInfo">Brand: ${product.brand}</div>
      <div id="bylineInfo_feature_div">${product.brand}</div>
  
      <!-- Availability -->
      <div class="a-size-medium a-color-success">${product.availabilityStatus}</div>
      <div id="availability">${product.availabilityStatus}</div>
  
      <!-- Coupon -->
      <label id="coupon">${product.discountCoupon}</label>
  
      <!-- Rating -->
      <div id="averageCustomerReviews">
        <span><span><span><a><span>${product.ratingStars} out of 5 stars</span></a></span></span></span>
      </div>
  
      <!-- Purchase Info -->
      <div id="social-proofing-faceout-title-tk_bought">
        <span>${product.purchaseInfo}</span>
      </div>
  
      <!-- Tables and bullets -->
      <div id="productDetails_detailBullets_sections1">
        <table>
          <tr><th>Best Sellers Rank</th><td>#${product.rank.toLocaleString()}</td></tr>
          <tr><th>Date First Available</th><td>${product.dateFirstAvailable}</td></tr>
          <tr><th>Color</th><td>${product.color}</td></tr>
          <tr><th>Product Dimensions</th><td>${product.size}</td></tr>
        </table>
      </div>
      <div id="detailBulletsWrapper_feature_div">
        <ul>
          <li><span class="a-list-item">Best Sellers Rank: #${product.rank.toLocaleString()}</span></li>
          <li><span class="a-list-item">Date First Available: ${product.dateFirstAvailable}</span></li>
        </ul>
      </div>
      <div id="detailBullets_feature_div">
        <span class="a-list-item">
          <span class="a-text-bold">Package Dimensions:</span>
          <span> ${product.size}</span>
        </span>
        <span class="a-list-item">
          <span class="a-text-bold">Date First Available:</span>
          <span> ${product.dateFirstAvailable}</span>
        </span>
      </div>
      <div class="a-unordered-list a-nostyle a-vertical a-spacing-none detail-bullet-list">
        <li><span class="a-list-item">Amazon Bestseller-Rang: Nr. ${product.rank.toLocaleString()}</span></li>
      </div>
    `;

    if (product.isPrime) {
      html += `
        <i class='a-icon a-icon-prime'></i>
        <div id='primeExclusiveBadge_feature_div'>Prime</div>
        <img alt='Prime Logo' src='prime.png' />
        <span class='a-icon-alt'>Prime</span>
        <span aria-label="Amazon Prime"></span>
      `;
    }

    return html + this.makeFillerMB(2);
  }

  async updateStatus() {
    return Promise.resolve();
  }

  makeFillerMB(mb = 2) {
    // 1 MB ≈ 1,000,000 characters
    const targetSize = mb * 1_000_000;
    const chunk = "<div class='filler'>" + "X".repeat(1000) + "</div>";
    let html = "";
    while (html.length < targetSize) {
      html += chunk;
    }
    return html;
  }
}

module.exports = { MockAmazonProvider };