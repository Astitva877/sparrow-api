import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { Collections } from "@src/modules/common/enum/database.collection.enum";
import { Collection } from "@src/modules/common/models/collection.model";
import { Team } from "@src/modules/common/models/team.model";
import { Workspace } from "@src/modules/common/models/workspace.model";
import { Db, ObjectId } from "mongodb";
import { v4 as uuidv4 } from "uuid";

@Injectable()
export class MockRequestResponseMigration implements OnModuleInit {
  private hasRun = false;
  constructor(@Inject("DATABASE_CONNECTION") private db: Db) {}

  async onModuleInit(): Promise<void> {
    if (this.hasRun) {
      // Check if migration has already run
      return;
    }
    try {
      console.log(
        `\n\x1b[32m[Nest]\x1b[0m \x1b[32mExecuting Mock URL Migration Started...`,
      );
      // Retrieve all collections of type MOCK
      const mockCollections = await this.db
        .collection(Collections.COLLECTION)
        .find({ collectionType: "MOCK" })
        .toArray();
      for (const collection of mockCollections) {
        let hasChanges = false;

        // Process items in the collection
        if (collection.items && Array.isArray(collection.items)) {
          // hasChanges =
          //   this.processItems(collection.items, collection._id.toString()) ||
          //   hasChanges;
          // Run the new migration logic
          hasChanges =
            this.migrateMockRequestResponses(collection.items) || hasChanges;
        }

        // Update the collection if there were changes
        if (hasChanges) {
          await this.db
            .collection<Collection>(Collections.COLLECTION)
            .updateOne(
              { _id: new ObjectId(collection._id) },
              { $set: { items: collection.items } },
            );
          console.log(`Updated collection: ${collection._id}`);
        }
      }

      console.log(`\x1b[32m[Nest]\x1b[0m \x1b[32m Migration Done.`);
      this.hasRun = true; // Set flag after successful execution
    } catch (error) {
      console.error("Error during workspace type migration:", error);
    }
  }
  private migrateMockRequestResponses(items: any[]): boolean {
    let hasChanges = false;

    for (const item of items) {
      // Only process MOCK_REQUEST type
      if (
        item.type === "MOCK_REQUEST" &&
        item.mockRequest &&
        typeof item.mockRequest === "object" &&
        typeof item.mockRequest.responseBody === "string" &&
        item.mockRequest.responseBody.trim() !== "" &&
        typeof item.mockRequest.responseStatus === "string" &&
        item.mockRequest.responseStatus.trim() !== "" &&
        !Array.isArray(item.items)
      ) {
        // Add items array and push MOCK_REQUEST_RESPONSE object
        item.items = [
          {
            id: uuidv4(),
            name: item.name + " Response",
            type: "MOCK_REQUEST_RESPONSE",
            description: "",
            mockRequestResponse: {
              responseBody: item.mockRequest.responseBody,
              responseStatus: item.mockRequest.responseStatus,
              ResponseHeaders: [{ key: "", value: "", checked: false }],
              selectedResponseBodyType: "",
              isMockResponseActive: false,
              // Add other fields if needed
            },
            source: item.source ?? "USER",
            isDeleted: false,
            createdBy: item.createdBy ?? "",
            updatedBy: item.updatedBy ?? "",
            createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
            updatedAt: item.updatedAt ? new Date(item.updatedAt) : new Date(),
            state: {
              responseBodyLanguage: "Text",
              responseBodyFormatter: "Pretty",
              responseNavigation: "Response",
            },
          },
        ];
        hasChanges = true;
      }

      // Recurse into folders
      if (item.type === "FOLDER" && Array.isArray(item.items)) {
        hasChanges = this.migrateMockRequestResponses(item.items) || hasChanges;
      }
    }

    return hasChanges;
  }
  // private processItems(items: any[], collectionId: string): boolean {
  //   let hasChanges = false;

  //   for (const item of items) {
  //     // Process MOCK_REQUEST type items
  //     if (
  //       item.type === "MOCK_REQUEST" &&
  //       item.mockRequest &&
  //       item.mockRequest.url
  //     ) {
  //       // console.log("ite----", item);
  //       // for (const mockResponseItem of item.items) {
  //       //   if (
  //       //     mockResponseItem.mockRequestResponse &&
  //       //     mockResponseItem.mockRequestResponse.url
  //       //   ) {
  //       console.log("url---->", item.mockRequest.url);
  //       const originalUrl = item.mockRequest.url;
  //       const updatedUrl = this.extractRestUrl(originalUrl, collectionId);

  //       if (updatedUrl !== originalUrl) {
  //         item.mockRequest.url = updatedUrl;
  //         hasChanges = true;
  //         console.log(`Updated URL from: ${originalUrl} to: ${updatedUrl}`);
  //       }
  //       //   }
  //       // }
  //     }

  //     // Process FOLDER type items (recursive)
  //     if (item.type === "FOLDER" && item.items && Array.isArray(item.items)) {
  //       hasChanges = this.processItems(item.items, collectionId) || hasChanges;
  //     }
  //   }

  //   return hasChanges;
  // }

  private extractRestUrl(url: string, collectionId: string): string {
    // Create regex pattern to match the URL structure with optional path
    const patternWithPath = new RegExp(
      `^https?://[^/]+/api/mock/${collectionId}(/.*)$`,
    );
    const patternWithoutPath = new RegExp(
      `^https?://[^/]+/api/mock/${collectionId}$`,
    );

    const matchWithPath = url.match(patternWithPath);
    const matchWithoutPath = url.match(patternWithoutPath);

    if (matchWithPath) {
      return matchWithPath[1]; // Return the part after collectionId with leading slash
    }

    if (matchWithoutPath) {
      return ""; // Return empty string if URL ends with collection ID
    }

    // If URL doesn't match expected pattern, return the original url
    return url;
  }
}
