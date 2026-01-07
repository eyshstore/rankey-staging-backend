const Mongoose = require("mongoose");

Mongoose.set("strictQuery", true);

const connectDB = async () => {
  try {
    console.log(`Connecting to:[${process.env["DB_HOST"]}]`);
    await Mongoose.connect(process.env["DB_HOST"], { useNewUrlParser: true, useUnifiedTopology: true });
    console.log("Database connection is successful");
    global.db = Mongoose.connection;
  } catch (error) {
    console.error(`Error when connecting to the ${process.env["DB_HOST"]}: `, error);
  }
};

module.exports = { connectDB };
