var remotePeers = {};
var remoteUsers = {};
var localStream = null;
var localSharing = false;
var peerServer =  {
      host: 'gundb-multiserver.glitch.me',
      port: 443,
      secure: true,
      path: '/peerjs'
    }
const localPeer = new Peer();
console.log('localPeer',localPeer);

var localId;
var lock = false;

var dam = true;
var safe = true;

const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);
const userId = urlParams.get('userId') || false;

var username = userId;
if (!username){
  username = prompt(
  "Please enter your username name", "Anon" + Math.floor(Math.random() * (99 - 11 + 1)) + 11
);
}

function initFingerprintJS() {
  FingerprintJS.load().then(fp => {
    // The FingerprintJS agent is ready.
    // Get a visitor identifier when you'd like to.
    fp.get().then(result => {
      // This is the visitor identifier:
      window.unique = result.visitorId;
      console.log(window.unique);
    });
  });
}

const peerGrid = document.getElementById("peer-grid");
const muteButton = document.getElementById("mute-button");
const shareButton = document.getElementById("share-button");
const lockButton = document.getElementById("lock-button");
const screenButton = document.getElementById("screen-button");
const killButton = document.getElementById("kill-button");

// Connect to multisocket for ROOMS only! DAM uses different scope
var gun = Gun({
  peers: ["https://gundb-multiserver.glitch.me/openhouse"],
  multicast: false,
  localStorage: false,
  radisk: false,
  file: false
});

// GUN ROOMS List + Peer Counters
var gunRooms = gun.get("rooms");
// GUN ROOM Scope (alternative channel)
var gunRoom = gunRooms.get(ROOM_ID);


countRoom();

// OWNER BLOCK
gunRoom.open(function(room) {
  if (room && room.owner) {
    if (room.owner != window.unique) {
      if (safe) killButton.style.display = "none";
    } else {
      console.log("You own this room!", room.id);
    }
  }
});

// BACKUP CHANNEL. Returns the last value. Needs TS > now()
//gunRoom.on(function(data, key) {
//  console.log("gun update:", data, key);
//});

// Join GUN Room Mesh/DAM using a named scope
loadDam(ROOM_ID);

// Handle LocalPeer Events
localPeer.on("open", localPeerId => {
  // store localPeerId to Gun Room
  localId = localPeerId;
  console.log("pushing self to DAMN", ROOM_ID, localPeerId);
  gunRoom
    .get("peers")
    .get(localPeerId)
    .put(new Date().getTime());
  // notify DAM network, we joined!
  sendLog(username + " joined DAMN! PeerId: " + localPeerId);
  sendSignaling({
    type: "peer-joined-room",
    peerId: localPeerId,
    username: username
  });

  const opt = { video: false, audio: true };
  navigator.mediaDevices.getUserMedia(opt).then(s => {
    localStream = s;
    localStream.getAudioTracks()[0].onmute = evt => {
      localStream.getAudioTracks()[0].enabled = false;
      onToggleMute();
    };
    localStream.getAudioTracks()[0].onunmute = evt => {
      localStream.getAudioTracks()[0].enabled = true;
      onToggleMute();
    };
    // Audiocall Route
    localPeer.on("call", call => {
      if (call.metadata) console.log("call metadata!", call.metadata);
      if (call.metadata.type == "audio") {
        console.log('incoming call',call.metadata);
        if (call.metadata.peerId && call.metadata.from) remoteUsers[call.metadata.peerId] = call.metadata.from;
        call.answer(localStream);
        call.on("stream", remoteStream => addPeerProfile(call, remoteStream));
      } else if (call.metadata.type == "screenshare") {
        console.log("got a screenshare stream!");
        let video = document.getElementById("shareview");
        let peerGrid = document.getElementById("peer-grid");
        localSharing = call;
        call.answer(localStream);
        call.on("stream", function(remoteStream) {
          screenButton.style.display = "none";
          peerGrid.style.visibility = "hidden";
          video.srcObject = remoteStream;
          video.addEventListener("loadedmetadata", () => {
            video.play();
          });
        });
        call.on("close", () => {
          screenButton.style.display = "block";
          peerGrid.style.visibility = "visible";
          video.remove();
        });
        call.on("error", () => {
          screenButton.style.display = "block";
          peerGrid.style.display = "block";
          video.remove();
        });
      }
    });
    // Datachannels Route (unused)
    localPeer.on("connection", function(conn) {
      if (conn.metadata) console.log("connection meta", conn.metadata);
      conn.on("open", function() {
        // Receive Screenshare Frames
        conn.on("data", function(data) {
          console.log("Received", data);
        });
      });
    });

    // JOIN-ROOM Trigger seems no longer needed?
    //sendSignaling({ type: "join-room", peerId: localPeerId, roomId: ROOM_ID, username: username });

    // Display Local Profile & automute (rcvonly here?)
    addLocalProfile();
    toggleMute();
    notifyMe("Room Joined! Unmute to speak");
    //mediaAnalyze();
  });
});

