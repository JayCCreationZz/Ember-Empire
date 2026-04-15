const sqlite3 = require("sqlite3").verbose();
const path = require("path");

/*
DATABASE FILE LOCATION
Railway-compatible path
*/
const dbPath = path.join(process.cwd(), "emberempire.db");

/*
CREATE DATABASE CONNECTION
*/
const db = new sqlite3.Database(dbPath, err => {
  if (err) {
    console.error("Database connection error:", err);
  } else {
    console.log("✅ Connected to SQLite database");
  }
});

/*
CREATE TABLE IF NOT EXISTS
*/
db.run(`
CREATE TABLE IF NOT EXISTS battles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    host TEXT,
    opponent TEXT,
    date TEXT,
    time TEXT,
    poster TEXT,
    liveLink TEXT,
    posted INTEGER DEFAULT 0
)
`);

module.exports = db;