const express = require('express');
const SSE = require('express-sse');

const domainDetailsRouter = express.Router();

const sse = new SSE();

domainDetailsRouter.get("/", async (req, res) => {
  sse.init(req, res);
});

function notifyDomainDetailsClients(type, patch) {
  sse.send({ type, patch });
}

module.exports = { domainDetailsRouter, notifyDomainDetailsClients };