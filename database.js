const { Pool } = require("pg");

/*
Railway PostgreSQL connection
*/

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

/*
Create battles table + required columns
*/

async function initDB() {

  try {

    /*
    Create table if missing
    */

    await pool.query(`

      CREATE TABLE IF NOT EXISTS battles (

        id SERIAL PRIMARY KEY,

        host TEXT,

        opponent TEXT,

        date TEXT,

        time TEXT,

        posterData BYTEA,

        liveLink TEXT,

        posted BOOLEAN DEFAULT FALSE

      )

    `);

    /*
    Ensure posted column exists for older tables
    */

    await pool.query(`

      ALTER TABLE battles
      ADD COLUMN IF NOT EXISTS posted BOOLEAN DEFAULT FALSE

    `);

    console.log("✅ PostgreSQL connected & schema synced successfully");

  } catch (err) {

    console.error("❌ PostgreSQL init error:", err);

  }

}

initDB();

module.exports = pool;