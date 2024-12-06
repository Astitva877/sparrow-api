import {
  Controller,
  Post,
  Body,
  Req,
  Res,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { FastifyRequest, FastifyReply } from "fastify";
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from "@nestjs/swagger";
import { HttpService } from "../services/http.service";

@ApiBearerAuth()
@ApiTags("proxy")
@Controller("api/proxy")
export class HttpController {
  constructor(private readonly httpService: HttpService) {}

  @Post("http-request")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL to which the request will be sent",
          example: "https://api.example.com/resource",
        },
        method: {
          type: "string",
          description: "HTTP method to be used (GET, POST, etc.)",
          example: "POST",
        },
        headers: {
          type: "string",
          description: "JSON string representing an array of header objects",
          example: `[ 
            { "key": "Authorization", "value": "Bearer your-token-here", "checked": true }, 
            { "key": "Content-Type", "value": "application/json", "checked": true }
          ]`,
        },
        body: {
          type: "string",
          description: "Request payload, format varies by contentType",
          example: `"{ \"key1\": \"value1\", \"key2\": \"value2\" }"`,
        },
        contentType: {
          type: "string",
          description: "The content type of the request body",
          example: "application/json",
        },
      },
    },
  })
  @ApiOperation({
    summary: "Proxy to route HTTP requests",
    description: `This will help address CORS error encountered when requests are made directly from a browser agent.
       Instead of browser agent, request will be routed through this proxy.`,
  })
  async handleHttpRequest(
    @Body("url") url: string,
    @Body("method") method: string,
    @Body("headers") headers: string,
    @Body("body") body: any,
    @Body("contentType") contentType: string,
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
  ) {
    try {
      const response = await this.httpService.makeHttpRequest({
        url,
        method,
        headers,
        body,
        contentType,
      });

      return res.status(HttpStatus.OK).send(response);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_GATEWAY);
    }
  }
}
