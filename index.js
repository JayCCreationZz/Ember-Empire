const { Client, GatewayIntentBits } = require("discord.js");
const cron = require("node-cron");
const db = require("./database");

require("dotenv").config();

/*
CREATE DISCORD CLIENT
*/
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ]
});

/*
FORMAT DATE HELPERS
*/
function getCurrentDate() {
  const now = new Date();

  return (
    String(now.getDate()).padStart(2, "0") +
    "/" +
    String(now.getMonth() + 1).padStart(2, "0") +
    "/" +
    now.getFullYear()
  );
}

function getCurrentTime() {
  const now = new Date();

  return (
    String(now.getHours()).padStart(2, "0") +
    ":" +
    String(now.getMinutes()).padStart(2, "0")
  );
}

/*
POST BATTLE TO DISCORD
*/
async function postBattle(channel, battle) {

  await channel.send({
    content:
      `⚔ **Battle Starting Now!** ⚔\n\n` +
      `🔥 ${battle.host} vs ${battle.opponent}\n\n` +
      (battle.liveLink
        ? `🔗 Watch here:\n${battle.liveLink}`
        : ""),
    files: battle.poster
      ? ["." + battle.poster]
      : []
  });

  console.log(
    `✅ Posted battle: ${battle.host} vs ${battle.opponent}`
  );
}

/*
CHECK SCHEDULED BATTLES EVERY MINUTE
*/
async function checkBattles() {

  const currentDate = getCurrentDate();
  const currentTime = getCurrentTime();

  db.all(
    `SELECT * FROM battles WHERE posted = 0`,
    [],
    async (err, rows) => {

      if (err) {
        console.error("Database error:", err);
        return;
      }

      if (!rows.length) return;

      const channel = await client.channels.fetch(
        process.env.BATTLE_CHANNEL_ID
      );

      if (!channel) {
        console.error("Battle channel not found");
        return;
      }

      for (const battle of rows) {

        if (
          battle.date === currentDate &&
          battle.time === currentTime
        ) {

          await postBattle(channel, battle);

          db.run(
            `UPDATE battles SET posted = 1 WHERE id = ?`,
            [battle.id]
          );

        }

      }

    }
  );
}

/*
BOT READY EVENT
*/
client.once("clientReady", () => {

  console.log(
    `🔥 Ember Empire Battle Bot online as ${client.user.tag}`
  );

  /*
  RUN CHECK EVERY MINUTE
  */
  cron.schedule("* * * * *", () => {
    checkBattles();
  });

});

/*
LOGIN
*/
client.login(process.env.TOKEN);