const express = require('express');
const SSE = require('express-sse');

const { ScanModel } = require("../../collections/scan");

const scansListRouter = express.Router();
const sse = new SSE();

scansListRouter.get('/', async (req, res) => {
  sse.init(req, res);
});

async function notifyScansUpdate() {
  /*
  let scans = await ScanModel.find({}, {
    _id: 1,
    state: 1,
    type: 1,
    mainCategoryId: 1,
    domain: 1,
    minRank: 1,
    maxRank: 1,
    numberOfProductsToGather: 1,
  })
    .sort({ createdAt: -1 })
    .populate("mainCategoryId", "_id name")
    .lean();

  scans = scans.map(scan => ({
    ...scan,
    mainCategory: scan.mainCategoryId,
    mainCategoryId: undefined,
  }));

  sse.send(scans);
  */
   console.log("---UPDATING SCANS---");
  sse.send();
}

module.exports = { scansListRouter, notifyScansUpdate };