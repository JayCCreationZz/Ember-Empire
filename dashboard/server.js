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
    managerRoles: ["Owner", "Admin"]
};

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

/*
SESSION CONFIG
*/

app.use(session({
    secret: "ember-empire-secret",
    resave: false,
    saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

/*
DISCORD OAUTH STRATEGY
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
ROLE ACCESS CHECK
*/

async function userHasAccess(req) {

    try {

        const memberResponse = await fetch(
            `https://discord.com/api/guilds/${config.guildId}/members/${req.user.id}`,
            {
                headers: {
                    Authorization: `Bot ${config.token}`
                }
            }
        );

        if (!memberResponse.ok) {

            console.log("Member lookup failed:",
                await memberResponse.text());

            return false;

        }

        const member = await memberResponse.json();

        const rolesResponse = await fetch(
            `https://discord.com/api/guilds/${config.guildId}/roles`,
            {
                headers: {
                    Authorization: `Bot ${config.token}`
                }
            }
        );

        if (!rolesResponse.ok) {

            console.log("Role list fetch failed:",
                await rolesResponse.text());

            return false;

        }

        const roles = await rolesResponse.json();

        if (!Array.isArray(roles)) {

            console.log("Invalid roles response:", roles);

            return false;

        }

        const allowedRoleIDs = roles
            .filter(role =>
                config.managerRoles.includes(role.name)
            )
            .map(role => role.id);

        return member.roles.some(roleID =>
            allowedRoleIDs.includes(roleID)
        );

    } catch (err) {

        console.log("Role check error:", err);

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
DEBUG ROLE VIEWER
TEMPORARY TEST ROUTE
*/

app.get('/debug-roles', async (req, res) => {

    if (!req.isAuthenticated())
        return res.send("Not logged in");

    try {

        const memberResponse = await fetch(
            `https://discord.com/api/guilds/${config.guildId}/members/${req.user.id}`,
            {
                headers: {
                    Authorization: `Bot ${config.token}`
                }
            }
        );

        const member = await memberResponse.json();

        res.json(member);

    } catch (err) {

        res.send(err.toString());

    }

});

/*
DASHBOARD VIEW
*/

app.get('/dashboard', checkAuth, (req, res) => {

    db.all(
        "SELECT * FROM battles ORDER BY date,time",
        [],
        (err, battles) => {

            const week = {
                Monday: [],
                Tuesday: [],
                Wednesday: [],
                Thursday: [],
                Friday: [],
                Saturday: [],
                Sunday: []
            };

            battles.forEach(b => {

                const [d, m, y] = b.date.split('/');

                const dayName =
                    new Date(`${y}-${m}-${d}`)
                        .toLocaleDateString(
                            'en-GB',
                            { weekday: 'long' }
                        );

                if (week[dayName])
                    week[dayName].push(b);

            });

            res.render('dashboard', { battles, week });

        }
    );

});

/*
PUBLIC CALENDAR
*/

app.get('/calendar', (req, res) => {

    db.all(
        "SELECT * FROM battles ORDER BY date,time",
        [],
        (err, battles) => {

            const week = {
                Monday: [],
                Tuesday: [],
                Wednesday: [],
                Thursday: [],
                Friday: [],
                Saturday: [],
                Sunday: []
            };

            battles.forEach(b => {

                const [d, m, y] = b.date.split('/');

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
API ENDPOINT FOR BOT SYNC
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

    console.log(
        `🔥 Ember Empire dashboard running on port ${PORT}`
    );

});