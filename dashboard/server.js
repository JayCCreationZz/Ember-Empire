const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const path = require('path');

const db = require('../database');

const config = {
    token: process.env.TOKEN,
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    guildId: process.env.GUILD_ID,
    callbackURL: process.env.CALLBACK_URL,

    // ✅ ROLE IDs ALLOWED INTO DASHBOARD
    managerRoles: [
        "1465436891238367284",
        "1493636042354331779"
    ]
};

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

/*
IMPORTANT FOR RAILWAY (REVERSE PROXY SUPPORT)
*/
app.set('trust proxy', 1);

/*
SESSION CONFIG (HTTPS SAFE)
*/
app.use(session({
    secret: "ember-empire-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: true,
        sameSite: "none"
    }
}));

app.use(passport.initialize());
app.use(passport.session());

/*
DISCORD LOGIN STRATEGY
*/
passport.use(new DiscordStrategy({
    clientID: config.clientId,
    clientSecret: config.clientSecret,
    callbackURL: config.callbackURL,
    scope: ['identify']
},
(accessToken, refreshToken, profile, done) => {

    profile.accessToken = accessToken;
    return done(null, profile);

}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

/*
ROLE ACCESS CHECK (ROLE-ID VERSION)
*/
async function userHasAccess(req) {

    try {

        if (!req.user || !req.user.id) {
            console.log("⚠️ No authenticated session user");
            return false;
        }

        const response = await fetch(
            `https://discord.com/api/guilds/${config.guildId}/members/${req.user.id}`,
            {
                headers: {
                    Authorization: `Bot ${config.token}`
                }
            }
        );

        if (!response.ok) {
            console.log("❌ Discord member lookup failed:", await response.text());
            return false;
        }

        const member = await response.json();

        if (!member.roles) {
            console.log("❌ Roles missing from Discord response");
            return false;
        }

        return member.roles.some(roleID =>
            config.managerRoles.includes(roleID)
        );

    } catch (err) {

        console.log("❌ Role check crashed:", err);
        return false;

    }

}

/*
AUTH MIDDLEWARE
*/
async function checkAuth(req, res, next) {

    if (!req.isAuthenticated())
        return res.redirect('/');

    const allowed = await userHasAccess(req);

    if (!allowed)
        return res.send("Access denied");

    next();

}

/*
LOGIN ROUTES
*/
app.get('/', (req, res) => res.render('login'));

app.get('/login', passport.authenticate('discord'));

app.get('/auth/callback',
    passport.authenticate('discord', { failureRedirect: '/' }),
    (req, res) => res.redirect('/dashboard')
);

app.get('/logout',
    (req, res) => req.logout(() => res.redirect('/'))
);

/*
DASHBOARD ROUTE (SAFE VERSION – FIXES 500 ERRORS)
*/
app.get('/dashboard', checkAuth, (req, res) => {

    db.all(
        "SELECT * FROM battles ORDER BY date, time",
        [],
        (err, battles) => {

            if (err) {
                console.log("❌ Database read error:", err);
                return res.status(500).send("Database error loading battles");
            }

            try {

                const week = {
                    Monday: [],
                    Tuesday: [],
                    Wednesday: [],
                    Thursday: [],
                    Friday: [],
                    Saturday: [],
                    Sunday: []
                };

                (battles || []).forEach(b => {

                    if (!b.date) return;

                    const parts = b.date.split('/');

                    if (parts.length !== 3) return;

                    const [d, m, y] = parts;

                    const dayName =
                        new Date(`${y}-${m}-${d}`)
                            .toLocaleDateString(
                                'en-GB',
                                { weekday: 'long' }
                            );

                    if (week[dayName])
                        week[dayName].push(b);

                });

                res.render('dashboard', {
                    battles: battles || [],
                    week
                });

            } catch (renderErr) {

                console.log("❌ Dashboard render error:", renderErr);
                res.status(500).send("Dashboard render failed");

            }

        }
    );

});

/*
PUBLIC CALENDAR (VISIBLE WITHOUT LOGIN)
*/
app.get('/calendar', (req, res) => {

    db.all(
        "SELECT * FROM battles ORDER BY date, time",
        [],
        (err, battles) => {

            if (err)
                return res.send("Database error");

            const week = {
                Monday: [],
                Tuesday: [],
                Wednesday: [],
                Thursday: [],
                Friday: [],
                Saturday: [],
                Sunday: []
            };

            (battles || []).forEach(b => {

                if (!b.date) return;

                const parts = b.date.split('/');

                if (parts.length !== 3) return;

                const [d, m, y] = parts;

                const dayName =
                    new Date(`${y}-${m}-${d}`)
                        .toLocaleDateString(
                            'en-GB',
                            { weekday: 'long' }
                        );

                if (week[dayName])
                    week[dayName].push(b);

            });

            res.render('calendar', { week });

        }
    );

});

/*
API FOR BOT SYNC
*/
app.get('/api/battles', (req, res) => {

    db.all("SELECT * FROM battles", [], (err, rows) => {

        if (err)
            return res.status(500).json({
                error: "Database error"
            });

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