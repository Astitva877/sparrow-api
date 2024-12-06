import { Module } from "@nestjs/common";
import { HttpController } from "./controllers/http.controller";
import { HttpService } from "./services/http.service";
import { SocketIoService } from "./services/socketio.service";
import { SocketIoGateway } from "./gateway/socketio.gateway";
import { WebSocketGateway } from "./gateway/websocket.gateway";
import { WebSocketService } from "./services/websocket.service";
import { HttpModule } from "@nestjs/axios";

@Module({
  imports: [HttpModule],
  controllers: [HttpController],
  providers: [
    HttpService,
    SocketIoGateway,
    SocketIoService,
    WebSocketGateway,
    WebSocketService,
  ],
  exports: [SocketIoService, WebSocketService],
})
export class ProxyModule {}
