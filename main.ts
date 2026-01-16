"use strict";
import { getTools, confirm, arcade } from "./tools";
import { createAgent } from "langchain";
import {
  Command,
  MemorySaver,
  type Interrupt,
} from "@langchain/langgraph";
import chalk from "chalk";
import * as readline from "node:readline/promises";

// configure your own values to customize your agent

// The Arcade User ID identifies who is authorizing each service.
const arcadeUserID = process.env.ARCADE_USER_ID;
if (!arcadeUserID) {
  throw new Error("Missing ARCADE_USER_ID. Add it to your .env file.");
}
// This determines which MCP server is providing the tools, you can customize this to make a Slack agent, or Notion agent, etc.
// all tools from each of these MCP servers will be retrieved from arcade
const toolkits=['GoogleDocs'];
// This determines isolated tools that will be
const isolatedTools=[];
// This determines the maximum number of tool definitions Arcade will return
const toolLimit = 100;
// This prompt defines the behavior of the agent.
const systemPrompt = "# AI Agent for Google Docs Management\n\n## Introduction\nWelcome to the AI agent designed for efficient management of Google Docs. This agent utilizes various tools to create, edit, comment on, and search for documents within your Google Drive. Its purpose is to streamline your document management tasks, making collaboration and information retrieval easier and more intuitive.\n\n## Instructions\n1. The agent will initiate actions based on user prompts related to Google Docs.\n2. It will utilize the available tools in a logical sequence to fulfill user requests.\n3. The agent will provide feedback on actions taken, including confirmation of document creation, editing, or commenting.\n4. When searching for documents, the agent will return relevant outputs based on specified criteria.\n\n## Workflows\n\n### 1. Document Creation\n- **Tools Used**:\n  - GoogleDocs_CreateBlankDocument\n  - GoogleDocs_CreateDocumentFromText\n- **Sequence**:\n  1. If the user requests a blank document, the agent will use `GoogleDocs_CreateBlankDocument` with the provided title.\n  2. If the user provides text content for a new document, the agent will use `GoogleDocs_CreateDocumentFromText`.\n\n### 2. Document Editing\n- **Tools Used**:\n  - GoogleDocs_EditDocument\n  - GoogleDocs_InsertTextAtEndOfDocument\n- **Sequence**:\n  1. The agent will accept specific edit requests from the user.\n  2. It will then execute `GoogleDocs_EditDocument` to apply the changes based on the edit requests.\n  3. If the user wants to add text to the end of a document, it will use `GoogleDocs_InsertTextAtEndOfDocument`.\n\n### 3. Document Commenting\n- **Tools Used**:\n  - GoogleDocs_CommentOnDocument\n  - GoogleDocs_ListDocumentComments\n- **Sequence**:\n  1. To add comments, the agent will use `GoogleDocs_CommentOnDocument` with the document ID and comment text from the user.\n  2. If requested, the agent can use `GoogleDocs_ListDocumentComments` to retrieve and display all comments on a specified document.\n\n### 4. Document Search\n- **Tools Used**:\n  - GoogleDocs_SearchDocuments\n  - GoogleDocs_SearchAndRetrieveDocuments\n- **Sequence**:\n  1. The agent will process search queries using `GoogleDocs_SearchDocuments` to find metadata for documents based on defined keywords.\n  2. If the user wants to retrieve content along with metadata, it will then utilize `GoogleDocs_SearchAndRetrieveDocuments`.\n\n### 5. Document Metadata Retrieval\n- **Tools Used**:\n  - GoogleDocs_GetDocumentMetadata\n  - GoogleDocs_GetDocumentAsDocmd\n- **Sequence**:\n  1. Upon request, the agent will use `GoogleDocs_GetDocumentMetadata` to gather information about a specific document.\n  2. If detailed content is needed, it will follow up with `GoogleDocs_GetDocumentAsDocmd`.\n\n### 6. User Information Retrieval\n- **Tools Used**:\n  - GoogleDocs_WhoAmI\n- **Sequence**:\n  1. To provide user details, the agent will invoke `GoogleDocs_WhoAmI` to retrieve profile and access information.\n\nBy following these workflows, the agent effectively manages interactions with Google Docs, ensuring a smooth experience for the user.";
// This determines which LLM will be used inside the agent
const agentModel = process.env.OPENAI_MODEL;
if (!agentModel) {
  throw new Error("Missing OPENAI_MODEL. Add it to your .env file.");
}
// This allows LangChain to retain the context of the session
const threadID = "1";

