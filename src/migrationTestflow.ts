import { NestFactory } from "@nestjs/core";
import { Module, Provider } from "@nestjs/common";
import { MongoClient, Db } from "mongodb";
import { ConfigModule, ConfigService } from "@nestjs/config";
import configuration from "./modules/common/config/configuration";
import { UpdateTestFlowModelMigration } from "migrations/update-test-flow-model.migration";

const databaseProvider: Provider = {
  provide: "DATABASE_CONNECTION",
  useFactory: async (configService: ConfigService): Promise<Db> => {
    const dbUrl = configService.get<string>("db.url");

    if (!dbUrl) {
      throw new Error("Database URL is not defined in the configuration.");
    }

    const client = new MongoClient(dbUrl);
    await client.connect();
    return client.db("sparrow");
  },
  inject: [ConfigService],
};

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
  ],
  providers: [databaseProvider, UpdateTestFlowModelMigration],
})
class MigrationModule {}

async function run() {
  const app = await NestFactory.createApplicationContext(MigrationModule);
  const migration = app.get(UpdateTestFlowModelMigration);
  await migration.onModuleInit();
  await app.close();
}

run();
