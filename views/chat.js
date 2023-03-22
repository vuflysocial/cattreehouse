const gun = Gun();

function sendMessage(message) {
  gun.get("rooms")
    .get(ROOM_ID)
    .get("messages")
    .set({ text: message, timestamp: Date.now(), sender: window.unique });
}

const messageInput = document.getElementById("message-input");
const sendButton = document.querySelector("button[type='submit']");

sendButton.addEventListener("click", (event) => {
  event.preventDefault(); // Prevent the form from submitting normally

  const message = messageInput.value;
  sendMessage(message);

  messageInput.value = ""; // Clear the input field after sending the message
});


function displayMessage(message) {
  const messageContainer = document.getElementById("message-container");
  const messageElement = document.createElement("div");

  const senderElement = document.createElement("div");
  senderElement.classList.add("sender");
  senderElement.textContent = message.sender;

  const textElement = document.createElement("div");
  textElement.classList.add("text");
  textElement.textContent = message.text;

  const timestampElement = document.createElement("div");
  timestampElement.classList.add("timestamp");
  timestampElement.textContent = new Date(message.timestamp).toLocaleString();

  messageElement.appendChild(senderElement);
  messageElement.appendChild(textElement);
  messageElement.appendChild(timestampElement);

  messageContainer.appendChild(messageElement);
}

function subscribeToMessages() {
  gun.get("rooms")
    .get(ROOM_ID)
    .get("messages")
    .map()
    .once(function(messages) {
      Object.values(messages).forEach(function(message) {
        displayMessage(message);
      });
    });

  gun.get("rooms")
    .get(ROOM_ID)
    .get("messages")
    .map()
    .on(function(message, id) {
      displayMessage(message);
    });
}

// Call subscribeToMessages to start listening for new messages
subscribeToMessages();
