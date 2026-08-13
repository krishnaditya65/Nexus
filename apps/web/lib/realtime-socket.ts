// Thin singleton around socket.io-client for services/comms' chat
// gateway. One connection per signed-in session (not per open channel —
// the gateway multiplexes rooms over a single socket via join/leave), so
// this lives outside React's render cycle and components subscribe to it
// rather than each owning their own connection.
import { io, Socket } from 'socket.io-client';
import { SERVICE_URLS } from './service-urls';

let socket: Socket | null = null;
let socketToken: string | null = null;

/** Returns the shared socket, (re)connecting if the access token changed
 *  (e.g. after sign-in) or no connection exists yet. */
export function getChatSocket(accessToken: string): Socket {
  if (socket && socketToken === accessToken) return socket;
  if (socket) socket.disconnect();
  socketToken = accessToken;
  socket = io(SERVICE_URLS.comms, {
    auth: { token: accessToken },
    transports: ['websocket'],
  });
  return socket;
}

export function disconnectChatSocket() {
  socket?.disconnect();
  socket = null;
  socketToken = null;
}
