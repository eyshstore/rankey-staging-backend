const express = require('express');
const SSE = require('express-sse');

const scanDetailsRouter = express.Router();
const sse = new SSE();

scanDetailsRouter.get('/', async (req, res) => {
  sse.init(req, res);
});

async function notifyScanProgress(scanId, details) {
  sse.send({ scanId, details });
}

module.exports = { scanDetailsRouter, notifyScanProgress };
