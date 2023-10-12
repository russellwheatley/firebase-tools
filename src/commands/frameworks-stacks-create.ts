import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import requireInteractive from "../requireInteractive";
import { doSetup } from "../init/features/frameworks";

export const command = new Command("stacks:create")
  .description("Create a stack in a Firebase project")
  .before(requireInteractive)
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    await doSetup(options, projectId);
  });