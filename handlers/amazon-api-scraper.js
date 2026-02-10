const axios = require('axios');
const { HttpError } = require('../utilities/HttpError');

/**
 * Amazon API Scraper
 *
 * Uses ScrapingBee's Amazon API endpoint to retrieve structured product data.
 * This solves the location-based pricing issue by setting a US zip code.
 *
 * Endpoint: https://app.scrapingbee.com/api/v1/amazon/product
 * Cost: 5 credits per request (same as HTML API)
 */

class AmazonApiScraper {
  constructor() {
    this.apiKey = process.env.SCRAPINGBEE_API_KEY;
    this.baseUrl = 'https://app.scrapingbee.com/api/v1/amazon/product';
    this.defaultZipCode = '10001'; // New York City zip code for consistent US pricing
  }

  /**
   * Scrape a product using the Amazon API
   * @param {string} asin - The Amazon ASIN to scrape
   * @param {object} options - Optional configuration
   * @param {string} options.zipCode - US zip code for location-based pricing
   * @param {object} options.logger - Logger instance for detailed logging
   * @returns {Promise<object>} Structured JSON response from Amazon API
   */
  async scrapeProduct(asin, options = {}) {
    const { zipCode = this.defaultZipCode, logger = null } = options;

    if (!this.apiKey) {
      const error = new Error('ScrapingBee API key not configured');
      if (logger) logger.error('CONFIG-ERROR', 'Missing API key', error);
      throw new HttpError(500, 'Scraping service not configured');
    }

    if (logger) {
      logger.log('AMAZON-API', 'Initiating Amazon API request', {
        asin,
        zipCode,
        endpoint: this.baseUrl
      });
    }

    const params = {
      api_key: this.apiKey,
      query: asin,
      country: 'us',
      zip_code: zipCode
    };

    let lastError = null;
    let attempt = 0;
    const maxAttempts = 3; // Initial attempt + 2 retries

    while (attempt < maxAttempts) {
      attempt++;

      try {
        if (logger && attempt > 1) {
          logger.log('AMAZON-API-RETRY', `Retry attempt ${attempt - 1}`, {
            asin,
            attempt: attempt - 1,
            maxRetries: maxAttempts - 1
          });
        }

        const startTime = Date.now();
        const response = await axios.get(this.baseUrl, {
          params,
          timeout: 60000, // 60 second timeout
          headers: {
            'Accept': 'application/json'
          }
        });
        const duration = Date.now() - startTime;

        if (logger) {
          logger.log('AMAZON-API-RESPONSE', 'API response received', {
            asin,
            statusCode: response.status,
            duration: `${duration}ms`,
            dataKeys: Object.keys(response.data || {})
          });
        }

        // Validate response has data
        if (!response.data) {
          throw new Error('Empty response from Amazon API');
        }

        return response.data;

      } catch (error) {
        lastError = error;
        const statusCode = error.response?.status;
        const errorData = error.response?.data;

        if (logger) {
          logger.error('AMAZON-API-ERROR', `Request failed (attempt ${attempt})`, {
            asin,
            attempt,
            statusCode,
            errorMessage: error.message,
            errorData
          });
        }

        // Handle different error types with specific retry logic

        // Rate limit (429) - fail immediately without retry
        if (statusCode === 429) {
          if (logger) {
            logger.log('AMAZON-API-RATE-LIMIT', 'Rate limit hit - failing fast', {
              asin,
              message: 'Avoid quota issues by not retrying rate limits'
            });
          }
          throw new HttpError(429, 'Rate limit exceeded', 'RATE_LIMIT');
        }

        // Product not found (404) - fail immediately without retry
        if (statusCode === 404) {
          if (logger) {
            logger.log('AMAZON-API-NOT-FOUND', 'Product not found', {
              asin,
              message: 'ASIN does not exist or is unavailable'
            });
          }
          throw new HttpError(404, `Product ${asin} not found`, 'NOT_FOUND');
        }

        // API error (500) - retry once with delay
        if (statusCode === 500) {
          if (attempt < 2) { // Only retry on first attempt (1 retry total)
            if (logger) {
              logger.log('AMAZON-API-SERVER-ERROR', 'Server error - will retry once', {
                asin,
                attempt,
                willRetry: true
              });
            }
            await this.sleep(2000); // 2 second delay before retry
            continue;
          } else {
            if (logger) {
              logger.log('AMAZON-API-SERVER-ERROR', 'Server error - max retries reached', {
                asin,
                attempt
              });
            }
            throw new HttpError(500, 'Amazon API server error', 'SERVER_ERROR');
          }
        }

        // Network/timeout errors - retry with exponential backoff
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || !statusCode) {
          if (attempt < maxAttempts) {
            const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s
            if (logger) {
              logger.log('AMAZON-API-NETWORK-ERROR', 'Network error - retrying with backoff', {
                asin,
                attempt,
                delay: `${delay}ms`,
                errorCode: error.code
              });
            }
            await this.sleep(delay);
            continue;
          }
        }

        // Unknown error - fail after retries
        if (attempt >= maxAttempts) {
          if (logger) {
            logger.error('AMAZON-API-FINAL-ERROR', 'All retry attempts exhausted', {
              asin,
              totalAttempts: attempt,
              finalError: error.message
            });
          }
          throw new HttpError(
            statusCode || 500,
            `Failed to scrape ${asin} after ${attempt} attempts: ${error.message}`,
            'SCRAPING_FAILED'
          );
        }
      }
    }

    // Should never reach here, but just in case
    throw lastError || new Error('Unknown error in Amazon API scraper');
  }

  /**
   * Sleep utility for retry delays
   * @param {number} ms - Milliseconds to sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Batch scrape multiple ASINs
   * Note: This is sequential to avoid rate limiting
   * @param {string[]} asins - Array of ASINs to scrape
   * @param {object} options - Options to pass to scrapeProduct
   * @returns {Promise<object[]>} Array of API responses
   */
  async scrapeProducts(asins, options = {}) {
    const results = [];

    for (const asin of asins) {
      try {
        const result = await this.scrapeProduct(asin, options);
        results.push({ asin, success: true, data: result });
      } catch (error) {
        results.push({ asin, success: false, error: error.message });
      }
    }

    return results;
  }
}

// Export singleton instance
const amazonApiScraper = new AmazonApiScraper();

module.exports = {
  AmazonApiScraper,
  amazonApiScraper
};
