import * as clc from "colorette";
import * as utils from "../../../utils";
import { logger } from "../../../logger";
import { promptOnce } from "../../../prompt";
import {
  DEFAULT_REGION,
  ALLOWED_REGIONS,
  DEFAULT_DEPLOY_METHOD,
  ALLOWED_DEPLOY_METHODS,
} from "./constants";
import * as repo from "./repo";
import { Backend, BackendOutputOnlyFields } from "../../../gcp/frameworks";
import { Repository } from "../../../gcp/cloudbuild";
import * as poller from "../../../operation-poller";
import { frameworksOrigin } from "../../../api";
import * as gcp from "../../../gcp/frameworks";
import { API_VERSION } from "../../../gcp/frameworks";
import { FirebaseError } from "../../../error";

const frameworksPollerOptions: Omit<poller.OperationPollerOptions, "operationResourceName"> = {
  apiOrigin: frameworksOrigin,
  apiVersion: API_VERSION,
  masterTimeout: 25 * 60 * 1_000,
  maxBackoff: 10_000,
};

/**
 * Setup new frameworks project.
 */
export async function doSetup(setup: any, projectId: string): Promise<void> {
  setup.frameworks = {};

  utils.logBullet("First we need a few details to create your service.");

  await promptOnce(
    {
      name: "serviceName",
      type: "input",
      default: "acme-inc-web",
      message: "Create a name for your service [1-30 characters]",
    },
    setup.frameworks
  );

  await promptOnce(
    {
      name: "region",
      type: "list",
      default: DEFAULT_REGION,
      message:
        "Please select a region " +
        `(${clc.yellow("info")}: Your region determines where your backend is located):\n`,
      choices: ALLOWED_REGIONS,
    },
    setup.frameworks
  );

  utils.logSuccess(`Region set to ${setup.frameworks.region}.`);

  logger.info(clc.bold(`\n${clc.white("===")} Deploy Setup`));

  await promptOnce(
    {
      name: "deployMethod",
      type: "list",
      default: DEFAULT_DEPLOY_METHOD,
      message: "How do you want to deploy",
      choices: ALLOWED_DEPLOY_METHODS,
    },
    setup.frameworks
  );

  const backend: Backend | undefined = await getOrCreateBackend(projectId, setup);
  if (backend) {
    utils.logSuccess(`Successfully created a backend: ${backend.name}`);
  }
}

function toBackend(cloudBuildConnRepo: Repository): Omit<Backend, BackendOutputOnlyFields> {
  return {
    codebase: {
      repository: `${cloudBuildConnRepo.name}`,
      rootDirectory: "/",
    },
    labels: {},
  };
}

/**
 * Creates backend if it doesn't exist.
 */
export async function getOrCreateBackend(
  projectId: string,
  setup: any
): Promise<Backend | undefined> {
  const location: string = setup.frameworks.region;
  const deployMethod: string = setup.frameworks.deployMethod;
  try {
    return await getExistingBackend(projectId, setup, location);
  } catch (err: unknown) {
    if ((err as FirebaseError).status === 404) {
      logger.info("Creating new backend.");
      if (deployMethod === "github") {
        const cloudBuildConnRepo = await repo.linkGitHubRepository(projectId, location);
        const backendDetails = toBackend(cloudBuildConnRepo);
        return await createBackend(
          projectId,
          location,
          backendDetails,
          setup.frameworks.serviceName
        );
      }
    } else {
      throw new FirebaseError(
        `Failed to get or create a backend using the given initialization details: ${err}`
      );
    }
  }

  return undefined;
}

async function getExistingBackend(
  projectId: string,
  setup: any,
  location: string
): Promise<Backend> {
  let backend = await gcp.getBackend(projectId, location, setup.frameworks.serviceName);
  while (backend) {
    setup.frameworks.serviceName = undefined;
    await promptOnce(
      {
        name: "existingBackend",
        type: "confirm",
        default: true,
        message:
          "A backend already exists for the given serviceName, do you want to use existing backend? (yes/no)",
      },
      setup.frameworks
    );
    if (setup.frameworks.existingBackend) {
      logger.info("Using the existing backend.");
      return backend;
    }
    await promptOnce(
      {
        name: "serviceName",
        type: "input",
        default: "acme-inc-web",
        message: "Please enter a new service name [1-30 characters]",
      },
      setup.frameworks
    );
    backend = await gcp.getBackend(projectId, location, setup.frameworks.serviceName);
    setup.frameworks.existingBackend = undefined;
  }

  return backend;
}

/**
 * Creates backend object from long running operations.
 */
export async function createBackend(
  projectId: string,
  location: string,
  backendReqBoby: Omit<Backend, BackendOutputOnlyFields>,
  backendId: string
): Promise<Backend> {
  const op = await gcp.createBackend(projectId, location, backendReqBoby, backendId);
  const backend = await poller.pollOperation<Backend>({
    ...frameworksPollerOptions,
    pollerName: `create-${projectId}-${location}-${backendId}`,
    operationResourceName: op.name,
  });

  return backend;
}
