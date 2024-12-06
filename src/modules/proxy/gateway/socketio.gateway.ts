import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { SocketIoService } from "../services/socketio.service";

export const SOCKET_IO_PORT = 9001;

@WebSocketGateway(SOCKET_IO_PORT, {
  cors: true,
  path: "/socket.io",
  transports: ["websocket"],
})
export class SocketIoGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  constructor(private readonly socketIoService: SocketIoService) {}

  /**
   * Lifecycle hook that runs when the WebSocket gateway is initialized.
   */
  async afterInit() {
    console.log("Socket.io Handler Gateway initialized!");
  }

  /**
   * Handle WebSocket connection from the frontend with `tabid`.
   */
  async handleConnection(client: Socket) {
    const { targetUrl, namespace, tabid, headers } = client.handshake.query;

    if (!targetUrl || !namespace || !tabid) {
      client.disconnect();
      console.error(
        "Missing required query parameters: url, namespace, or tabid",
      );
      return;
    }

    try {
      const parsedHeaders = headers ? JSON.parse(headers as string) : {};

      // Register frontend client
      this.socketIoService.registerFrontendClient(tabid as string, client);

      // Connect to the real Socket.IO server
      await this.socketIoService.connectToRealSocket(
        tabid as string,
        targetUrl as string,
        namespace as string,
        parsedHeaders,
      );

      console.log(`Proxy connection established for TabID=${tabid}`);

      // Listen for all dynamic events from the frontend and forward them
      client.onAny(async (event: string, ...args: any[]) => {
        console.log(
          `Received event from frontend for TabID=${tabid}: ${event}`,
          args,
        );

        try {
          // Forward the dynamic event and its arguments to the real server
          await this.socketIoService.emitToRealSocket(
            tabid as string,
            event,
            args,
          );
        } catch (err) {
          console.error(
            `Failed to forward event ${event} for TabID=${tabid}: ${err.message}`,
          );
        }
      });
    } catch (err) {
      console.error(
        `Failed to connect to real Socket.IO server for TabID=${tabid}: ${err.message}`,
      );
      client.disconnect();
    }
  }

  /**
   * Handle WebSocket disconnection for a specific `tabid`.
   */
  async handleDisconnect(client: Socket) {
    const { tabid } = client.handshake.query;

    if (!tabid) {
      console.error("TabID missing on disconnection");
      return;
    }

    console.log(`Proxy connection closed for TabID=${tabid}`);
    await this.socketIoService.disconnectFromRealSocket(tabid as string);
    this.socketIoService.unregisterFrontendClient(tabid as string);
  }
}
