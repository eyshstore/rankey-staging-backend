const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const axios = require('axios');

// Import the actual parser functions
const { parseProductData } = require('../handlers/pages-parser');

// Configuration
const CONFIG = {
  scrapingBeeKey: process.env.SCRAPINGBEE_API_KEY || 'FXBI2P6LEPJ4UE3FE4F02SM7Z1PFI2VRL4HDRAE2VI4RB84W5GVA3ILJ2GI5X96IBEU1BJVNGIOA8Z83',
  scrapingBeeEndpoint: 'https://app.scrapingbee.com/api/v1/',
  htmlSamplesDir: path.join(__dirname, 'html-samples'),
  savedSamplesDir: path.join(__dirname, 'saved-samples'),
  reportsDir: path.join(__dirname, 'reports'),
};

// Ensure directories exist
[CONFIG.htmlSamplesDir, CONFIG.savedSamplesDir, CONFIG.reportsDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// ======================
// FETCH COMMAND
// ======================
async function fetchProduct(asin) {
  console.log(`[FETCH] Fetching ${asin}...`);

  const url = new URL(CONFIG.scrapingBeeEndpoint);
  url.searchParams.append('api_key', CONFIG.scrapingBeeKey);
  url.searchParams.append('url', `https://www.amazon.com/dp/${asin}`);
  url.searchParams.append('render_js', 'false');
  url.searchParams.append('cookies', 'i18n-prefs=USD;lc-main=en_US');

  try {
    const response = await axios.get(url.toString(), { timeout: 60000 });
    const html = response.data;

    const filename = path.join(CONFIG.htmlSamplesDir, `${asin}.html`);
    fs.writeFileSync(filename, html);

    console.log(`[FETCH] ✅ ${asin} saved (${(html.length / 1024).toFixed(1)} KB)`);
    return { asin, success: true, size: html.length };
  } catch (error) {
    console.error(`[FETCH] ❌ ${asin} failed: ${error.message}`);
    return { asin, success: false, error: error.message };
  }
}

// ======================
// ANALYZE COMMAND
// ======================

// All selectors we want to test (same as in pages-parser.js)
const PRICE_SELECTORS = [
  { name: 'PRIORITY 1: .priceToPay .a-offscreen', selector: '.priceToPay .a-offscreen' },
  { name: 'PRIORITY 2: .a-price .a-offscreen', selector: '.a-price .a-offscreen' },
  { name: 'PRIORITY 3: .reinventPricePriceToPayMargin .a-offscreen', selector: '.a-price.reinventPricePriceToPayMargin.priceToPay .a-offscreen' },
  { name: 'PRIORITY 4: [data-a-color=price] .a-offscreen', selector: '[data-a-color="price"] .a-offscreen' },
  { name: 'PRIORITY 5a: #size_name_0_price', selector: '#size_name_0_price' },
  { name: 'PRIORITY 5b: span.a-text-price span.a-offscreen', selector: 'span.a-text-price span.a-offscreen' },
];

const COUPON_INDICATORS = [
  { name: 'couponLabelText exists', check: (html) => html.includes('couponLabelText') },
  { name: 'checkbox exists', check: (html) => html.includes('type="checkbox"') && html.includes('id="checkboxpctch') },
  { name: 'reinvent_price_desktop_newAccordionRow', check: (html) => html.includes('reinvent_price_desktop_newAccordionRow') },
  { name: 'S&S section exists', check: (html) => html.includes('reinvent_price_desktop_snsAccordionRowMiddle') },
];

function analyzeHTML(asin, html) {
  const $ = cheerio.load(html);
  const report = {
    asin,
    timestamp: new Date().toISOString(),
    htmlSize: html.length,
    selectors: [],
    couponIndicators: [],
    extractedData: null,
    rawTexts: {},
  };

  // Test each price selector
  console.log(`\n${'='.repeat(60)}`);
  console.log(`ASIN: ${asin}`);
  console.log(`HTML Size: ${(html.length / 1024).toFixed(1)} KB`);
  console.log(`${'='.repeat(60)}\n`);

  console.log('PRICE SELECTORS:');
  console.log('-'.repeat(60));

  for (const { name, selector } of PRICE_SELECTORS) {
    const elements = $(selector);
    const count = elements.length;
    const texts = [];

    elements.each((i, el) => {
      if (i < 5) { // Limit to first 5 elements
        texts.push($(el).text().trim());
      }
    });

    const firstText = elements.first().text().trim();

    report.selectors.push({ name, selector, count, texts, firstText });
    report.rawTexts[name] = texts;

    const status = count > 0 ? '✅' : '⬚';
    console.log(`${status} ${name}`);
    console.log(`   Found: ${count} elements`);
    if (count > 0) {
      console.log(`   First: "${firstText}"`);
      if (texts.length > 1) {
        console.log(`   All: ${JSON.stringify(texts)}`);
      }
    }
    console.log('');
  }

  // Test coupon indicators
  console.log('COUPON INDICATORS:');
  console.log('-'.repeat(60));

  for (const { name, check } of COUPON_INDICATORS) {
    const found = check(html);
    report.couponIndicators.push({ name, found });
    const status = found ? '✅' : '⬚';
    console.log(`${status} ${name}`);
  }
  console.log('');

  // Run actual parser
  console.log('ACTUAL PARSER RESULT:');
  console.log('-'.repeat(60));

  try {
    const extractedData = parseProductData($);
    report.extractedData = extractedData;

    console.log(`   Title: ${extractedData.title ? extractedData.title.substring(0, 50) + '...' : 'N/A'}`);
    console.log(`   Price: ${extractedData.price || 'N/A'}`);
    console.log(`   Coupon: ${extractedData.discountCoupon || 'N/A'}`);
    console.log(`   Brand: ${extractedData.brand || 'N/A'}`);
    console.log(`   Rank: ${extractedData.rank || 'N/A'}`);
    console.log(`   Prime: ${extractedData.isPrime}`);
  } catch (error) {
    console.error(`   ❌ Parser error: ${error.message}`);
    report.parserError = error.message;
  }

  console.log(`\n${'='.repeat(60)}\n`);

  return report;
}

function analyzeASIN(asin) {
  // Check html-samples first, then saved-samples
  let htmlPath = path.join(CONFIG.htmlSamplesDir, `${asin}.html`);
  if (!fs.existsSync(htmlPath)) {
    htmlPath = path.join(CONFIG.savedSamplesDir, `${asin}.html`);
  }

  if (!fs.existsSync(htmlPath)) {
    console.error(`[ANALYZE] ❌ No HTML file found for ${asin}`);
    console.error(`          Run: node test-runner.js fetch ${asin}`);
    return null;
  }

  const html = fs.readFileSync(htmlPath, 'utf-8');
  return analyzeHTML(asin, html);
}

function analyzeAll() {
  const reports = [];

  // Get all HTML files from both directories
  const sampleFiles = fs.existsSync(CONFIG.htmlSamplesDir)
    ? fs.readdirSync(CONFIG.htmlSamplesDir).filter(f => f.endsWith('.html'))
    : [];
  const savedFiles = fs.existsSync(CONFIG.savedSamplesDir)
    ? fs.readdirSync(CONFIG.savedSamplesDir).filter(f => f.endsWith('.html'))
    : [];

  const allFiles = [...new Set([...sampleFiles, ...savedFiles])];

  if (allFiles.length === 0) {
    console.log('[ANALYZE] No HTML files found. Run fetch first.');
    return;
  }

  console.log(`[ANALYZE] Found ${allFiles.length} HTML files\n`);

  for (const file of allFiles) {
    const asin = file.replace('.html', '');
    const report = analyzeASIN(asin);
    if (report) {
      reports.push(report);
    }
  }

  // Save combined report
  const reportFilename = `report-${new Date().toISOString().slice(0, 10)}-${Date.now()}.json`;
  const reportPath = path.join(CONFIG.reportsDir, reportFilename);
  fs.writeFileSync(reportPath, JSON.stringify(reports, null, 2));
  console.log(`[ANALYZE] Report saved: ${reportPath}`);

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total products: ${reports.length}`);
  console.log(`With price: ${reports.filter(r => r.extractedData?.price).length}`);
  console.log(`With coupon: ${reports.filter(r => r.extractedData?.discountCoupon && r.extractedData.discountCoupon !== 'none').length}`);
  console.log(`Parser errors: ${reports.filter(r => r.parserError).length}`);

  return reports;
}

// ======================
// UTILITY COMMANDS
// ======================

function listFiles() {
  console.log('\nHTML SAMPLES (temporary):');
  console.log('-'.repeat(40));
  const samples = fs.existsSync(CONFIG.htmlSamplesDir)
    ? fs.readdirSync(CONFIG.htmlSamplesDir).filter(f => f.endsWith('.html'))
    : [];
  if (samples.length === 0) {
    console.log('  (empty)');
  } else {
    samples.forEach(f => {
      const stats = fs.statSync(path.join(CONFIG.htmlSamplesDir, f));
      console.log(`  ${f} (${(stats.size / 1024).toFixed(1)} KB)`);
    });
  }

  console.log('\nSAVED SAMPLES (permanent):');
  console.log('-'.repeat(40));
  const saved = fs.existsSync(CONFIG.savedSamplesDir)
    ? fs.readdirSync(CONFIG.savedSamplesDir).filter(f => f.endsWith('.html'))
    : [];
  if (saved.length === 0) {
    console.log('  (empty)');
  } else {
    saved.forEach(f => {
      const stats = fs.statSync(path.join(CONFIG.savedSamplesDir, f));
      console.log(`  ${f} (${(stats.size / 1024).toFixed(1)} KB)`);
    });
  }

  console.log('\nREPORTS:');
  console.log('-'.repeat(40));
  const reports = fs.existsSync(CONFIG.reportsDir)
    ? fs.readdirSync(CONFIG.reportsDir).filter(f => f.endsWith('.json'))
    : [];
  if (reports.length === 0) {
    console.log('  (empty)');
  } else {
    reports.forEach(f => console.log(`  ${f}`));
  }
}

function saveASIN(asin) {
  const srcPath = path.join(CONFIG.htmlSamplesDir, `${asin}.html`);
  const destPath = path.join(CONFIG.savedSamplesDir, `${asin}.html`);

  if (!fs.existsSync(srcPath)) {
    console.error(`[SAVE] ❌ No HTML file found for ${asin} in html-samples/`);
    return false;
  }

  fs.copyFileSync(srcPath, destPath);
  console.log(`[SAVE] ✅ ${asin}.html copied to saved-samples/`);
  return true;
}

function clean(keepReports = false) {
  // Clean html-samples
  if (fs.existsSync(CONFIG.htmlSamplesDir)) {
    const files = fs.readdirSync(CONFIG.htmlSamplesDir).filter(f => f.endsWith('.html'));
    files.forEach(f => fs.unlinkSync(path.join(CONFIG.htmlSamplesDir, f)));
    console.log(`[CLEAN] Deleted ${files.length} files from html-samples/`);
  }

  // Clean reports if requested
  if (!keepReports && fs.existsSync(CONFIG.reportsDir)) {
    const files = fs.readdirSync(CONFIG.reportsDir).filter(f => f.endsWith('.json'));
    files.forEach(f => fs.unlinkSync(path.join(CONFIG.reportsDir, f)));
    console.log(`[CLEAN] Deleted ${files.length} files from reports/`);
  }

  console.log('[CLEAN] ✅ Done');
}

function cleanSaved() {
  if (fs.existsSync(CONFIG.savedSamplesDir)) {
    const files = fs.readdirSync(CONFIG.savedSamplesDir).filter(f => f.endsWith('.html'));
    files.forEach(f => fs.unlinkSync(path.join(CONFIG.savedSamplesDir, f)));
    console.log(`[CLEAN] Deleted ${files.length} files from saved-samples/`);
  }
  console.log('[CLEAN] ✅ Done');
}

// ======================
// CLI
// ======================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'fetch':
      const asins = args.slice(1);
      if (asins.length === 0) {
        console.log('Usage: node test-runner.js fetch <ASIN> [ASIN2] [ASIN3] ...');
        process.exit(1);
      }
      for (const asin of asins) {
        await fetchProduct(asin);
      }
      break;

    case 'analyze':
      const analyzeAsin = args[1];
      if (analyzeAsin) {
        analyzeASIN(analyzeAsin);
      } else {
        analyzeAll();
      }
      break;

    case 'list':
      listFiles();
      break;

    case 'save':
      const saveAsin = args[1];
      if (!saveAsin) {
        console.log('Usage: node test-runner.js save <ASIN>');
        process.exit(1);
      }
      saveASIN(saveAsin);
      break;

    case 'clean':
      const keepReports = args.includes('--keep-reports');
      clean(keepReports);
      break;

    case 'clean-saved':
      cleanSaved();
      break;

    case 'help':
    default:
      console.log(`
Rankey Test Harness
===================

Commands:
  fetch <ASIN> [ASIN2...]   Fetch HTML from ScrapingBee and save locally
  analyze [ASIN]            Analyze saved HTML files (all or specific)
  list                      List all saved HTML files and reports
  save <ASIN>               Move HTML from samples to saved (permanent)
  clean                     Delete temporary HTML files and reports
  clean --keep-reports      Delete HTML but keep reports
  clean-saved               Delete permanently saved HTML samples

Examples:
  node test-runner.js fetch B08XYZ123 B07ABC456
  node test-runner.js analyze
  node test-runner.js analyze B08XYZ123
  node test-runner.js save B08XYZ123
  node test-runner.js clean
      `);
  }
}

main().catch(console.error);