const tools = await getTools({
  arcade,
  toolkits: toolkits,
  tools: isolatedTools,
  userId: arcadeUserID,
  limit: toolLimit,
});



async function handleInterrupt(
  interrupt: Interrupt,
  rl: readline.Interface
): Promise<{ authorized: boolean }> {
  const value = interrupt.value;
  const authorization_required = value.authorization_required;
  const hitl_required = value.hitl_required;
  if (authorization_required) {
    const tool_name = value.tool_name;
    const authorization_response = value.authorization_response;
    console.log("⚙️: Authorization required for tool call", tool_name);
    console.log(
      "⚙️: Please authorize in your browser",
      authorization_response.url
    );
    console.log("⚙️: Waiting for you to complete authorization...");
    try {
      await arcade.auth.waitForCompletion(authorization_response.id);
      console.log("⚙️: Authorization granted. Resuming execution...");
      return { authorized: true };
    } catch (error) {
      console.error("⚙️: Error waiting for authorization to complete:", error);
      return { authorized: false };
    }
  } else if (hitl_required) {
    console.log("⚙️: Human in the loop required for tool call", value.tool_name);
    console.log("⚙️: Please approve the tool call", value.input);
    const approved = await confirm("Do you approve this tool call?", rl);
    return { authorized: approved };
  }
  return { authorized: false };
}

const agent = createAgent({
  systemPrompt: systemPrompt,
  model: agentModel,
  tools: tools,
  checkpointer: new MemorySaver(),
});

async function streamAgent(
  agent: any,
  input: any,
  config: any
): Promise<Interrupt[]> {
  const stream = await agent.stream(input, {
    ...config,
    streamMode: "updates",
  });
  const interrupts: Interrupt[] = [];

  for await (const chunk of stream) {
    if (chunk.__interrupt__) {
      interrupts.push(...(chunk.__interrupt__ as Interrupt[]));
      continue;
    }
    for (const update of Object.values(chunk)) {
      for (const msg of (update as any)?.messages ?? []) {
        console.log("🤖: ", msg.toFormattedString());
      }
    }
  }

  return interrupts;
}

async function main() {
  const config = { configurable: { thread_id: threadID } };
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(chalk.green("Welcome to the chatbot! Type 'exit' to quit."));
  while (true) {
    const input = await rl.question("> ");
    if (input.toLowerCase() === "exit") {
      break;
    }
    rl.pause();

    try {
      let agentInput: any = {
        messages: [{ role: "user", content: input }],
      };

      // Loop until no more interrupts
      while (true) {
        const interrupts = await streamAgent(agent, agentInput, config);

        if (interrupts.length === 0) {
          break; // No more interrupts, we're done
        }

        // Handle all interrupts
        const decisions: any[] = [];
        for (const interrupt of interrupts) {
          decisions.push(await handleInterrupt(interrupt, rl));
        }

        // Resume with decisions, then loop to check for more interrupts
        // Pass single decision directly, or array for multiple interrupts
        agentInput = new Command({ resume: decisions.length === 1 ? decisions[0] : decisions });
      }
    } catch (error) {
      console.error(error);
    }

    rl.resume();
  }
  console.log(chalk.red("👋 Bye..."));
  process.exit(0);
}

// Run the main function
main().catch((err) => console.error(err));