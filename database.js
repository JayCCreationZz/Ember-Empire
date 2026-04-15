const sqlite3 = require("sqlite3").verbose();
const path = require("path");

/*
Force absolute database path so dashboard + bot share the same DB
*/
const dbPath = path.join(process.cwd(), "emberempire.db");

const db = new sqlite3.Database(dbPath);

/*
Create battles table if it doesn't exist
*/
db.run(`
CREATE TABLE IF NOT EXISTS battles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    host TEXT,
    opponent TEXT,
    date TEXT,
    time TEXT,
    poster TEXT,
    liveLink TEXT
)
`);

console.log("Database connected at:", dbPath);

module.exports = db;