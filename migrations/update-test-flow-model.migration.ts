import { Injectable, OnModuleInit, Inject } from "@nestjs/common";
import { Collections } from "@src/modules/common/enum/database.collection.enum";
import { Collection } from "@src/modules/common/models/collection.model";
import { Testflow } from "@src/modules/common/models/testflow.model";
import { Db } from "mongodb";

@Injectable()
export class UpdateTestFlowModelMigration implements OnModuleInit {
  private hasRun = false;
  constructor(@Inject("DATABASE_CONNECTION") private db: Db) {}

  async onModuleInit(): Promise<void> {
    if (this.hasRun) {
      // Check if migration has already run
      return;
    }
    try {
      console.log(
        `\n\x1b[32m[Nest]\x1b[0m \x1b[32mExecuting TestFlow Data Migration...`,
      );
      const testFlowCollection = this.db.collection<Testflow>(
        Collections.TESTFLOW,
      );
      const collectionCollection = this.db.collection<Collection>(
        Collections.COLLECTION,
      );

      const testflows = await testFlowCollection.find().toArray();
      const collections = await collectionCollection.find().toArray();

      for (const flow of testflows) {
        const updatedNodes = await this.updateNodes(
          flow.nodes || [],
          collections,
          flow.workspaceId,
        );
        flow.nodes = updatedNodes;
        await testFlowCollection.updateOne(
          { _id: flow._id },
          { $set: { nodes: updatedNodes } },
        );
      }
      console.log(
        `\x1b[32m[Nest] \x1b[33m${testflows?.length || 0}\x1b[0m \x1b[32maffected documents, migration completed successfully.`,
      );
      this.hasRun = true; // Set flag after successful execution
    } catch (error) {
      console.error("Error during update testflow model migration:", error);
    }
  }

  private async updateNodes(
    nodes: any[],
    collections: any[],
    workspaceId: string,
  ) {
    return nodes.map((node) => {
      if (node?.id === "1") {
        return {
          ...node,
          data: {
            blockName: "startBlock",
            collectionId: "",
            folderId: "",
            requestId: "",
            workspaceId,
            name: "",
            method: "",
            isDeleted: false,
            requestData: null,
          },
        };
      } else {
        const { collectionId, requestId, folderId, name, method } =
          node?.data || {};

        let requestData = this.findRequestData(
          collections,
          collectionId,
          folderId,
          requestId,
        );

        if (requestData) {
          requestData = {
            ...requestData,
            name: name || "Untitled Request",
            method: method || "GET",
          };
        } else {
          requestData = {
            method: method || "GET",
            url: "",
            body: {
              raw: "",
              urlencoded: [{ key: "", value: "", checked: false }],
              formdata: {
                text: [{ key: "", value: "", checked: false }],
                file: [],
              },
            },
            headers: [{ key: "", value: "", checked: false }],
            queryParams: [{ key: "", value: "", checked: false }],
            auth: {
              bearerToken: "",
              basicAuth: { username: "", password: "" },
              apiKey: { authKey: "", authValue: "", addTo: "Header" },
            },
            selectedRequestBodyType: "application/json",
            selectedRequestAuthType: "No Auth",
            name: name || "Untitled Request",
          };
        }

        return {
          ...node,
          data: {
            blockName: `block ${node.id - 1}`,
            collectionId,
            name: name || "Untitled Request",
            method: method || "GET",
            folderId,
            requestId,
            workspaceId,
            isDeleted: false,
            requestData,
          },
        };
      }
    });
  }

  private findRequestData(
    collections: any[],
    collectionId: string,
    folderId: string,
    requestId: string,
  ) {
    const collection = collections.find(
      (col) => col._id?.toString() === collectionId,
    );
    if (!collection?.items) return null;

    for (const folder of collection.items) {
      if (folderId && folder.id === folderId) {
        return (
          folder.items?.find((item: any) => item.id === requestId)?.request ||
          null
        );
      }
      if (!folderId && folder.id === requestId) {
        return folder?.request || null;
      }
    }
    return null;
  }
}
