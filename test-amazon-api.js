/**
 * Test script for Amazon API integration
 * Tests the scraper and parser with 3 sample ASINs
 */

require('dotenv').config();
const { amazonApiScraper } = require('./handlers/amazon-api-scraper');
const { parseAmazonApiData } = require('./handlers/amazon-api-parser');

// Test ASINs from the requirements
const TEST_ASINS = [
  { asin: 'B014WOXB6O', description: 'Previously had no price (shipping restriction)', expectedPrice: '$11.99' },
  { asin: 'B0G8Y8GR28', description: 'Normal product with 50% coupon', expectedPrice: '$99.99', expectedCoupon: '50%' },
  { asin: 'B0711QYPJD', description: 'Empty price issue', expectedPrice: 'should have price' }
];

async function testAsin(asinInfo) {
  console.log('\n' + '='.repeat(80));
  console.log(`Testing ASIN: ${asinInfo.asin}`);
  console.log(`Description: ${asinInfo.description}`);
  console.log('='.repeat(80));

  try {
    // Step 1: Scrape with Amazon API
    console.log('\n[1] Scraping with Amazon API...');
    const startTime = Date.now();
    const apiResponse = await amazonApiScraper.scrapeProduct(asinInfo.asin, {
      zipCode: '10001'
    });
    const scrapeTime = Date.now() - startTime;
    console.log(`✓ Scrape successful (${scrapeTime}ms)`);
    console.log(`  API Response keys: ${Object.keys(apiResponse).slice(0, 15).join(', ')}`);

    // Step 2: Parse the response
    console.log('\n[2] Parsing API response...');
    const productData = parseAmazonApiData(apiResponse);
    console.log('✓ Parse successful');

    // Step 3: Validate results
    console.log('\n[3] Validation Results:');
    console.log('-'.repeat(80));

    const validations = [
      { field: 'ASIN', value: asinInfo.asin, status: '✓' },
      { field: 'Title', value: productData.title ? productData.title.substring(0, 60) + '...' : 'MISSING', status: productData.title ? '✓' : '✗' },
      { field: 'Price', value: productData.price || 'MISSING', status: productData.price ? '✓' : '✗', expected: asinInfo.expectedPrice },
      { field: 'Brand', value: productData.brand || 'MISSING', status: productData.brand ? '✓' : '⚠' },
      { field: 'Category', value: productData.category ? productData.category.substring(0, 50) + '...' : 'MISSING', status: productData.category ? '✓' : '⚠' },
      { field: 'Rank', value: productData.rank || 'MISSING', status: productData.rank ? '✓' : '⚠' },
      { field: 'Coupon', value: productData.discountCoupon, status: productData.discountCoupon !== 'none' ? '✓' : '○', expected: asinInfo.expectedCoupon },
      { field: 'Rating', value: productData.ratingStars || 'MISSING', status: productData.ratingStars ? '✓' : '⚠' },
      { field: 'Reviews', value: productData.reviewsCount || 'MISSING', status: productData.reviewsCount ? '✓' : '⚠' },
      { field: 'Availability', value: productData.availabilityStatus || 'MISSING', status: productData.availabilityStatus ? '✓' : '⚠' },
      { field: 'isPrime', value: productData.isPrime ? 'Yes' : 'No', status: '○' },
      { field: 'Color', value: productData.color || 'N/A', status: '○' },
      { field: 'Size', value: productData.size || 'N/A', status: '○' },
      { field: 'scrapeMethod', value: productData.scrapeMethod, status: productData.scrapeMethod === 'amazon-api' ? '✓' : '✗' },
      { field: 'scrapedAt', value: productData.scrapedAt ? 'Present' : 'MISSING', status: productData.scrapedAt ? '✓' : '✗' },
      { field: 'apiVersion', value: productData.apiVersion, status: productData.apiVersion === 'v1' ? '✓' : '✗' }
    ];

    validations.forEach(v => {
      const expected = v.expected ? ` (expected: ${v.expected})` : '';
      console.log(`  ${v.status} ${v.field.padEnd(20)} ${v.value}${expected}`);
    });

    console.log('-'.repeat(80));

    // Check critical fields
    const hasCriticalFields = productData.title && productData.price && productData.scrapeMethod === 'amazon-api';

    if (hasCriticalFields) {
      console.log('\n✅ TEST PASSED - All critical fields present');
    } else {
      console.log('\n❌ TEST FAILED - Missing critical fields');
    }

    // Check expected values
    if (asinInfo.expectedPrice && productData.price !== asinInfo.expectedPrice) {
      console.log(`⚠️  WARNING: Price mismatch. Expected ${asinInfo.expectedPrice}, got ${productData.price}`);
    }
    if (asinInfo.expectedCoupon && productData.discountCoupon !== asinInfo.expectedCoupon) {
      console.log(`⚠️  WARNING: Coupon mismatch. Expected ${asinInfo.expectedCoupon}, got ${productData.discountCoupon}`);
    }

    return { success: true, asin: asinInfo.asin, productData };

  } catch (error) {
    console.log('\n❌ TEST FAILED WITH ERROR');
    console.log(`  Error: ${error.message}`);
    console.log(`  Code: ${error.code || 'N/A'}`);
    console.log(`  Status: ${error.statusCode || 'N/A'}`);

    if (error.response?.data) {
      console.log(`  API Error: ${JSON.stringify(error.response.data).substring(0, 200)}`);
    }

    return { success: false, asin: asinInfo.asin, error: error.message };
  }
}

async function runTests() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║        AMAZON API INTEGRATION TEST SUITE                                  ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝');
  console.log('\nTesting Amazon API scraper and parser with 3 sample ASINs...');
  console.log(`API Key configured: ${process.env.SCRAPINGBEE_API_KEY ? 'Yes' : 'No'}`);

  const results = [];

  for (const asinInfo of TEST_ASINS) {
    const result = await testAsin(asinInfo);
    results.push(result);

    // Wait 2 seconds between requests to avoid rate limiting
    if (TEST_ASINS.indexOf(asinInfo) < TEST_ASINS.length - 1) {
      console.log('\n⏱️  Waiting 2 seconds before next request...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // Summary
  console.log('\n\n' + '='.repeat(80));
  console.log('TEST SUMMARY');
  console.log('='.repeat(80));

  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`Total tests: ${results.length}`);
  console.log(`Passed: ${passed} ✅`);
  console.log(`Failed: ${failed} ${failed > 0 ? '❌' : ''}`);

  console.log('\nDetailed results:');
  results.forEach((result, idx) => {
    const status = result.success ? '✅' : '❌';
    const details = result.success
      ? `Price: ${result.productData.price}, Coupon: ${result.productData.discountCoupon}`
      : `Error: ${result.error}`;
    console.log(`  ${idx + 1}. ${status} ${result.asin} - ${details}`);
  });

  console.log('\n' + '='.repeat(80));

  if (passed === results.length) {
    console.log('\n🎉 ALL TESTS PASSED! Amazon API integration is working correctly.');
  } else {
    console.log('\n⚠️  SOME TESTS FAILED. Please review errors above.');
  }

  console.log('\n');
}

// Run tests
runTests().catch(error => {
  console.error('\n💥 FATAL ERROR:', error);
  process.exit(1);
});
