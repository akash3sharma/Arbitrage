const arr = [];

function add(chatid, status) {
const data = {};
  data.chatid = chatid;
  data.status = status;
 const user = arr.find(u => u.chatid === chatid);

if (user) {
  user.status = status;
}else{
  arr.push(data);}
}

module.exports = {
  arr,
  add
};