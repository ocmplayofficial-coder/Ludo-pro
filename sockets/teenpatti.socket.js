export function handleTeenPattiMessage(socket, message, gameConnections, broadcastGameUpdate) {
  // Currently, Teen Patti works directly via HTTP API. WebSockets are reserved for multiplayer sync extensions.
  console.log("Teen Patti WebSocket message received:", message);
}
