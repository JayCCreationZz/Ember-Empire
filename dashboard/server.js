require("dotenv").config();

const express = require("express");
const session = require("express-session");
const passport = require("passport");
const DiscordStrategy = require("passport-discord").Strategy;
const multer = require("multer");
const sharp = require("sharp");
const fs = require("fs");
const axios = require("axios");

const db = require("../database");
const { postBattleNow } = require("../index");

const app = express();

/*
ROLE IDS
*/

const OWNER_ROLE = "1439255505053683804";
const ADMIN_ROLE = "1439256200658157588";

/*
UPLOAD CONFIG
*/

const upload = multer({ dest: "tmp/" });

async function processPoster(file) {

if (!file) return null;

const buffer = await sharp(file.path)
.resize(1080,1080,{ fit:"cover" })
.jpeg({ quality:92 })
.toBuffer();

fs.unlinkSync(file.path);

return buffer;

}

/*
APP CONFIG
*/

app.set("view engine","ejs");
app.set("views",process.cwd()+"/dashboard/views");

app.use(express.static(process.cwd()+"/dashboard/public"));
app.use(express.urlencoded({ extended:true }));

app.set("trust proxy",1);

/*
SESSION CONFIG
*/

app.use(session({
secret:process.env.SESSION_SECRET || "ember-secret",
resave:false,
saveUninitialized:false,
cookie:{
secure:process.env.NODE_ENV==="production",
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
scope:["identify","guilds"]

},(a,b,profile,done)=>done(null,profile)));

passport.serializeUser((u,d)=>d(null,u));
passport.deserializeUser((o,d)=>d(null,o));

/*
ROLE LOOKUP
*/

async function getUserRoleLevel(req){

try{

const response=await axios.get(
`https://discord.com/api/v10/guilds/${process.env.GUILD_ID}/members/${req.user.id}`,
{
headers:{ Authorization:`Bot ${process.env.TOKEN}` }
}
);

const roles=response.data.roles || [];

if(roles.includes(OWNER_ROLE)) return "owner";
if(roles.includes(ADMIN_ROLE)) return "admin";

return "member";

}catch(err){

console.log("Role lookup error:",err.message);
return "member";

}

}

/*
AUTH CHECK
*/

async function checkAuth(req,res,next){

if(!req.isAuthenticated())
return res.redirect("/");

req.roleLevel=await getUserRoleLevel(req);

next();

}

/*
FETCH DISCORD MEMBERS
*/

async function getAgencyMembers(){

const response=await axios.get(
`https://discord.com/api/v10/guilds/${process.env.GUILD_ID}/members?limit=1000`,
{
headers:{ Authorization:`Bot ${process.env.TOKEN}` }
}
);

return response.data.map(m=>({

id:m.user.id,
name:m.nick || m.user.global_name || m.user.username

}));

}

/*
POSTER ROUTE
*/

app.get("/poster/:id",async(req,res)=>{

const result=await db.query(
"SELECT posterdata FROM battles WHERE id=$1",
[req.params.id]
);

if(!result.rows.length) return res.sendStatus(404);

res.set("Content-Type","image/jpeg");
res.send(result.rows[0].posterdata);

});

/*
LOGIN ROUTES
*/

app.get("/",(req,res)=>res.render("login"));
app.get("/login",passport.authenticate("discord"));

app.get("/auth/callback",
passport.authenticate("discord",{ failureRedirect:"/" }),
(req,res)=>res.redirect("/dashboard")
);

app.get("/logout",(req,res)=>req.logout(()=>res.redirect("/")));

/*
DASHBOARD
*/

app.get("/dashboard",checkAuth,async(req,res)=>{

const battlesRaw=await db.query(
"SELECT * FROM battles ORDER BY date,time"
);

const members=await getAgencyMembers();

const map={};
members.forEach(m=>map[m.id]=m.name);

const battles=battlesRaw.rows.map(b=>{
b.hostName=map[b.host] || b.hostname || b.host;
return b;
});

res.render("dashboard",{
battles,
agencyMembers:members,
roleLevel:req.roleLevel
});

});

/*
CREATE BATTLE
*/

app.post("/create",
checkAuth,
upload.single("poster"),
async(req,res)=>{

if(!["owner","admin"].includes(req.roleLevel))
return res.send("Permission denied");

const posterBuffer=await processPoster(req.file);

const inserted=await db.query(
`INSERT INTO battles
(host,hostname,opponent,date,time,
posterdata,livelink,
managergifting,adultonly,
powerups,nohammers)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
RETURNING *`,
[
req.body.host,
req.body.hostName || null,
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

await postBattleNow(inserted.rows[0]);

res.redirect("/dashboard");

});

/*
REPLACE POSTER
*/

app.post("/replace-poster/:id",
checkAuth,
upload.single("poster"),
async(req,res)=>{

if(!["owner","admin"].includes(req.roleLevel))
return res.redirect("/dashboard");

const buffer=await processPoster(req.file);

await db.query(
"UPDATE battles SET posterdata=$1 WHERE id=$2",
[buffer,req.params.id]
);

res.redirect("/dashboard");

});

/*
DELETE BATTLE
*/

app.post("/delete/:id",
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
CALENDAR (GROUPED + LIVE DETECTION)
*/

app.get("/calendar",checkAuth,async(req,res)=>{

const battlesRaw=await db.query(
"SELECT * FROM battles ORDER BY date,time"
);

const members=await getAgencyMembers();

const map={};
members.forEach(m=>map[m.id]=m.name);

function parseDate(str){
const[d,m,y]=str.split("/");
return new Date(`${y}-${m}-${d}`);
}

function minutes(str){
const[h,m]=str.split(":");
return h*60+Number(m);
}

const now=new Date();

const todayStart=new Date(now.getFullYear(),now.getMonth(),now.getDate());
const tomorrowStart=new Date(todayStart);
tomorrowStart.setDate(todayStart.getDate()+1);

const weekEnd=new Date(todayStart);
weekEnd.setDate(todayStart.getDate()+7);

const grouped={ today:[], tomorrow:[], week:[], later:[] };

battlesRaw.rows.forEach(b=>{

b.hostName=map[b.host] || b.hostname || b.host;

const battleDate=parseDate(b.date);

const diffMinutes=
minutes(b.time)-(now.getHours()*60+now.getMinutes());

if(battleDate.toDateString()===now.toDateString()){

if(diffMinutes<=0 && diffMinutes>=-120) b.status="live";
else if(diffMinutes>0 && diffMinutes<=30) b.status="soon";

}

if(battleDate.toDateString()===todayStart.toDateString())
grouped.today.push(b);

else if(battleDate.toDateString()===tomorrowStart.toDateString())
grouped.tomorrow.push(b);

else if(battleDate>todayStart && battleDate<=weekEnd)
grouped.week.push(b);

else
grouped.later.push(b);

});

res.render("calendar",{
grouped,
roleLevel:req.roleLevel,
userId:req.user.id
});

});

/*
PUBLIC BATTLE REQUEST FORM
*/

app.get("/request",(req,res)=>res.render("request"));

app.post("/request",async(req,res)=>{

await db.query(
`INSERT INTO battle_requests
(requester,agency,opponent,
preferred_date,preferred_time,notes)
VALUES ($1,$2,$3,$4,$5,$6)`,
[
req.body.requester,
req.body.agency,
req.body.opponent,
req.body.date,
req.body.time,
req.body.notes
]
);

res.send("Battle request submitted ✅");

});

/*
VIEW REQUESTS
*/

app.get("/requests",checkAuth,async(req,res)=>{

if(!["owner","admin"].includes(req.roleLevel))
return res.redirect("/dashboard");

const requests=await db.query(
"SELECT * FROM battle_requests WHERE status='pending'"
);

res.render("requests",{ requests:requests.rows });

});

/*
APPROVE REQUEST
*/

app.post("/requests/approve/:id",
checkAuth,
async(req,res)=>{

if(!["owner","admin"].includes(req.roleLevel))
return res.redirect("/dashboard");

const request=await db.query(
"SELECT * FROM battle_requests WHERE id=$1",
[req.params.id]
);

const r=request.rows[0];

await db.query(
`INSERT INTO battles
(host,opponent,date,time)
VALUES ($1,$2,$3,$4)`,
[
req.body.host,
r.opponent,
r.preferred_date,
r.preferred_time
]
);

await db.query(
"UPDATE battle_requests SET status='approved' WHERE id=$1",
[req.params.id]
);

res.redirect("/requests");

});

/*
REJECT REQUEST
*/

app.post("/requests/reject/:id",
checkAuth,
async(req,res)=>{

await db.query(
"UPDATE battle_requests SET status='rejected' WHERE id=$1",
[req.params.id]
);

res.redirect("/requests");

});

/*
START SERVER
*/

app.listen(process.env.PORT||8080,
()=>console.log("🔥 Ember Empire Dashboard running"));