const express = require("express");
const cors = require("cors");
require("dotenv").config();
const db = require("./db");
const authRoutes = require("./routes/authRoutes");

const app = express();

app.disable("x-powered-by");
app.use(cors());
app.use(express.json({ limit: "10kb", strict: true }));
app.use(express.urlencoded({ extended: false, limit: "10kb", parameterLimit: 20 }));

app.get("/", (req, res) => {
    res.send("Remnant Orvex Capital API Running");
});

app.use("/api/auth", authRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});
