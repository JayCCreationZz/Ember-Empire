const express = require("express");
const session = require("express-session");
const passport = require("passport");
const DiscordStrategy = require("passport-discord").Strategy;
const path = require("path");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const db = require("../database");

const app = express();

/*
ENV CONFIG (Railway Variables)
*/
const config = {
  token: process.env.TOKEN,
  clientId: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  guildId: process.env.GUILD_ID,
  callbackURL: process.env.CALLBACK_URL,

  ownerRoles: ["1465436891238367284"],
  adminRoles: ["1493636042354331779"]
};

/*
VIEW ENGINE
*/
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

/*
STATIC FILES (LOGO + FAVICON SUPPORT)
*/
app.use(express.static(path.join(__dirname, "public")));

app.use(express.urlencoded({ extended: true }));

/*
SESSION SUPPORT (REQUIRED FOR RAILWAY HTTPS)
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
DISCORD LOGIN STRATEGY
*/
passport.use(
  new DiscordStrategy(
    {
      clientID: config.clientId,
      clientSecret: config.clientSecret,
      callbackURL: config.callbackURL,
      scope: ["identify"]
    },
    (accessToken, refreshToken, profile, done) => {
      profile.accessToken = accessToken;
      return done(null, profile);
    }
  )
);

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

/*
ROLE LEVEL DETECTION
*/
async function getUserRoleLevel(req) {
  try {
    if (!req.user?.id) return "none";

    const response = await fetch(
      `https://discord.com/api/guilds/${config.guildId}/members/${req.user.id}`,
      {
        headers: {
          Authorization: `Bot ${config.token}`
        }
      }
    );

    if (!response.ok) {
      console.log("Discord lookup failed");
      return "none";
    }

    const member = await response.json();

    if (!member.roles) return "none";

    if (member.roles.some(r => config.ownerRoles.includes(r)))
      return "owner";

    if (member.roles.some(r => config.adminRoles.includes(r)))
      return "admin";

    return "none";
  } catch (err) {
    console.log("Role detection error:", err);
    return "none";
  }
}

/*
AUTH CHECK
*/
async function checkAuth(req, res, next) {
  if (!req.isAuthenticated()) return res.redirect("/");

  const roleLevel = await getUserRoleLevel(req);

  if (roleLevel === "none") return res.send("Access denied");

  req.roleLevel = roleLevel;

  next();
}

/*
LOGIN ROUTES
*/
app.get("/", (req, res) => res.render("login"));

app.get("/login", passport.authenticate("discord"));

app.get(
  "/auth/callback",
  passport.authenticate("discord", { failureRedirect: "/" }),
  (req, res) => res.redirect("/dashboard")
);

app.get("/logout", (req, res) => {
  req.logout(() => res.redirect("/"));
});

/*
DASHBOARD VIEW
*/
app.get("/dashboard", checkAuth, (req, res) => {
  db.all("SELECT * FROM battles ORDER BY date, time", [], (err, battles) => {
    if (err) {
      console.log("Database error:", err);
      return res.status(500).send("Database error");
    }

    res.render("dashboard", {
      battles: battles || [],
      roleLevel: req.roleLevel
    });
  });
});

/*
CREATE BATTLE (OWNER + ADMIN)
*/
app.post("/create", checkAuth, (req, res) => {
  if (!["owner", "admin"].includes(req.roleLevel))
    return res.send("Permission denied");

  const { host, opponent, date, time, poster, liveLink } = req.body;

  db.run(
    `INSERT INTO battles (host, opponent, date, time, poster, liveLink)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [host, opponent, date, time, poster, liveLink]
  );

  res.redirect("/dashboard");
});

/*
EDIT BATTLE (OWNER + ADMIN)
*/
app.post("/edit/:id", checkAuth, (req, res) => {
  if (!["owner", "admin"].includes(req.roleLevel))
    return res.send("Permission denied");

  const { host, opponent, date, time, poster, liveLink } = req.body;

  db.run(
    `UPDATE battles
     SET host=?, opponent=?, date=?, time=?, poster=?, liveLink=?
     WHERE id=?`,
    [host, opponent, date, time, poster, liveLink, req.params.id]
  );

  res.redirect("/dashboard");
});

/*
DELETE BATTLE (OWNER ONLY)
*/
app.post("/delete/:id", checkAuth, (req, res) => {
  if (req.roleLevel !== "owner")
    return res.send("Only Owners can delete battles");

  db.run(`DELETE FROM battles WHERE id=?`, [req.params.id]);

  res.redirect("/dashboard");
});

/*
PUBLIC CALENDAR
*/
app.get("/calendar", (req, res) => {
  db.all("SELECT * FROM battles ORDER BY date, time", [], (err, battles) => {
    if (err) return res.send("Database error");

    res.render("calendar", {
      battles: battles || []
    });
  });
});

/*
API ENDPOINT FOR BOT SYNC
*/
app.get("/api/battles", (req, res) => {
  db.all("SELECT * FROM battles", [], (err, rows) => {
    if (err) return res.status(500).json({ error: "Database error" });

    res.json(rows);
  });
});

/*
START SERVER
*/
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`🔥 Ember Empire dashboard running on port ${PORT}`);
});