function onPeerJoined(remotePeerId, localStream) {
  if (remotePeerId == localId) return;
  console.log("damn i see remote peer joined " + remotePeerId);
  const call = localPeer.call(remotePeerId, localStream, {
    metadata: { type: "audio", from: username, peerId: localId }
  });
  call.on("stream", remoteStream => addPeerProfile(call, remoteStream));
  notifyMe("joined " + remotePeerId);
}

function onPeerLeft(remotePeerId) {
  if (remotePeerId == localId) return;
  console.log("damn i see remote peer left " + remotePeerId);
  var bye = gunRoom
    .get("peers")
    .get(remotePeerId)
    .put(null);
  if (remotePeers[remotePeerId]) {
    remotePeers[remotePeerId].close();
    remotePeers[remotePeerId] = null;
  }
  notifyMe("left " + remotePeerId);
}

function leaveRoom(e) {
  if (e) e.preventDefault();
  var bye = gunRoom
    .get("peers")
    .get(localId)
    .put(null);
  sendSignaling({ type: "peer-left-room", peerId: localId });
  countRoom();
  window.location.href = "/";
}

function toggleMute(e) {
  if (e) e.preventDefault();
  const track = localStream.getAudioTracks()[0];
  if (!track.muted) track.enabled = !track.enabled;
  // TODO else display warning (cannot record audio in this case)
  onToggleMute();
}

function onToggleMute() {
  const isMuted =
    !localStream.getAudioTracks()[0].enabled ||
    localStream.getAudioTracks()[0].muted;
  muteButton.innerHTML = isMuted ? "Unmute" : "Mute";
  muteButton.classList.toggle("bg-red-300");
  muteButton.classList.toggle("bg-gray-300");
  var muteElem = document.getElementById("local-peer-mute");
  muteElem.style.opacity = isMuted ? 1 : 0;
  sendSignaling({
    type: "peer-toggle-mute",
    peerId: localPeer.id,
    isMuted: isMuted
  });
  //sendLog(localPeer+' mute swap');
}

function onPeerToggleMute(peerId, isMuted) {
  try {
    var muteElem = document.getElementById(peerId + "-peer-mute");
    if (muteElem) muteElem.style.opacity = isMuted ? 1 : 0;
  } catch (e) {
    console.log(e, peerId, muteElem);
  }
}

function addLocalProfile() {
  var peerName = document.createElement("span");
  peerName.className = "peer-name";
  peerName.appendChild(document.createTextNode("You"));

  var peerImg = document.createElement("Img");
  peerImg.className = "peer";
  peerImg.src = "/images/peer.png";

  var peerImg = document.createElement("div");
  peerImg.className = "peer";
  peerImg.id = "peer";
  peerImg.style.opacity = "0";
  peerImg.appendChild(peerImg);

  var muteImg = document.createElement("img");
  muteImg.className = "peer-mute-img";
  muteImg.src = "/images/mute.png";

  var peerMute = document.createElement("div");
  peerMute.className = "peer-mute";
  peerMute.id = "local-peer-mute";
  peerMute.style.opacity = "0";
  peerMute.appendChild(muteImg);

  var peerElem = document.createElement("div");
  peerElem.className = "peer";
  peerElem.appendChild(peerName);

  var container = document.createElement("div");
  container.className = "peer-container";
  container.appendChild(peerElem);
  container.appendChild(peerMute);

  peerGrid.appendChild(container);
}

