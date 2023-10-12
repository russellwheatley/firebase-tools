import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import * as gcp from "../gcp/frameworks";
import { FirebaseError } from "../error";
import { logger } from "../logger";

export const command = new Command("stacks:get")
  .description("Get stack details of a Firebase project")
  .option("-l, --location <location>", "Stack backend location", "us-central1")
  .option("--s, --stackId <stackId>", "Id for the stack", "")
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    const location = options.location as string;
    const stackId = options.stackId as string;
    if (!stackId) {
      throw new FirebaseError("Stack id can't be empty.");
    }

    try {
      const stack = await gcp.getStack(projectId, location, stackId);
      logger.info(stack);
    } catch (err: any) {
      throw new FirebaseError(
        `Failed to get stack: ${stackId}. Please check the parameters you have provided.`
      );
    }
  });