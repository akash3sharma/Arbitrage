const express = require("express");
const app = express();
require("dotenv").config();
const token = process.env.TELEGRAM_BOT_TOKEN;
const port = Number(process.env.PORT||3000);
const {add} = require("./adding")


if(!token) throw new Error("Missing Telegram token");
app.use(express.json());
app.get("/",(req,res)=>{
    res.send("");
});

app.post("/telegram/webhook",(req,res)=>{
      if(!req.body){
        return res.sendStatus(200);
      }
const msg = req.body.message;
const chatid = msg.chat.id;
const status = msg.text;
    add(chatid,status);
   return res.sendStatus(200);

});
app.listen(port,()=>{
    console.log("started");
})
