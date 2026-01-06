require("dotenv").config();

const express = require('express');

const session = require('express-session');
const MongoStore = require("connect-mongo");

const timeout = require('connect-timeout');
const cors = require('cors');
const helmet = require('helmet');
const logger = require('morgan');
const cookieParser = require('cookie-parser');

const authRouter = require('./routes/auth');
const amazonRouter = require('./routes/amazon');
const productsRouter = require('./routes/products');

const app = express();

const { authMiddleware } = require("./middleware/auth.middleware");

const isProduction = process.env.NODE_ENV === 'production';
const corsOrigin = isProduction ? process.env.FRONTEND_URL : 'http://localhost:5173';
app.set("trust proxy", 1);

app.use(session({
  secret: process.env.SESSION_SECRET || 'simple-session-secret',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env["DB_HOST"],
    collectionName: "sessions",
  }),
  cookie: { 
    secure: isProduction,
    httpOnly: true,
    sameSite: isProduction ? "none" : "strict",
    maxAge: 24 * 60 * 60 * 1000
  }
}));

app.use(timeout('60s'));
app.use(cors({
  origin: corsOrigin,
  credentials: true
}));
app.use(helmet());
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.use("/auth", authRouter);
app.use("/amazon", amazonRouter);
app.use("/products", authMiddleware, productsRouter);

const startServer = port => {
  return new Promise((resolve) => {
    app.listen(port, '0.0.0.0', () => {
      resolve();
    });
  });
};

module.exports = { app, startServer };