function addPeerProfile(call, stream) {
  console.log('create remote profile', call.metadata, call.peer, remoteUsers[call.peer]);
  var peerName = document.createElement("span");
  peerName.className = "peer-name";
  peerName.appendChild(
    document.createTextNode( remoteUsers[call.peer] || call.peer.substring(0, 4))
  );

  var audioElem = document.createElement("audio");
  audioElem.srcObject = stream;
  audioElem.addEventListener("loadedmetadata", () => audioElem.play());

  var peerElem = document.createElement("div");
  peerElem.className = "peer";
  peerElem.appendChild(peerName);
  peerElem.appendChild(audioElem);

  var muteImg = document.createElement("img");
  muteImg.className = "peer-mute-img";
  muteImg.src = "/images/mute.png";

  var peerMute = document.createElement("div");
  peerMute.className = "peer-mute";
  peerMute.id = call.peer + "-peer-mute";
  peerMute.style.opacity = "0";
  peerMute.appendChild(muteImg);

  var container = document.createElement("div");
  container.className = "peer-container";
  container.appendChild(peerElem);
  container.appendChild(peerMute);

  remotePeers[call.peer] = call;
  call.on("close", () => container.remove());
  peerGrid.appendChild(container);
}

function shareUrl() {
  if (!window.getSelection) {
    alert("Clipboard not available, sorry!");
    return;
  }
  const dummy = document.createElement("p");
  dummy.textContent = window.location.href;
  document.body.appendChild(dummy);

  const range = document.createRange();
  range.setStartBefore(dummy);
  range.setEndAfter(dummy);

  const selection = window.getSelection();
  // First clear, in case the user already selected some other text
  selection.removeAllRanges();
  selection.addRange(range);

  document.execCommand("copy");
  document.body.removeChild(dummy);

  notifyMe("link shared to clipboard");
  shareButton.innerHTML = "Ctrl-v";
  setTimeout(function() {
    shareButton.innerHTML = "Link";
  }, 1000);
}

function notifyMe(msg) {
  // Let's check if the browser supports notifications
  if (!("Notification" in window)) {
    alert(msg);
  }

  // Let's check whether notification permissions have already been granted
  else if (Notification.permission === "granted") {
    // If it's okay let's create a notification
    var notification = new Notification(msg);
  }

  // Otherwise, we need to ask the user for permission
  else if (Notification.permission !== "denied") {
    Notification.requestPermission().then(function(permission) {
      // If the user accepts, let's create a notification
      if (permission === "granted") {
        var notification = new Notification(msg);
      }
    });
  }

  // At last, if the user has denied notifications, and you
  // want to be respectful there is no need to bother them any more.
}

/* Screen Sharing Code */

var sharingScreen = false;

async function shareScreen(ev) {
  // Flip the switch
  screenButton.innerHTML = sharingScreen ? "Share Screen" : "Stop Sharing";
  // Get reference to video element
  let videoElement = document.getElementById("shareview");
  // if we are already sharing, stop the sharing.
  if (sharingScreen) {
    sendSignaling({
      type: "stop-screen-share",
      peerId: localId,
      roomId: ROOM_ID,
      username: username
    });
    let tracks = videoElement.srcObject.getTracks();
    tracks.forEach(track => track.stop());
    videoElement.srcObject = null;
    sharingScreen = false;
    return;
  }
  // user asked to share their screen
  let sharedScreenStream = null;
  // create config object
  let config = { video: { cursor: "always" }, audio: false };
  try {
    sharedScreenStream = await navigator.mediaDevices.getDisplayMedia(config);
    sharingScreen = true;
    // pass shared screen to function to add track to sending
    sendScreenToAll(sharedScreenStream);
  } catch (e) {
    console.log("screencapture issue: ", e);
  }
  // set shared screen so we can see we are sharing something
  videoElement.srcObject = sharedScreenStream;

  return;
}

