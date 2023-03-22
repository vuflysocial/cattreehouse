const express = require("express");
const app = express();
const server = require("http").Server(app);
app.use("/logo.png", express.static(__dirname + "/public/logo.png"));



// Shared GUN scope for ROOM management only (no signaling here)
var Gun = require("gun");
require("gun/lib/open.js");
require("gun/lib/not.js");
require("gun/lib/promise.js");

var gun = Gun({ peers: ["http:localhost:3000/gun"],
    multicast: false,
    localStorage: false,
    radisk: false,
    file: false
    });
// GUN Rooms object - this is not persisting.....
var gunRooms = gun.get("rooms");
//gunRooms.get('lobby').put({ title: 'Lobby', id: 'Lobby', locked: false, owner: 'openhouse-admin', count: 99 }); 

function resyncRooms(){
  gunRooms.open(function(data){
    rooms = clean(data);
    console.log('room data resync', rooms);
  })
}
// Force Provision the lobby?

//resyncRooms();

const bodyParser = require("body-parser");
const { v4: uuidv4 } = require("uuid");

// Helper
function clean(obj) {
  for (var propName in obj) {
    console.log(propName)
    if (obj[propName] === null || obj[propName] === undefined || propName == "_" ) {
      delete obj[propName];
    }
  }
  return obj;
}

var env = {};
var rooms = {};

app.set("view engine", "ejs");
app.use(express.static(__dirname + "/public"));
app.use(bodyParser.json({ type: "application/json" }));
app.use("/favicon.ico", express.static("favicon.ico"));

app.get("/", async (req, res) => {
  resyncRooms();
  res.redirect('/rooms')
});

app.get("/r/:id", (req, res) => {
    // replace with gun check - currently ignore and let people in
    if (!rooms[req.params.id]) {
      console.log('missing room',req.params.id);
      //res.redirect('/rooms');
      var room = { title: req.params.id, id: req.params.id, locked: false, owner: 'openhouse-admin', peers: {}, count: 0 };
      gunRooms.get(req.params.id).put(room);
      resyncRooms();
      res.render("room", {
        room: room, 
        peerjs: {}
      });
      return;
    }
    console.log('rendering room',req.params.id,rooms[req.params.id])
    res.render("room", {
      room: rooms[req.params.id], 
      peerjs: {}
    });
});

app.post("/rooms", (req, res) => {
  var room = {
    id: uuidv4(),
    title: req.body.title,
    peers: {},
    locked: req.body.locked
  };
  rooms[room.id] = room;
  res.json(room);
});

// GUN Rooms

app.use("/rooms", express.static(__dirname + "/views/rooms.html"));

// NOT FOUND

app.get("*", function(req, res) {
  res.redirect('/rooms')
  //res.render("404");
});

server.listen(process.env.PORT || 3000);