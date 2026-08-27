import { requestApiKey } from "../convertClient.js";

export async function runLogin(email: string, baseUrl: string): Promise<void> {
  await requestApiKey(email, baseUrl);
  console.log(`Check your email (${email}) for a link to reveal your API key.`);
  console.log("Once you have it, run: b2o key set");
}
