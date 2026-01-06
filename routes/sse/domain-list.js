const express = require('express');
const SSE = require('express-sse');

const domainListRouter = express.Router();

const sse = new SSE();

domainListRouter.get("/", async (req, res) => {
  sse.init(req, res);
});

function notifyDomainListClients(data) {
  sse.send(data);
}

module.exports = { domainListRouter, notifyDomainListClients };