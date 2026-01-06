const axios = require("axios");
const cheerio = require("cheerio");

const { CategoryModel } = require("../collections/category");
const { notifyDomainListClients } = require("../routes/sse/domain-list");
const { notifyDomainDetailsClients } = require("../routes/sse/domain-details");

const domainsState = {
  "com": false,
  "de": false,
};

function getDomainsState() {
  console.log('Retrieving domains state:', domainsState);
  return domainsState;
}

const breadcrumbs = {
  "com": [],
  "de": [],
};

function getBreadcrumbs() {
  console.log('Retrieving breadcrumbs:', breadcrumbs);
  return breadcrumbs;
}

async function getMainCategoriesState(domain) {
  console.log(`Fetching main categories state for domain: ${domain}`);
  const mainCategoriesState = await CategoryModel.find(
    { isMain: true, domain },
    { state: 1, name: 1, nodeId: 1, _id: 1 }
  ).lean();
  console.log(`Main categories state for ${domain}:`, mainCategoriesState);
  return mainCategoriesState;
}

async function getCategoriesFromPage(categoriesPageLink, domain, isMain) {
  console.log(`Fetching categories from page: ${categoriesPageLink}, domain: ${domain}, isMain: ${isMain}`);
  try {
    const { data: categoriesPage } = await axios.get(categoriesPageLink);
    console.log(`Successfully fetched page: ${categoriesPageLink}`);
    const $ = cheerio.load(categoriesPage);
    const categories = [];
  
    $("tr").each((i, elem) => {
      if (i === 0) {
        console.log('Skipping header row');
        return;
      }
      const tds = $("td", elem);
      
      if (tds.length == 1) {
        console.log('Skipping leaf node row');
        return;
      }

      const name = $(tds[0]).text().trim();
      const nodeId = $(tds[1]).text().trim();
      let link = "";
      if (isMain) {
        link = `https://www.browsenodes.com${$("a.read-more", tds[3])[0].attribs.href}`;
      } else {
        link = `https://www.browsenodes.com${$("a.read-more", tds[2])[0].attribs.href}`;
      }
      console.log(`Found category - Name: ${name}, NodeId: ${nodeId}, Link: ${link}`);
      
      categories.push({
        name, 
        nodeId,
        link, 
        domain, 
        isMain,
        ...(isMain && { state: "created" })
      });
    });
  
    console.log(`Categories collected: ${categories.length}`);
    return categories;
  } catch (error) {
    console.error(`Failed to fetch categories from ${categoriesPageLink}:`, error.message);
    return [];
  }
}

async function startGathering(domain) {
  console.log(`Starting gathering process for domain: ${domain}`);
  if (domainsState[domain]) {
    console.log(`Gathering already in progress for ${domain}`);
    return { status: 400, message: `Category gathering for ${domain} is already in progress` };
  }

  if (!(domain in domainsState)) {
    console.log(`Domain ${domain} not found in domainsState`);
    return { status: 400, message: `Domain ${domain} not found` };
  }

  domainsState[domain] = true;
  console.log(`Setting domain state to true for ${domain}`);
  notifyDomainListClients(domainsState);

  try {
    console.log(`Deleting existing categories for ${domain}`);
    await CategoryModel.deleteMany({ domain });
    console.log(`Notifying clients of categories update for ${domain}`);
    notifyDomainDetailsClients("categories_update", { domain, mainCategoriesState: [] });

    console.log(`Starting main categories gathering for ${domain}`);
    gatherMainCategories(domain);
    console.log(`Completed gathering for ${domain}`);
    return { status: 200, message: `Gathering of main categories in ${domain} started.` };
  } catch (error) {
    console.error(`Error gathering categories for ${domain}:`, error.message);
    domainsState[domain] = false;
    breadcrumbs[domain] = [];
    console.log(`Resetting domain state and breadcrumbs for ${domain}`);
    notifyDomainListClients(domainsState);
    notifyDomainDetailsClients("breadcrumbs_update", { domain, breadcrumbs: breadcrumbs[domain] });
    return { status: 500, message: error.message };
  }
}

