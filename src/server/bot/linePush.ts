// 主動推播給你自己（LINE_USER_ID）的共用小工具，跟 routes/cron.ts 的
// daily-reminder 用同一套 @line/bot-sdk MessagingApiClient + pushMessage 機制。
import { messagingApi } from "@line/bot-sdk";

function makeOwnerClient(): messagingApi.MessagingApiClient {
  return new messagingApi.MessagingApiClient({
    channelAccessToken: process.env["LINE_CHANNEL_ACCESS_TOKEN"] ?? "",
  });
}

export async function pushTextMessageToOwner(text: string): Promise<void> {
  const userId = process.env["LINE_USER_ID"];
  if (!userId) {
    console.warn("LINE_USER_ID 未設定，略過推播:", text);
    return;
  }
  await makeOwnerClient().pushMessage({ to: userId, messages: [{ type: "text", text }] });
}

export async function pushFlexMessageToOwner(message: messagingApi.FlexMessage): Promise<void> {
  const userId = process.env["LINE_USER_ID"];
  if (!userId) {
    console.warn("LINE_USER_ID 未設定，略過推播:", message.altText);
    return;
  }
  await makeOwnerClient().pushMessage({ to: userId, messages: [message] });
}
