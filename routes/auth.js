const express = require("express");
const router = express.Router();

router.post("/", (req, res) => {
  const { username, password } = req.body;

  if (username === "admin" && password === "rankey2025!") {
    req.session.isAuthenticated = true;
    return res.status(200).json({ message: "Logged in successfully" });
  }

  return res.status(401).json({ message: "Invalid credentials" });
});

router.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ message: "Failed to logout" });
    }

    res.clearCookie("connect.sid");
    return res.status(200).json({ message: "Logged out successfully" });
  });
});

router.get("/check", (req, res) => {
  if (req.session && req.session.isAuthenticated) {
    return res.status(200).json({ message: "The user is authenticated" });
  }
  return res.status(401).json({ message: "The user is not authenticated" });
});

module.exports = router;
