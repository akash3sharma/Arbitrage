const {arr , add} = require("./adding.js");
const axios = require("axios");
require("dotenv").config();
const token = process.env.TELEGRAM_BOT_TOKEN;
 
async function sending (data){
    for( const id of arr){
        if(id.status == "start"){
           try{ await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
              chat_id: id.chatid,
               text: data
            });}
            catch(err){
                console.log(err.message);
            }
        }
    }
}

module.exports = sending;