async function stopScreenShare(id) {
  let video = document.getElementById("shareview");
  let peerGrid = document.getElementById("peer-grid");
  localSharing.close();
  screenButton.style.display = "block";
  peerGrid.style.visibility = "visible";
  video.remove();
}

async function sendScreenToAll(mediaStream) {
  localPeer._connections.forEach((peer, i) => {
    if (peer == localId) return;
    console.log("sharing to", peer, mediaStream);
    try {
      localPeer.call(i, mediaStream, { metadata: { type: "screenshare", from: username, peerId: localId } });
    } catch (e) {
      console.log(e);
    }
  });
}

/* End Screen Sharing Code */

function mediaAnalyze() {
  try {
    if (!localStream) return;
    var audio = localStream;
    var audioCtx = new AudioContext();
    var analyzer = audioCtx.createAnalyser();
    var source = audioCtx.createMediaStreamSource(audio);
    source.connect(analyzer);
    // analyzer.connect(audioCtx.destination);
    analyzer.fftSize = 64;

    var frequencyData = new Uint8Array(analyzer.frequencyBinCount);

    var bins = [];
    frequencyData.forEach(function(e) {
      var e = document.createElement("div");
      e.classList.add("bin");
      document.getElementById("bins").appendChild(e);
      bins.push(e);
    });
    var half = false;
    function renderFrame() {
      half = !half;
      if (half) {
        requestAnimationFrame(renderFrame);
        return;
      }
      analyzer.getByteFrequencyData(frequencyData);
      frequencyData.forEach(function(data, index) {
        bins[index].style.height = (data * 50) / 256 + "%";
      });
      requestAnimationFrame(renderFrame);
    }
    renderFrame();
  } catch (e) {
    console.log(e);
  }
}

function lockRoom(e, roomname, unique) {
  e.preventDefault();
  // TODO Block New Participants
  // TODO Update Room object for hiding
  if (roomname == "Lobby") return;
  console.log("lock room", roomname, unique);
  window.gunRooms.get(roomname).open(function(data) {
    console.log("room lookup", roomname);
    if (
      (data.id == roomname || data.title == roomname) &&
      (data.owner == unique || !data.owner)
    ) {
      console.log("room owner match!", data.id, unique);
      lock = lock ? false : true;
      lockButton.innerHTML = lock ? "&#128274;" : "&#128275;";
      console.log("switch lock!", lock, roomname);
      window.gunRooms
        .get(roomname)
        .get("lock")
        .put(lock);
      return false;
    } else {
      console.log("locking blocked!");
      return false;
    }
  });
  return false;
}

function killRoom(roomname, unique) {
  console.log("kill room", roomname, unique);
  window.gunRooms.get(roomname).open(function(data) {
    console.log("room lookup", roomname);
    if (data.id == "Lobby") return;
    if (
      ((data.id == roomname || data.title == roomname) &&
        (data.owner == unique || !data.owner)) ||
      !safe
    ) {
      console.log("room owner match!", data.id, unique);
      sendSignaling({ type: "peer-kill-room", peerId: localId });
      var remove = window.gunRooms.get(data.id).put(null);
      window.location.href = "/rooms";
    } else {
      console.log("delete blocked!");
    }
  });
  return false;
}

// Helpers
function clean(obj) {
  for (var propName in obj) {
    if (
      obj[propName] === null ||
      obj[propName] === undefined ||
      propName == "_"
    ) {
      delete obj[propName];
    }
  }
  return obj;
}

