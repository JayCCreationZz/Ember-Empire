const { Pool } = require("pg");

/*
Railway provides DATABASE_URL automatically
*/

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

/*
Create table if missing
*/

async function initDB() {

  try {

    await pool.query(`

      CREATE TABLE IF NOT EXISTS battles (

        id SERIAL PRIMARY KEY,

        host TEXT,

        opponent TEXT,

        date TEXT,

        time TEXT,

        posterData BYTEA,

        liveLink TEXT

      )

    `);

    console.log("✅ PostgreSQL connected & table ready");

  } catch (err) {

    console.error("❌ PostgreSQL init error:", err);

  }

}

initDB();

module.exports = pool;