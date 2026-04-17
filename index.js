require("dotenv").config();

const { Client, GatewayIntentBits } = require("discord.js");
const cron = require("node-cron");
const db = require("./database");

/*
DISCORD CLIENT
*/

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ]
});

/*
FORMAT DATE
DD/MM/YYYY
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

/*
FORMAT TIME
HH:MM
*/

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

  const message = {

    content:
      `⚔ **Battle Starting Now!** ⚔\n\n` +
      `🔥 <@${battle.host}> vs ${battle.opponent}\n\n` +
      (battle.liveLink
        ? `🔗 Watch here:\n${battle.liveLink}`
        : "")

  };

  /*
  ATTACH POSTER IF EXISTS
  */

  if (battle.posterdata) {

    message.files = [
      {
        attachment: battle.posterdata,
        name: "battle.jpg"
      }
    ];

  }

  await channel.send(message);

  console.log(
    `✅ Posted battle: ${battle.host} vs ${battle.opponent}`
  );
}

/*
CHECK DATABASE EVERY MINUTE
*/

async function checkBattles() {

  try {

    const currentDate = getCurrentDate();
    const currentTime = getCurrentTime();

    const result = await db.query(

      `SELECT *
       FROM battles
       WHERE posted = FALSE
       OR posted IS NULL`

    );

    const battles = result.rows;

    if (!battles.length) return;

    const channel =
      await client.channels.fetch(
        process.env.BATTLE_CHANNEL_ID
      );

    if (!channel) {

      console.error("❌ Channel not found");
      return;

    }

    for (const battle of battles) {

      if (
        battle.date === currentDate &&
        battle.time === currentTime
      ) {

        await postBattle(channel, battle);

        await db.query(

          "UPDATE battles SET posted = TRUE WHERE id = $1",

          [battle.id]

        );

      }

    }

  } catch (err) {

    console.error("Battle check error:", err);

  }

}

/*
RUN CRON LOOP
EVERY MINUTE
*/

cron.schedule("* * * * *", checkBattles);

/*
BOT READY EVENT
*/

client.once("clientReady", () => {

  console.log(
    `🔥 Ember Empire Battle Bot online as ${client.user.tag}`
  );

});

/*
LOGIN
*/

client.login(process.env.TOKEN)
  .then(() =>
    console.log("✅ Discord login successful")
  )
  .catch(err =>
    console.error("❌ Discord login failed:", err)
  );