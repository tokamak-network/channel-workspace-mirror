const PRIVATE_STATE_CLI_PACKAGE = "@tokamak-private-dapps/private-state-cli";
const PRIVATE_STATE_CLI_REGISTRY_URL =
  "https://registry.npmjs.org/@tokamak-private-dapps%2Fprivate-state-cli/latest";

type NpmLatestPackageResponse = {
  version?: unknown;
};

export const PRIVATE_STATE_CLI_NPM_URL = `https://www.npmjs.com/package/${PRIVATE_STATE_CLI_PACKAGE}`;

export async function getPrivateStateCliLatestVersion() {
  const response = await fetch(PRIVATE_STATE_CLI_REGISTRY_URL, {
    headers: {
      accept: "application/json",
    },
    next: {
      revalidate: 3600,
    },
  });
  if (!response.ok) {
    return null;
  }

  const body = await response.json() as NpmLatestPackageResponse;
  if (typeof body.version !== "string" || body.version.trim() === "") {
    return null;
  }
  return body.version;
}
