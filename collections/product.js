const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Helper: safe string enum validator
const safeEnum = (values) => ({
  type: String,
  enum: values,
  validate: {
    validator: v => !v || values.includes(v),
    message: props => `${props.value} is not a valid value`
  }
});

// Change History Schema (Embedded)
const ChangeHistoryEntrySchema = new Schema(
  {
    scanId: { type: Schema.Types.ObjectId, ref: 'scan' },
    status: safeEnum(["failed", "absent", "recorded"]),
    sentRequests: { type: Number, default: 0 },
    sentRequests:         { type: Number },
    requestedAt:          { type: Date, },
    receivedAt:          { type: Date, },
    changedFields: [
      {
        field: { type: String },
        newValue: { type: Schema.Types.Mixed },
      },
    ],
  },
  { _id: false }
);

// Main Product Schema
const ProductSchema = new Schema(
  {
    scanId:               { type: Schema.Types.ObjectId, ref: 'scan' },
    status:               safeEnum(["failed", "absent", "recorded"]),
    proxyCountry:         { type: String },
    ASIN:                 { type: String },
    domain:               { type: String },
    title:                { type: String },
    price:                { type: String },
    category:             { type: String },
    isPrime:              { type: Boolean },
    brand:                { type: String },
    sentRequests:         { type: Number },
    requestedAt:          { type: Date, },
    receivedAt:           { type: Date, },
    rank: {
      type: Number,
      set: v => {
        const num = Number(v);
        return isNaN(num) ? undefined : num;
      },
    },
    availabilityQuantity: {
      type: Number,
      set: v => {
        const num = Number(v);
        return isNaN(num) ? undefined : num;
      },
    },
    availabilityStatus:   { type: String },
    color:                { type: String },
    size:                 { type: String },
    dateFirstAvailable:   { type: String },
    discountCoupon:       { type: String },
    ratingStars:          { type: String },
    purchaseInfo:         { type: String },
    changeHistory:        {
      type: [ChangeHistoryEntrySchema],
      default: [],
    },
  },
  {
    timestamps: true,
    strict: false,
  }
);

// Ensure index
ProductSchema.index({ scanId: 1 });

// Create model
let ProductModel = mongoose.model("product", ProductSchema);

module.exports = { ProductModel };
