const sqlite3 = require("sqlite3").verbose();
const path = require("path");

/*
SHARED DATABASE PATH
Ensures dashboard + bot use same DB
*/
const dbPath = path.join(process.cwd(), "emberempire.db");

const db = new sqlite3.Database(dbPath, err => {
  if (err) {
    console.error("❌ Database connection error:", err);
  } else {
    console.log("✅ Connected to SQLite database");
  }
});

/*
CREATE TABLE
Includes posted flag for scheduler tracking
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