function countRoom(roomname) {
  if (!roomname) roomname = ROOM_ID;
  var count = gunRoom.get("peers").once(function(data) {
    var counter = Object.keys(clean(data));
    gunRoom.get("count").put(Object.keys(counter).length);
    if (counter <= 0) {
      // destroy empty room
      console.log("destroying room", roomname);
      gunRoom.get("owner").once(function(owner) {
        killRoom(roomname, owner);
      });
    } else {
      // delete peers older than 1h
      var now = new Date().getTime() - 3600;
      for (const peer in clean(data)) {
        try{
          if (typeof data[peer] ==='number' && data[peer] < now ){
            // killing old peer
            gunRoom.get("peers").get(peer).put(null);
          }  
        } catch(e){
          // not a date, kill it
          gunRoom.get("peers").get(peer).put(null);
        } 
      }    
    }
  });
}

async function getICEServers() {
  var servers = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun.sipgate.net:3478" }
    // { urls:  `stun:${location.hostname}:80`}
  ];
  console.log("self stun", servers);
  return servers;
}

/* DAMNROOM! EXPERIMENTAL PART BELOW */

// Exported Functions for MESHing
let sendLog = () => {};
let sendFrame = () => {};
let sendSignaling = () => {};

async function loadDam(id) {
  console.log("bootstrapping dam with id", id);
  const user = id || ROOM_ID;
  const data = {
    [user]: { x: 0, y: 0, user: user }
  };

  try {
    var streaming = false;
    var canvas = document.getElementById("canvas");
  } catch (e) {
    console.log(e);
  }
  // GUN DAM - do not remove any options! signaling only channel
  var root = Gun({
    peers: ["http:localhost:3000/gun_" + ROOM_ID],
    rtc: { iceServers: await getICEServers() },
    multicast: false,
    localStorage: false,
    radisk: false,
    file: false
  });

  console.log("Root DAM");
  root.on("in", function(msg) {
    if (msg.log) {
      const { log } = msg.log;
      console.log("got x-log!");
      console.log(log);
    }
    if (msg.signaling) {
      // Switch Call States
      const { data } = msg.signaling;
      if (data.peerId && data.peerId == localId) return;
      console.log("got x-signaling!", data.type);
      switch (data.type) {
        case "join-room":
          console.log(data.type, data);
          countRoom();
          // TRIGGER FOR peer-joined-room! do nothing or use for username pairing only
          //onPeerJoined(data.peerId, localStream);
          //gunRoom.get('peers').get(data.peerId).put(new Date().getTime());
          break;
        case "peer-joined-room":
          console.log(data.type, data);
          remoteUsers[data.peerId] = data.username;
          onPeerJoined(data.peerId, localStream);
          countRoom();
          break;
        case "peer-kill-room":
          console.log(data.type, data);
          leaveRoom();
          break;
        case "peer-left-room":
          console.log(data.type, data);
          delete remoteUsers[data.peerId];
          onPeerLeft(data.peerId);
          // cleanup
          gunRoom
            .get("peers")
            .get(data.peerId)
            .put(null);
          //var count = gunRoom.get('peers').length;
          countRoom();
          break;
        case "peer-toggle-mute":
          console.log(data.type, data);
          onPeerToggleMute(data.peerId, data.isMuted);
          break;
        case "stop-screen-share":
          console.log(data.type, data);
          stopScreenShare();
          break;
      }
    }
    if (msg.image) {
      const { image } = msg.image;
      console.log("got x-image!");
      var canvas = document.getElementById("canvas");
      var img = new Image();
      img.src = image;
      img.onload = function() {
        var ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
      };
    }
    this.to.next(msg);
  });
  sendLog = log => {
    //console.log("trying to send log", log);
    const id = randId();
    root.on("out", { "#": id, log: { name: user, log } });
  };
  sendSignaling = data => {
    //console.log("trying to send signaling", data);
    const id = randId();
    root.on("out", { "#": id, signaling: { name: user, data } });
  };
  sendFrame = image => {
    console.log("sending frame!");
    const id = randId();
    root.on("out", { "#": id, image: { image } });
  };

  function randId() {
    return Math.random()
      .toString()
      .slice(2);
  }
  function updateData(name, x, y) {
    if (!data[name]) {
      console.log("unknown party!", name);
    } else {
      data[name].x = x;
      data[name].y = y;
    }
  }
}