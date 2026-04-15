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