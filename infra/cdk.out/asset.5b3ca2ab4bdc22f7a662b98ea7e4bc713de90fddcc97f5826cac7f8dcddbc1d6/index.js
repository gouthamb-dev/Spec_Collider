"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// lambda/handler.ts
var handler_exports = {};
__export(handler_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(handler_exports);
var import_client_bedrock_runtime = require("@aws-sdk/client-bedrock-runtime");

// lambda/message-mapper.ts
function mapToBedrockMessages(messages) {
  return messages.map((msg) => ({
    role: msg.role,
    content: [{ text: msg.content }]
  }));
}

// lambda/sse.ts
function formatSSEChunk(content, done) {
  return `data: ${JSON.stringify({ content, done })}

`;
}

// lambda/handler.ts
var client = new import_client_bedrock_runtime.BedrockRuntimeClient({});
var MODEL_ID = process.env.BEDROCK_MODEL_ID ?? "us.amazon.nova-2-lite-v1:0";
async function handler(event) {
  let body;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "messages field is required and must be an array" })
    };
  }
  if (!body.messages || !Array.isArray(body.messages)) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "messages field is required and must be an array" })
    };
  }
  const bedrockMessages = mapToBedrockMessages(body.messages);
  const systemPrompt = body.system ? [{ text: body.system }] : void 0;
  try {
    const command = new import_client_bedrock_runtime.ConverseStreamCommand({
      modelId: MODEL_ID,
      messages: bedrockMessages,
      system: systemPrompt
    });
    const response = await client.send(command);
    const chunks = [];
    if (response.stream) {
      for await (const event2 of response.stream) {
        if (event2.contentBlockDelta?.delta?.text) {
          const text = event2.contentBlockDelta.delta.text;
          chunks.push(formatSSEChunk(text, false));
        }
      }
    }
    chunks.push(formatSSEChunk("", true));
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache"
      },
      body: chunks.join("")
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: message })
    };
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
