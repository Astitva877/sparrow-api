import { Injectable } from "@nestjs/common";
import postmanToOpenApi from "postman-to-openapi";
export class PostmanCollection {
  info: {
    name: string;
    description?: string;
    version?: string;
  };
  item: PostmanItem[];
}

interface PostmanItem {
  name: string;
  request: PostmanRequest;
  item?: PostmanItem[];
}

interface PostmanRequest {
  method: string;
  url: {
    path: string[];
    query?: PostmanQueryParam[];
  };
  header?: PostmanHeader[];
  body?: PostmanRequestBody;
  description?: string;
}

interface PostmanQueryParam {
  key: string;
  value: string;
}

interface PostmanHeader {
  key: string;
  value: string;
}

interface PostmanRequestBody {
  mode: "raw" | "formdata" | "urlencoded";
  raw?: string;
  formdata?: PostmanFormData[];
  urlencoded?: PostmanUrlEncodedParam[];
}

interface PostmanFormData {
  key: string;
  type: "text" | "file";
  value?: string;
}

interface PostmanUrlEncodedParam {
  key: string;
  value: string;
}

interface OpenAPI {
  openapi: string;
  info: {
    title: string;
    description?: string;
    version: string;
  };
  paths: {
    [key: string]: OpenAPIPath;
  };
  components: {
    schemas: Record<string, unknown>;
  };
}

interface OpenAPIPath {
  [method: string]: {
    summary: string;
    description?: string;
    responses: {
      [key: string]: {
        description: string;
      };
    };
    requestBody?: {
      content: {
        [key: string]: {
          schema: OpenAPISchema;
        };
      };
    };
    parameters?: OpenAPIParameter[];
  };
}

interface OpenAPISchema {
  type: string;
  properties?: Record<string, { type: string; format?: string }>;
}

interface OpenAPIParameter {
  name: string;
  in: string;
  required: boolean;
  schema: {
    type: string;
  };
}

export function convertPostmanToOpenAPI(
  postmanJson: PostmanCollection,
): OpenAPI {
  console.log("postmanjson", postmanJson);
  const openAPI: OpenAPI = {
    openapi: "3.0.0",
    info: {
      title: postmanJson.info?.name || "API Documentation",
      description: postmanJson?.info?.description || "",
      version: postmanJson?.info?.version || "1.0.0",
    },
    paths: {},
    components: {
      schemas: {},
    },
  };

  // Recursive function to flatten the items and handle the folder structure
  function flattenItems(items: PostmanItem[], parentName: string = "") {
    items.forEach((item) => {
      const currentName = parentName
        ? `${parentName} / ${item.name}`
        : item.name;

      // If the item contains more nested items (folders), recurse
      if (item.item) {
        flattenItems(item.item, currentName);
      }

      // If the item is a request, handle the conversion
      if (item.request) {
        let path = "";
        if (item.request?.url?.path && item.request?.url?.path.length > 0) {
          path = item.request.url.path
            .map((segment) =>
              segment.startsWith(":") ? `{${segment.slice(1)}}` : segment,
            )
            .join("/");
        }

        const method = item.request.method.toLowerCase();

        // Ensure that the path exists in OpenAPI
        openAPI.paths[`/${path}`] = openAPI.paths[`/${path}`] || {};
        openAPI.paths[`/${path}`][method] = {
          summary: currentName, // Include parent folders in the summary
          description: item.request.description || "",
          responses: {
            200: {
              description: "Success",
            },
          },
        };

        // Handle request body depending on its mode
        if (item.request.body) {
          openAPI.paths[`/${path}`][method].requestBody = {
            content: {},
          };

          switch (item.request.body.mode) {
            case "raw": {
              const contentType = item.request.header?.find(
                (h) => h.key === "Content-Type",
              )?.value;

              if (contentType === "application/json" && item.request.body.raw) {
                // Parse JSON raw body
                try {
                  const parsedBody = JSON.parse(item.request.body.raw);
                  openAPI.paths[`/${path}`][method].requestBody.content[
                    "application/json"
                  ] = {
                    schema: {
                      type: "object",
                      properties: Object.keys(parsedBody).reduce(
                        (acc, key) => {
                          acc[key] = { type: typeof parsedBody[key] };
                          return acc;
                        },
                        {} as Record<string, { type: string }>,
                      ),
                    },
                  };
                } catch (error) {
                  console.warn(
                    `Failed to parse JSON body for ${item.name}:`,
                    error,
                  );
                }
              } else if (contentType === "text/html") {
                openAPI.paths[`/${path}`][method].requestBody.content[
                  "text/html"
                ] = {
                  schema: {
                    type: "string",
                  },
                };
              } else if (contentType === "application/xml") {
                openAPI.paths[`/${path}`][method].requestBody.content[
                  "application/xml"
                ] = {
                  schema: {
                    type: "string",
                  },
                };
              } else {
                openAPI.paths[`/${path}`][method].requestBody.content[
                  "text/plain"
                ] = {
                  schema: {
                    type: "string",
                  },
                };
              }
              break;
            }

            case "formdata": {
              const formDataSchema: OpenAPISchema = {
                type: "object",
                properties: {},
              };
              item.request.body.formdata?.forEach((formDataItem) => {
                formDataSchema.properties![formDataItem.key] =
                  formDataItem.type === "file"
                    ? { type: "string", format: "binary" }
                    : { type: "string" };
              });
              openAPI.paths[`/${path}`][method].requestBody.content[
                "multipart/form-data"
              ] = {
                schema: formDataSchema,
              };
              break;
            }

            case "urlencoded": {
              const urlencodedSchema: OpenAPISchema = {
                type: "object",
                properties: {},
              };
              item.request.body.urlencoded?.forEach((param) => {
                urlencodedSchema.properties![param.key] = { type: "string" };
              });
              openAPI.paths[`/${path}`][method].requestBody.content[
                "application/x-www-form-urlencoded"
              ] = {
                schema: urlencodedSchema,
              };
              break;
            }

            default:
              console.warn(
                `Unhandled body mode for ${item.name}: ${item.request.body.mode}`,
              );
          }
        }

        // Handle query parameters
        if (item.request?.url?.query && item.request.url.query.length > 0) {
          openAPI.paths[`/${path}`][method].parameters =
            item.request.url.query.map((param) => ({
              name: param.key,
              in: "query",
              required: param.value === "",
              schema: {
                type: "string",
              },
            }));
        }
      }
    });
  }

  // Start the recursive flattening process
  flattenItems(postmanJson.item);

  return openAPI;
}

@Injectable()
export class ConverterService {
  constructor() {}

  async convertCollection(data: PostmanCollection) {
    const response = convertPostmanToOpenAPI(data);
    return response;
  }

  // Method to convert Postman collection JSON to OpenAPI specs and optionally save the file
  async convertPostmanToOpenApi(
    postmanCollectionJson: object,
  ): Promise<string> {
    try {
      const stringDataa = postmanCollectionJson.toString();
      // Convert the Postman collection JSON to OpenAPI specs
      const result = await postmanToOpenApi(
        "C:\\Users\\HP\\Downloads\\New Collection.postman_collection.json",
      );

      // If no file path is provided, return the OpenAPI spec as a string
      return result;
    } catch (error) {
      // Handle error if the conversion fails
      throw new Error(`Error converting Postman to OpenAPI: ${error.message}`);
    }
  }
}
