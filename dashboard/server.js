const express = require("express");
const session = require("express-session");
const passport = require("passport");
const DiscordStrategy = require("passport-discord").Strategy;
const multer = require("multer");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const db = require("../database");

const app = express();

/*
ROLE CONFIG
*/
const config = {
  token: process.env.TOKEN,
  clientId: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  guildId: process.env.GUILD_ID,
  callbackURL: process.env.CALLBACK_URL,

  ownerRoles: ["1465436891238367284"],
  adminRoles: ["1493636042354331779"],
  memberRoles: ["1458157807361720426"]
};

/*
UPLOAD TEMP STORAGE
*/
const upload = multer({
  dest: path.join(process.cwd(), "dashboard/public/posters/tmp")
});

/*
POSTER PROCESSOR (AUTO-RESIZE)
*/
async function processPoster(file) {

  if (!file) return null;

  const postersDir = path.join(
    process.cwd(),
    "dashboard/public/posters"
  );

  if (!fs.existsSync(postersDir)) {
    fs.mkdirSync(postersDir, { recursive: true });
  }

  const filename =
    Date.now() +
    "-" +
    file.originalname.replace(/\s+/g, "_");

  const outputPath = path.join(postersDir, filename);

  await sharp(file.path)
    .resize(1080, 1080, {
      fit: "cover",
      position: "centre"
    })
    .jpeg({ quality: 90 })
    .toFile(outputPath);

  fs.unlinkSync(file.path);

  return `/posters/${filename}`;
}

/*
VIEW ENGINE
*/
app.set("view engine", "ejs");

app.set(
  "views",
  path.join(process.cwd(), "dashboard/views")
);

/*
STATIC FILES (IMPORTANT FOR POSTERS)
*/
app.use(
  express.static(
    path.join(process.cwd(), "dashboard/public")
  )
);

app.use(express.urlencoded({ extended: true }));

/*
SESSION CONFIG
*/
app.set("trust proxy", 1);

app.use(
  session({
    secret: "ember-empire-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: true,
      sameSite: "none"
    }
  })
);

app.use(passport.initialize());
app.use(passport.session());

/*
DISCORD LOGIN
*/
passport.use(
  new DiscordStrategy(
    {
      clientID: config.clientId,
      clientSecret: config.clientSecret,
      callbackURL: config.callbackURL,
      scope: ["identify"]
    },
    (accessToken, refreshToken, profile, done) =>
      done(null, profile)
  )
);

passport.serializeUser((u, d) => d(null, u));
passport.deserializeUser((o, d) => d(null, o));

/*
ROLE CHECK
*/
async function getUserRoleLevel(req) {

  if (!req.user?.id) return "none";

  const response = await fetch(
    `https://discord.com/api/guilds/${config.guildId}/members/${req.user.id}`,
    {
      headers: {
        Authorization: `Bot ${config.token}`
      }
    }
  );

  if (!response.ok) return "none";

  const member = await response.json();

  if (member.roles.some(r => config.ownerRoles.includes(r)))
    return "owner";

  if (member.roles.some(r => config.adminRoles.includes(r)))
    return "admin";

  if (member.roles.some(r => config.memberRoles.includes(r)))
    return "member";

  return "none";
}

/*
AUTH CHECK
*/
async function checkAuth(req, res, next) {

  if (!req.isAuthenticated())
    return res.redirect("/");

  req.roleLevel = await getUserRoleLevel(req);

  if (req.roleLevel === "none")
    return res.send("Access denied");

  next();
}

/*
LOGIN ROUTES
*/
app.get("/", (req, res) => res.render("login"));

app.get("/login", passport.authenticate("discord"));

app.get(
  "/auth/callback",
  passport.authenticate("discord", {
    failureRedirect: "/"
  }),
  (req, res) => res.redirect("/dashboard")
);

app.get("/logout", (req, res) =>
  req.logout(() => res.redirect("/"))
);

/*
DASHBOARD VIEW
SHOW ALL BATTLES
*/
app.get("/dashboard", checkAuth, (req, res) => {

  db.all(
    "SELECT * FROM battles ORDER BY date, time",
    [],
    (err, battles) => {

      if (err)
        return res.send("Database error");

      res.render("dashboard", {
        battles,
        roleLevel: req.roleLevel
      });

    }
  );

});

/*
CREATE BATTLE + SEND POSTER TO DISCORD
*/
app.post(
  "/create",
  checkAuth,
  upload.single("poster"),
  async (req, res) => {

    if (!["owner", "admin"].includes(req.roleLevel))
      return res.send("Permission denied");

    const {
      host,
      opponent,
      date,
      time,
      liveLink
    } = req.body;

    const poster = await processPoster(req.file);

    db.run(
      `INSERT INTO battles
       (host, opponent, date, time, poster, liveLink)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        host,
        opponent,
        date,
        time,
        poster,
        liveLink
      ],
      async () => {

        /*
        SEND TO DISCORD WITH IMAGE
        */
        try {

          const FormData = require("form-data");

          const form = new FormData();

          form.append(
            "payload_json",
            JSON.stringify({
              content:
                `🔥 **New Battle Scheduled!** 🔥\n\n` +
                `⚔ ${host} vs ${opponent}\n` +
                `📅 ${date} ⏰ ${time}\n\n` +
                (liveLink
                  ? `🔗 Watch here:\n${liveLink}`
                  : "")
            })
          );

          if (poster) {

            const posterPath = path.join(
              process.cwd(),
              "dashboard/public",
              poster
            );

            form.append(
              "files[0]",
              fs.createReadStream(posterPath)
            );

          }

          await fetch(
            `https://discord.com/api/v10/channels/${process.env.BATTLE_CHANNEL_ID}/messages`,
            {
              method: "POST",
              headers: {
                Authorization: `Bot ${process.env.TOKEN}`
              },
              body: form
            }
          );

          console.log(
            `📢 Poster sent to Discord: ${host} vs ${opponent}`
          );

        } catch (err) {

          console.log("Discord post failed:", err);

        }

        res.redirect("/dashboard");

      }
    );

  }
);

/*
DELETE BATTLE
*/
app.post("/delete/:id", checkAuth, (req, res) => {

  if (!["owner", "admin"].includes(req.roleLevel))
    return res.send("Permission denied");

  db.run(
    "DELETE FROM battles WHERE id=?",
    [req.params.id]
  );

  res.redirect("/dashboard");

});

/*
PUBLIC CALENDAR
*/
app.get("/calendar", (req, res) => {

  db.all(
    "SELECT * FROM battles ORDER BY date, time",
    [],
    (err, battles) => {

      if (err)
        return res.send("Database error");

      res.render("calendar", { battles });

    }
  );

});

/*
START SERVER
*/
const PORT = process.env.PORT || 8080;

app.listen(PORT, () =>
  console.log(
    `🔥 Ember Empire dashboard running on port ${PORT}`
  )
);