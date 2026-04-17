require("dotenv").config();

const express = require("express");
const session = require("express-session");
const passport = require("passport");
const DiscordStrategy = require("passport-discord").Strategy;
const multer = require("multer");
const sharp = require("sharp");
const fs = require("fs");
const axios = require("axios");
const FormData = require("form-data");

const db = require("../database");

const app = express();

/*
ROLE IDS (EMBER EMPIRE)
*/
const OWNER_ROLES = ["1465436891238367284"];
const ADMIN_ROLES = ["1493636042354331779"];
const MEMBER_ROLES = ["1458157807361720426"];

/*
UPLOAD TEMP STORAGE
*/
const upload = multer({ dest: "tmp/" });

/*
POSTER PROCESSOR
AUTO RESIZE 1080x1080
*/
async function processPoster(file) {

if (!file) return null;

const buffer =
await sharp(file.path)
.resize(1080,1080,{fit:"cover"})
.jpeg({quality:92})
.toBuffer();

fs.unlinkSync(file.path);

return buffer;

}

/*
EXPRESS CONFIG
*/
app.set("view engine","ejs");

app.set(
"views",
process.cwd()+"/dashboard/views"
);

app.use(express.static(
process.cwd()+"/dashboard/public"
));

app.use(express.urlencoded({extended:true}));

app.set("trust proxy",1);

app.use(session({

secret:
process.env.SESSION_SECRET || "ember-empire-secret",

resave:false,
saveUninitialized:false,

cookie:{
secure:true,
sameSite:"none"
}

}));

app.use(passport.initialize());
app.use(passport.session());

/*
DISCORD LOGIN
*/
passport.use(new DiscordStrategy({

clientID:process.env.CLIENT_ID,
clientSecret:process.env.CLIENT_SECRET,
callbackURL:process.env.CALLBACK_URL,
scope:["identify"]

},

(accessToken,refreshToken,profile,done)=>
done(null,profile)

));

passport.serializeUser((u,d)=>d(null,u));
passport.deserializeUser((o,d)=>d(null,o));

/*
ROLE LOOKUP
*/
async function getUserRoleLevel(req){

try{

const response =
await axios.get(

`https://discord.com/api/v10/guilds/${process.env.GUILD_ID}/members/${req.user.id}`,

{
headers:{
Authorization:`Bot ${process.env.TOKEN}`
}
}

);

const roles = response.data.roles || [];

if(roles.some(r=>OWNER_ROLES.includes(r)))
return "owner";

if(roles.some(r=>ADMIN_ROLES.includes(r)))
return "admin";

if(roles.some(r=>MEMBER_ROLES.includes(r)))
return "member";

return "none";

}catch(err){

console.log("Role lookup error:",err.message);

return "none";

}

}

/*
AUTH CHECK
*/
async function checkAuth(req,res,next){

if(!req.isAuthenticated())
return res.redirect("/");

req.roleLevel =
await getUserRoleLevel(req);

if(req.roleLevel==="none")
return res.send("Access denied");

next();

}

/*
POSTER ENDPOINT
SERVES IMAGE FROM DATABASE
*/
app.get("/poster/:id", async(req,res)=>{

try{

const result =
await db.query(
"SELECT posterData FROM battles WHERE id=$1",
[req.params.id]
);

if(!result.rows.length ||
!result.rows[0].posterdata)
return res.sendStatus(404);

res.set("Content-Type","image/jpeg");

res.send(result.rows[0].posterdata);

}catch(err){

console.log("Poster fetch error:",err.message);

res.sendStatus(500);

}

});

/*
LOGIN ROUTES
*/
app.get("/",(req,res)=>res.render("login"));

app.get("/login",
passport.authenticate("discord")
);

app.get(
"/auth/callback",

passport.authenticate(
"discord",
{failureRedirect:"/"}
),

(req,res)=>res.redirect("/dashboard")

);

app.get(
"/logout",
(req,res)=>req.logout(()=>res.redirect("/"))
);

/*
DASHBOARD
*/
app.get(
"/dashboard",

checkAuth,

async(req,res)=>{

const battles =
await db.query(
"SELECT * FROM battles ORDER BY date,time"
);

res.render("dashboard",{

battles:battles.rows,
roleLevel:req.roleLevel

});

});

/*
CREATE BATTLE
*/
app.post(
"/create",

checkAuth,

upload.single("poster"),

async(req,res)=>{

if(!["owner","admin"].includes(req.roleLevel))
return res.send("Permission denied");

const posterBuffer =
await processPoster(req.file);

await db.query(

`INSERT INTO battles
(host,opponent,date,time,posterData,
liveLink,managerGifting,adultOnly,
powerUps,noHammers)

VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,

[
req.body.host,
req.body.opponent,
req.body.date,
req.body.time,
posterBuffer,
req.body.liveLink,
req.body.managerGifting==="true",
req.body.adultOnly==="true",
req.body.powerUps==="true",
req.body.noHammers==="true"
]

);

/*
POST TO DISCORD
*/
try{

const form = new FormData();

form.append(

"content",

`🔥 **New Battle Scheduled**

⚔ <@${req.body.host}> vs ${req.body.opponent}

📅 ${req.body.date}
⏰ ${req.body.time}

🎁 Manager Gifting:
${req.body.managerGifting==="true"?"Allowed":"Disabled"}

🔞 18+:
${req.body.adultOnly==="true"?"Enabled":"Disabled"}

⚡ Power Ups:
${req.body.powerUps==="true"?"Allowed":"Disabled"}

🔨 No Hammers:
${req.body.noHammers==="true"?"Enabled":"Disabled"}

${req.body.liveLink || ""}`
);

if(posterBuffer){

form.append(
"files[0]",
posterBuffer,
{
filename:"battle.jpg",
contentType:"image/jpeg"
}
);

}

await axios.post(

`https://discord.com/api/v10/channels/${process.env.BATTLE_CHANNEL_ID}/messages`,

form,

{
headers:{
Authorization:`Bot ${process.env.TOKEN}`,
...form.getHeaders()
}
}

);

}catch(err){

console.log("Discord post failed:",err.message);

}

res.redirect("/dashboard");

});

/*
REPLACE POSTER
*/
app.post(
"/replace-poster/:id",

checkAuth,

upload.single("poster"),

async(req,res)=>{

if(!["owner","admin"].includes(req.roleLevel))
return res.redirect("/dashboard");

const posterBuffer =
await processPoster(req.file);

await db.query(

"UPDATE battles SET posterData=$1 WHERE id=$2",

[posterBuffer,req.params.id]
);

res.redirect("/dashboard");

});

/*
DELETE BATTLE
*/
app.post(
"/delete/:id",

checkAuth,

async(req,res)=>{

if(!["owner","admin"].includes(req.roleLevel))
return res.redirect("/dashboard");

await db.query(
"DELETE FROM battles WHERE id=$1",
[req.params.id]
);

res.redirect("/dashboard");

});

/*
CALENDAR VIEW
*/
app.get(
"/calendar",

async(req,res)=>{

const battles =
await db.query(
"SELECT * FROM battles ORDER BY date,time"
);

res.render("calendar",{

battles:battles.rows

});

});

/*
START SERVER
*/
const PORT =
process.env.PORT || 8080;

app.listen(PORT,()=>{

console.log(
"🔥 Ember Empire dashboard running on port "+PORT
);

});