async function gatherMainCategories(domain) {
  console.log(`Gathering main categories for domain: ${domain}`);
  const mainCategories = await getCategoriesFromPage(`https://www.browsenodes.com/amazon.${domain}`, domain, true);
  if (mainCategories.length === 0) {
    console.error(`No main categories found for ${domain}`);
    throw new Error("No main categories found");
  }

  console.log(`Saving ${mainCategories.length} main categories for ${domain}`);
  const savedCategories = await CategoryModel.insertMany(mainCategories);
  console.log(`Notifying clients of categories update for ${domain}`);
  notifyDomainDetailsClients("categories_update", { domain, mainCategoriesState: await getMainCategoriesState(domain) });

  for (const mainCategory of savedCategories) {
    console.log(`Processing main category: ${mainCategory.name}`);
    await CategoryModel.findByIdAndUpdate(mainCategory._id, { state: "started" });
    console.log(`Updated state to 'started' for category: ${mainCategory.name}`);
    notifyDomainDetailsClients("categories_update", { domain, mainCategoriesState: await getMainCategoriesState(domain) });

    breadcrumbs[domain] = [mainCategory.name];
    console.log(`Setting breadcrumbs for ${domain}:`, breadcrumbs[domain]);
    notifyDomainDetailsClients("breadcrumbs_update", { domain, breadcrumbs: breadcrumbs[domain] });

    console.log(`Gathering subcategories for ${mainCategory.name}`);
    await gatherSubCategories(mainCategory._id, domain, mainCategory.link, [mainCategory.name]);

    await CategoryModel.findByIdAndUpdate(mainCategory._id, { state: "completed" });
    console.log(`Updated state to 'completed' for category: ${mainCategory.name}`);
    notifyDomainDetailsClients("categories_update", { domain, mainCategoriesState: await getMainCategoriesState(domain) });

    breadcrumbs[domain] = [];
    console.log(`Clearing breadcrumbs for ${domain}`);
    notifyDomainDetailsClients("breadcrumbs_update", { domain, breadcrumbs: breadcrumbs[domain] });

    console.log(`Sleeping for 1000ms`);
    await sleep(1000);
  }

  domainsState[domain] = false;
  console.log(`Setting domain state to false for ${domain}`);
  notifyDomainListClients(domainsState);
}

async function gatherSubCategories(parentCategoryId, domain, link, currentBreadcrumbs) {
  try {
    const indent = "  ".repeat(currentBreadcrumbs.length);
    console.log(`${indent}Gathering subcategories for parent ID: ${parentCategoryId}, link: ${link}`);
    breadcrumbs[domain] = currentBreadcrumbs;
    console.log(`${indent}Updating breadcrumbs for ${domain}:`, currentBreadcrumbs);
    notifyDomainDetailsClients("breadcrumbs_update", { domain, breadcrumbs: currentBreadcrumbs });

    const categories = await getCategoriesFromPage(link, domain, false);
    console.log(`${indent}Found ${categories.length} subcategories`);
    if (categories.length === 0) {
      console.log(`${indent}No subcategories found at ${link}`);
      return;
    }

    console.log(`${indent}Saving ${categories.length} subcategories`);
    const savedCategories = await CategoryModel.insertMany(categories);
    console.log(`${indent}Updating parent category ${parentCategoryId} with child nodes`);
    await CategoryModel.findByIdAndUpdate(parentCategoryId, { 
      $set: { childNodes: savedCategories.map(category => category._id) }
    });

    for (const category of savedCategories) {
      console.log(`${indent}Processing subcategory: ${category.name}`);
      await gatherSubCategories(category._id, domain, category.link, [...currentBreadcrumbs, category.name]);
    }
  } catch (error) {
    const indent = "  ".repeat(currentBreadcrumbs.length);
    console.error(`${indent}Error processing subcategory at ${link}:`, error.message);
  }
}

function sleep(duration) {
  console.log(`Sleeping for ${duration}ms`);
  return new Promise(resolve => setTimeout(resolve, duration));
}

module.exports = { getDomainsState, getBreadcrumbs, getMainCategoriesState, startGathering };
