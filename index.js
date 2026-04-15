const { Client, GatewayIntentBits } = require("discord.js");
const cron = require("node-cron");
const sqlite3 = require("sqlite3").verbose();

// LOAD ENV VARIABLES FROM RAILWAY
const config = {
  token: process.env.TOKEN,
  guildId: process.env.GUILD_ID
};

// CREATE DISCORD CLIENT
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers
  ]
});

// LOAD DATABASE
const db = new sqlite3.Database("./flameforce.db");

/*
BOT READY EVENT
*/

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

/*
AUTO BATTLE REMINDER SYSTEM
Checks database every minute
*/

cron.schedule("* * * * *", async () => {

  const now = new Date();

  const currentTime =
    now.toTimeString().slice(0, 5); // HH:MM format

  const currentDate =
    now.toLocaleDateString("en-GB");

  db.all(
    "SELECT * FROM battles WHERE date = ? AND time = ?",
    [currentDate, currentTime],
    async (err, rows) => {

      if (err) {
        console.log("Database reminder error:", err);
        return;
      }

      if (!rows.length) return;

      const guild = client.guilds.cache.get(config.guildId);

      if (!guild) return;

      const channel =
        guild.systemChannel ||
        guild.channels.cache.find(c =>
          c.isTextBased?.()
        );

      if (!channel) return;

      rows.forEach(async battle => {

        try {

          await channel.send(
            `🔥 **Battle Starting Now!**
Host: ${battle.host}
Opponent: ${battle.opponent}
Time: ${battle.time}

${battle.liveLink || ""}`
          );

        } catch (err) {

          console.log("Reminder send error:", err);

        }

      });

    }
  );

});

/*
LOGIN BOT
*/

client.login(config.token);