import { Injectable } from "@nestjs/common";
import { WebSocket } from "ws";

export enum WebsocketEvent {
  disconnect = "disconnect",
  connect = "connect",
  message = "message",
}

@Injectable()
export class WebSocketService {
  private frontendClients: Map<string, WebSocket> = new Map();
  private realWebSocketClients: Map<string, WebSocket> = new Map();

  /**
   * Establish connection between frontend client and real WebSocket server.
   */
  async establishConnection(
    frontendClient: WebSocket,
    tabid: string,
    targetUrl: string,
    headers: any,
  ): Promise<boolean> {
    try {
      // Check if the tabid is already connected
      if (this.frontendClients.has(tabid)) {
        console.log(`TabID=${tabid} is already connected. Reconnecting...`);
        this.cleanupConnectionsByTabId(tabid);
      }

      // Store the frontend client
      this.frontendClients.set(tabid, frontendClient);

      // Connect to the real WebSocket server
      const realWebSocket = new WebSocket(targetUrl, { headers });

      return new Promise((resolve) => {
        realWebSocket.on("open", () => {
          console.log(`Connected to real WebSocket server for TabID=${tabid}`);
          this.realWebSocketClients.set(tabid, realWebSocket);

          // Forward messages from the frontend client to the real WebSocket server
          frontendClient.on("message", (message) => {
            if (realWebSocket.readyState === WebSocket.OPEN) {
              realWebSocket.send(message); // Forward the message
            }
          });

          // Recieve messages from the real server and forward them to the frontend client
          realWebSocket.on("message", (data) => {
            const frontendSocket = this.frontendClients.get(tabid);
            if (frontendSocket) {
              // Convert raw buffer data to real data
              const parsedData = this.parseWebSocketData(data);

              this.sendEventToFrontendClient(
                tabid,
                WebsocketEvent.message,
                parsedData,
              );
            }
          });

          // Handle real websocket server disconnection
          realWebSocket.on("close", (reasonCode) => {
            console.log(
              `Real WebSocket server disconnected for TabID=${tabid}`,
            );
            // Cleanup connection in case of abnormal closure(not a manual disconnection)
            if (reasonCode === 1006) {
              this.cleanupConnectionsByTabId(tabid);
            }
          });

          // Handle real websocket server error
          realWebSocket.on("error", (error) => {
            console.error(
              `Error with Real WebSocket connection for TabID=${tabid}: ${error.message}`,
            );
            this.cleanupConnectionsByTabId(tabid);
          });

          return resolve(true);
        });
      });
    } catch (error) {
      console.error(
        `Error establishing connection for TabID=${tabid}: ${error.message}`,
      );
      return false;
    }
  }

  /**
   * Parse raw WebSocket data (Buffer or Text).
   */
  private parseWebSocketData(data: any): any {
    if (Buffer.isBuffer(data)) {
      // Attempt to decode as JSON
      try {
        return JSON.parse(data.toString("utf-8"));
      } catch {
        // Fallback to returning as plain text if not JSON
        return data.toString("utf-8");
      }
    } else if (typeof data === "string") {
      // Text data
      try {
        return JSON.parse(data);
      } catch {
        return data; // If not JSON, return as plain string
      }
    } else {
      return data; // If unknown, return as-is
    }
  }

  /**
   * Clean up connections by TabID.
   */
  cleanupConnectionsByTabId(tabid: string) {
    const frontendSocket = this.frontendClients.get(tabid);
    const realSocket = this.realWebSocketClients.get(tabid);

    if (frontendSocket) {
      this.sendEventToFrontendClient(tabid, WebsocketEvent.disconnect);
      frontendSocket.close();
      this.frontendClients.delete(tabid);
    }

    if (realSocket) {
      realSocket.close();
      this.realWebSocketClients.delete(tabid);
    }

    console.log(`Connections cleaned up for TabID=${tabid}`);
  }

  /**
   * Clean up connections by frontend WebSocket client.
   */
  cleanupConnectionsByClient(client: WebSocket) {
    for (const [tabid, frontendSocket] of this.frontendClients.entries()) {
      if (frontendSocket === client) {
        console.log(`Cleaning up connections for TabID=${tabid}`);
        this.cleanupConnectionsByTabId(tabid);
        break;
      }
    }
  }

  sendEventToFrontendClient(
    tabId: string,
    event: WebsocketEvent,
    data: any = null,
  ) {
    const frontendSocket = this.frontendClients.get(tabId);
    if (frontendSocket) {
      const payload = {
        event,
        tabId,
        data,
      };
      if (data) {
        payload["data"] = data;
      }
      frontendSocket.send(JSON.stringify(payload));
    }
  }
}
