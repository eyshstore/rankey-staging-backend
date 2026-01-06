const express = require("express");
const { ProductModel } = require("../collections/product");

const productsRouter = express.Router();

productsRouter.get("/", async (req, res) => {
  const { domain } = req.query;
  const products = await ProductModel.find({ domain }).lean();
  return res.status(200).json({ products });
});

module.exports = productsRouter;