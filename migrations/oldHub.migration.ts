import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { Collections } from "@src/modules/common/enum/database.collection.enum";
import { Team } from "@src/modules/common/models/team.model";
import { Workspace } from "@src/modules/common/models/workspace.model";
import { Db, ObjectId } from "mongodb";

@Injectable()
export class OldHubMigration implements OnModuleInit {
  constructor(@Inject("DATABASE_CONNECTION") private db: Db) {}

  async onModuleInit(): Promise<void> {
    console.log("Migration started->");
    const teams = await this.db
      .collection<Team>(Collections.TEAM)
      .find({
        $or: [
          { hubUrl: { $exists: false } },
          { $expr: { $gt: [{ $strLenCP: "$hubUrl" }, 70] } },
        ],
      })
      .toArray();
    let teamCount = 0;

    for (const team of teams) {
      const hubUrl = await this.generateUniqueHubUrl(team.name);

      // Update Team document
      await this.db
        .collection<Team>(Collections.TEAM)
        .updateOne({ _id: new ObjectId(team._id) }, { $set: { hubUrl } });

      // Update related Workspaces
      await this.db
        .collection<Workspace>(Collections.WORKSPACE)
        .updateMany(
          { "team.id": team._id.toString() },
          { $set: { "team.hubUrl": hubUrl } },
        );
      teamCount++;
    }
    console.log("Migration ended. Total number of teams updated: ", teamCount);
  }

  private sanitizeName(name: string): string {
    return name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  private async generateUniqueHubUrl(name: string): Promise<string> {
    const prefix = "https://";
    const suffix = ".sparrowhub.net";
    // const envPath =
    //   process.env.NODE_ENV === "production" ? "/release/v1" : "/dev";

    let base = this.sanitizeName(name);
    if (base.length > 50) {
      base = base.slice(0, 50);
    }
    const baseUrl = `${prefix}${base}`;

    const regexPattern = `^${baseUrl}\\d*${suffix}$`;

    const existingTeams = await this.db
      .collection<Team>(Collections.TEAM)
      .find({ hubUrl: { $regex: regexPattern, $options: "i" } })
      .project({ hubUrl: 1 })
      .toArray();

    const existingUrls = new Set(existingTeams.map((team) => team.hubUrl));
    const finalUrl = `${baseUrl}${suffix}`;

    if (!existingUrls.has(finalUrl)) {
      return finalUrl;
    }

    let counter = 1;
    while (existingUrls.has(`${baseUrl}${counter}${suffix}`)) {
      counter++;
    }

    return `${baseUrl}${counter}${suffix}`;
  }
}
