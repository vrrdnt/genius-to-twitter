import { TwitterApi } from "twitter-api-v2";

function createClient(credentials) {
  return new TwitterApi({
    appKey: credentials.appKey,
    appSecret: credentials.appSecret,
    accessToken: credentials.accessToken,
    accessSecret: credentials.accessSecret,
  }).readWrite;
}

export function describeXError(error) {
  const details = [];
  if (Number.isInteger(error?.code)) details.push(`HTTP ${error.code}`);
  for (const value of [error?.data?.title, error?.data?.detail, error?.data?.type]) {
    if (typeof value === "string" && value.trim()) details.push(value.trim());
  }
  for (const item of Array.isArray(error?.data?.errors) ? error.data.errors : []) {
    const message = item?.message || item?.detail || item?.title;
    if (typeof message === "string" && message.trim()) details.push(message.trim());
  }
  if (details.length === 0 && error?.message) details.push(error.message);
  return [...new Set(details)].join(" | ") || "Unknown X API error";
}

function xRequestError(action, error) {
  return new Error(`${action} failed: ${describeXError(error)}`, { cause: error });
}

export async function publishToX(credentials, text) {
  let response;
  try {
    response = await createClient(credentials).v2.tweet(text);
  } catch (error) {
    throw xRequestError("Creating X Post", error);
  }

  if (!response?.data?.id) throw new Error("X accepted the request without returning a Post ID");
  return response.data;
}

export async function replyToX(credentials, text, inReplyToId) {
  let response;
  try {
    response = await createClient(credentials).v2.reply(text, inReplyToId);
  } catch (error) {
    throw xRequestError(`Replying to X Post ${inReplyToId}`, error);
  }

  if (!response?.data?.id) {
    throw new Error("X accepted the reply without returning a Post ID");
  }
  return response.data;
}
