import { Injectable } from "@nestjs/common";
import { io, Socket } from "socket.io-client";

@Injectable()
export class SocketIoService {
  private realSocketClients: Map<string, Socket> = new Map(); // tabid-specific connections
  private frontendClients: Map<string, Socket> = new Map(); // tabid-specific frontend connections

  /**
   * Connect to the real Socket.IO server with a specific `tabid`.
   */
  async connectToRealSocket(
    tabid: string,
    targetUrl: string,
    namespace: string,
    headers: Record<string, string> = {},
  ): Promise<void> {
    if (this.realSocketClients.has(tabid)) {
      throw new Error(`TabID=${tabid} is already connected`);
      // this.disconnectFromRealSocket(tabid);
    }

    const realSocket = io(`${targetUrl}${namespace}`, {
      transports: ["websocket"],
      extraHeaders: headers,
    });

    await new Promise<void>((resolve, reject) => {
      realSocket.on("connect", () => {
        console.log(`Connected to real Socket.IO server for TabID=${tabid}`);
        this.realSocketClients.set(tabid, realSocket);
        this.emitToFrontendClient(
          tabid,
          `socket-connect-${tabid}`,
          "Connected to real Socket.IO server",
        );
        resolve();
      });

      realSocket.on("connect_error", (err) => {
        reject(
          new Error(
            `Failed to connect to real Socket.IO server for TabID=${tabid}: ${err.message}`,
          ),
        );
      });
    });

    // Listen for all dynamic events from the real server and forward to the frontend
    realSocket.onAny((event: string, ...args: any[]) => {
      console.log(
        `Received event from real server for TabID=${tabid}: ${event}`,
        args,
      );

      this.emitToFrontendClient(tabid, `socket-message-${tabid}`, {
        event,
        message: args,
      });
    });

    // Handle disconnection of the real server
    realSocket.on("disconnect", (reason) => {
      console.warn(
        `Real Socket.IO server disconnected for TabID=${tabid}: ${reason}`,
      );
      this.disconnectFromRealSocket(tabid);
    });
  }

  /**
   * Register frontend client for a specific `tabid`.
   */
  registerFrontendClient(tabid: string, clientSocket: any): void {
    // Register Disconnect to facilitate manual disconnection from sparrow
    clientSocket.on(`disconnect-socket-${tabid}`, async () => {
      const client = this.frontendClients.get(tabid);
      if (client) {
        await this.disconnectFromRealSocket(tabid, true);
      }
    });
    this.frontendClients.set(tabid, clientSocket);
  }

  /**
   * Unregister frontend client for a specific `tabid`.
   */
  unregisterFrontendClient(tabid: string): void {
    this.frontendClients.delete(tabid);
  }

  /**
   * Disconnect from the real Socket.IO server for a specific `tabid`.
   */
  async disconnectFromRealSocket(
    tabid: string,
    manualDisconnection: boolean = false,
  ): Promise<void> {
    const realSocket = this.realSocketClients.get(tabid);

    if (realSocket) {
      realSocket.disconnect();
      this.realSocketClients.delete(tabid);
      if (!manualDisconnection) {
        // Emit event in case of abrupt disconnection like real socket server going down
        this.emitToFrontendClient(
          tabid,
          `socket-disconnect-${tabid}`,
          "Disconnected from Socket.io",
        );
      }
      console.log(`Disconnected Socket.IO connection for TabID=${tabid}`);
    }
  }

  /**
   * Emit a dynamic event to the real Socket.IO server for a specific `tabid`.
   */
  async emitToRealSocket(
    tabid: string,
    event: string,
    args: any[],
  ): Promise<void> {
    const realSocket = this.realSocketClients.get(tabid);

    if (!realSocket) {
      throw new Error(`No connection found for TabID=${tabid}`);
    }

    realSocket.emit(event, ...args);
  }

  /**
   * Emit a dynamic event to the frontend Socket.IO client for a specific `tabid`.
   */
  async emitToFrontendClient(
    tabid: string,
    event: string,
    data: any,
  ): Promise<void> {
    const frontendSocket = this.frontendClients.get(tabid);

    if (!frontendSocket) {
      throw new Error(`No connection found for TabID=${tabid}`);
    }
    frontendSocket.emit(event, data);
  }
}
