const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const CategorySchema = new Schema({
  nodeId: {
    type: String
  },
  name: {
    type: String
  },
  childNodes: {
    type: [{ type: Schema.Types.ObjectId, ref: 'category', }],
    default: [],
  },
  link: {
    type: String
  },
  state: {
    type: String,
    enum: ['created', 'started', 'completed'],
    validate: {
      validator: function (value) {
        if (!this.isMain) return value == null;
        return ['created', 'started', 'completed'].includes(value);
      },
      message: 'State is only allowed for main categories.'
    }
  },
  isMain: {
    type: Boolean,
    default: false
  },
  domain: {
    type: String,
    required: true
  }
}, { timestamps: true, strict: false });

let CategoryModel = mongoose.model('category', CategorySchema);

module.exports = { CategoryModel };
