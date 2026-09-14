require("dotenv").config();

const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const methodOverride = require("method-override");
const helmet = require("helmet");
const morgan = require("morgan");
const engine = require("ejs-mate");

const connectDB = require("./config/db");

const app = express();

connectDB();

app.engine("ejs", engine);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan("dev"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride("_method"));
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      collectionName: "sessions",
    }),
    cookie: {
      maxAge: 1000 * 60 * 60 * 24,
    },
  })
);

app.use("/auth", require("./routes/authRoutes"));

app.get("/", (req, res) => {
  res.render("index");
});

app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    database: mongoose.connection.readyState === 1 ? "CONNECTED" : "DISCONNECTED",
  });
});

app.use((req, res) => {
  res.status(404).send("Page not found");
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`MetaSync running at http://localhost:${port}`);
});