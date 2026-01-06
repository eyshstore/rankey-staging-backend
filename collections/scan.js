const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ScanSchema = new Schema({
  // REQUIRED BASE
  type: {
    type: String,
    enum: ["ASIN", "Category", "Deals"],
    default: "category",
    required: true,
  },
  state: {
    type: String,
    enum: ["enqueued", "active", "stalling", "stalled", "halting", "completed"],
    default: "enqueued",
    required: true,
  },
  domain: {
    type: String,
    required: true,
  },
  numberOfProductsToGather: { type: Number, default: 0, },

  // Category / Deals
  mainCategoryId: {
    type: mongoose.Types.ObjectId,
    ref: 'category',
    default: null,
    set: v => (v === "" ? null : v)
  },
  minRank: {
    type: Number,
  },
  maxRank: {
    type: Number,
  },

  // RESULT
  categories: [{ type: Schema.Types.Mixed, default: [] }],
  products: [{ type: Schema.Types.ObjectId, ref: 'product', default: [] }],

  // MISC.
  requestsSent: { type: Number, default: 0, },
  startedAt: { type: Date, },
  completedAt: { type: Date, },
}, { timestamps: true, strict: false });

let ScanModel = mongoose.model('scan', ScanSchema);

module.exports.ScanModel = ScanModel;
