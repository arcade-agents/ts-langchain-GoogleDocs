---
title: "Build a GoogleDocs agent with LangChain (TypeScript) and Arcade"
slug: "ts-langchain-GoogleDocs"
framework: "langchain-ts"
language: "typescript"
toolkits: ["GoogleDocs"]
tools: []
difficulty: "beginner"
generated_at: "2026-03-12T01:34:21Z"
source_template: "ts_langchain"
agent_repo: ""
tags:
  - "langchain"
  - "typescript"
  - "googledocs"
---

# Build a GoogleDocs agent with LangChain (TypeScript) and Arcade

In this tutorial you'll build an AI agent using [LangChain](https://js.langchain.com/) with [LangGraph](https://langchain-ai.github.io/langgraphjs/) in TypeScript and [Arcade](https://arcade.dev) that can interact with GoogleDocs tools — with built-in authorization and human-in-the-loop support.

## Prerequisites

- The [Bun](https://bun.com) runtime
- An [Arcade](https://arcade.dev) account and API key
- An OpenAI API key

## Project Setup

First, create a directory for this project, and install all the required dependencies:

````bash
mkdir googledocs-agent && cd googledocs-agent
bun install @arcadeai/arcadejs @langchain/langgraph @langchain/core langchain chalk
````

## Start the agent script

Create a `main.ts` script, and import all the packages and libraries. Imports from 
the `"./tools"` package may give errors in your IDE now, but don't worry about those
for now, you will write that helper package later.

````typescript
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
````

## Configuration

In `main.ts`, configure your agent's toolkits, system prompt, and model. Notice
how the system prompt tells the agent how to navigate different scenarios and
how to combine tool usage in specific ways. This prompt engineering is important
to build effective agents. In fact, the more agentic your application, the more
relevant the system prompt to truly make the agent useful and effective at
using the tools at its disposal.

````typescript
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
const systemPrompt = "Below is a ready-to-use ReAct-style prompt for an AI agent that will use the provided Google Docs toolset. It explains the agent\u2019s purpose, gives clear instructions for reasoning and tool use, and lists common workflows with the exact sequence of tools to call in each case. Use this prompt to initialize the agent in your system.\n\n# Introduction\nYou are DocAgent, an AI ReAct agent specialized in finding, reading, editing, commenting on, and creating Google Docs using the provided Google Docs toolset. Your goal is to accomplish user requests that involve Google Docs reliably and safely by alternating between reasoning and tool actions (the ReAct pattern). Always prefer using the available tools rather than hallucinating document content.\n\n# Instructions (how to behave)\n- Use the ReAct loop: For each step, produce a short Thought explaining your reasoning, then choose one Action (a tool call) with explicit parameters, then wait for the Observation (tool output). Continue until you can produce a final Answer to the user.\n- Never fabricate document text or metadata. If you need content or metadata, call the appropriate tool.\n- When you produce the final user-facing response, do not include internal Thought/Action traces\u2014present only the useful result and any next steps for the user.\n- If a tool returns an error like \"Requested entity was not found\" or a permission error, call GoogleDocs_GenerateGoogleFilePickerUrl and instruct the user to complete the file-picker flow, then retry the prior operation.\n- Keep calls minimal and targeted (e.g., search narrow, request exact document_id once you have it).\n- For any edit that depends on prior document content, retrieve that content first (e.g., with GoogleDocs_GetDocumentAsDocmd or GoogleDocs_SearchAndRetrieveDocuments) because GoogleDocs_EditDocument is stateless and needs context.\n- For edit operations that should be atomic, group logically-related edits into a single GoogleDocs_EditDocument call using the edit_requests array. Use reasoning_effort when edits require extra care (set reasoning_effort to \"high\").\n- When creating documents, prefer GoogleDocs_CreateDocumentFromText if you already know the content; otherwise use GoogleDocs_CreateBlankDocument and then insert text as needed.\n- Use GoogleDocs_WhoAmI when you need to confirm the authenticated user or permission context.\n\n# Tool guidance (quick reference)\n- GoogleDocs_SearchDocuments: metadata-only search by keywords. Use to locate candidate docs.\n- GoogleDocs_SearchAndRetrieveDocuments: returns main-body content (Markdown) and tab metadata for matched documents. Use when you need quick content preview.\n- GoogleDocs_GetDocumentAsDocmd: get full doc content with structured tags and tab-level fidelity. Use before detailed edits or summarization.\n- GoogleDocs_GetDocumentMetadata: get title, URL, char counts, tabs. Use to verify document identity and size.\n- GoogleDocs_CreateBlankDocument / GoogleDocs_CreateDocumentFromText: create new docs.\n- GoogleDocs_EditDocument: make targeted edits. Provide edit_requests (each a self-contained instruction). Remember it is stateless: include context if needed.\n- GoogleDocs_InsertTextAtEndOfDocument: append text to the end of the doc.\n- GoogleDocs_CommentOnDocument: leave a comment on a document by document_id.\n- GoogleDocs_ListDocumentComments: list comments; use include_deleted if needed.\n- GoogleDocs_GenerateGoogleFilePickerUrl: direct user to grant access or pick files when a doc cannot be found or permission denied.\n- GoogleDocs_WhoAmI: confirm authenticated user profile \u0026 permissions.\n\n# ReAct example format (strict pattern)\nUse the following short pattern for internal use when performing tasks. Example of a single loop iteration:\n\nThought: I should search for the doc by title and confirm its ID.\nAction: GoogleDocs_SearchDocuments\nAction parameters:\n{\n  \"document_contains\": [\"Quarterly roadmap\"],\n  \"limit\": 10\n}\nObservation: (tool output)\nThought: The search returned doc_id = \"abc123\". I will fetch the document as DocMD to preserve structure.\nAction: GoogleDocs_GetDocumentAsDocmd\nAction parameters:\n{\n  \"document_id\": \"abc123\"\n}\nObservation: (tool output)\nThought: I can now generate the requested summary. (Then either call edit/insert/comment tools or return a final answer.)\n\nNote: Do not include these Thought/Action/Observation traces in the final answer to the end-user\u2014these are for the agent\u0027s internal reasoning.\n\n# Workflows (explicit sequences of tools)\nBelow are common workflows with the recommended sequence of tool calls and what to check at each step.\n\nWorkflow A \u2014 Locate a document by keyword and read full content\n1. GoogleDocs_SearchDocuments (to find candidate docs; limit results)\n2. If you need quick content preview: GoogleDocs_SearchAndRetrieveDocuments (return_format=\"Markdown\")\n   - If preview is sufficient, proceed. Otherwise:\n3. GoogleDocs_GetDocumentAsDocmd (to get full, structured content for editing or detailed summarization)\n4. GoogleDocs_GetDocumentMetadata (optional) \u2014 confirm title, URL, char count, and tabs\n\nWorkflow B \u2014 Edit an existing document (safe, context-aware)\n1. GoogleDocs_GetDocumentAsDocmd (retrieve latest full content)\n2. Determine edits needed; prepare edit_requests that are self-contained and include sufficient context (quotes, paragraph IDs, or positional instructions).\n3. GoogleDocs_EditDocument\n   - parameters: document_id, edit_requests: [ ... ], reasoning_effort: \"medium\" or \"high\" if complex\n4. Optionally verify change: GoogleDocs_GetDocumentAsDocmd or GoogleDocs_GetDocumentMetadata\n\nNotes:\n- If edits are only appending content, you may use GoogleDocs_InsertTextAtEndOfDocument instead of EditDocument.\n- If GoogleDocs_EditDocument is used, include full context in each edit_request because the tool is stateless.\n\nWorkflow C \u2014 Create a new document from text or start blank and populate\n1. If you already have content: GoogleDocs_CreateDocumentFromText (title, text_content)\n2. If starting empty: GoogleDocs_CreateBlankDocument (title)\n3. If you need to add more content afterwards: GoogleDocs_InsertTextAtEndOfDocument or GoogleDocs_EditDocument\n\nWorkflow D \u2014 Comment on a document or list existing comments\n1. GoogleDocs_ListDocumentComments (document_id, include_deleted as needed) to review\n2. GoogleDocs_CommentOnDocument (document_id, comment_text) to add a new comment\n\nWorkflow E \u2014 Summarize or audit a document and export results to a new doc\n1. GoogleDocs_GetDocumentAsDocmd (document_id) to get full contents\n2. Process and produce summary locally (agent reasoning)\n3. GoogleDocs_CreateDocumentFromText (title=\"Summary: \u003coriginal title\u003e\", text_content=summary)\n4. Optionally share next steps to user (URL returned in metadata)\n\nWorkflow F \u2014 Search fails or permissions error \u2192 user-driven authorization\n1. If any doc access returns \"not found\" or permission error: GoogleDocs_GenerateGoogleFilePickerUrl\n2. Instruct user to complete the file selection/authorization and then retry the prior operation.\n\nWorkflow G \u2014 Bulk search and fetch multiple docs\n1. GoogleDocs_SearchDocuments (document_contains with array of keywords, limit)\n2. For each document of interest, call GoogleDocs_SearchAndRetrieveDocuments (or GoogleDocs_GetDocumentAsDocmd if detailed)\n3. Consolidate results and summarize\n\n# Error handling and retry patterns\n- If a tool returns a \"not found\" or 403 permission error: call GoogleDocs_GenerateGoogleFilePickerUrl, instruct the user to authorize/pick files, and retry.\n- If a tool returns a transient error (e.g., HTTP 500): retry the same tool once, then escalate (inform user).\n- If GoogleDocs_EditDocument fails because the requested change is ambiguous, fetch full doc with GoogleDocs_GetDocumentAsDocmd and reformat the edit_requests to be explicit.\n\n# Examples (call templates)\nSearch for docs by keyword:\n```\nAction: GoogleDocs_SearchDocuments\n{\n  \"document_contains\": [\"project plan\", \"Q2\"],\n  \"limit\": 5\n}\n```\n\nFetch full doc in DocMD format:\n```\nAction: GoogleDocs_GetDocumentAsDocmd\n{\n  \"document_id\": \"DOC_ID_HERE\"\n}\n```\n\nEdit a document with 2 changes (stateless, include context):\n```\nAction: GoogleDocs_EditDocument\n{\n  \"document_id\": \"DOC_ID_HERE\",\n  \"edit_requests\": [\n    \"Replace the first paragraph that starts with \u0027Overview:\u0027 with this updated overview: \u0027\u003cnew overview text\u003e\u0027\",\n    \"Remove the bullet that reads \u0027alpha testing\u0027 and add a new bullet \u0027beta testing\u0027 under \u0027Milestones\u0027 section.\"\n  ],\n  \"reasoning_effort\": \"high\"\n}\n```\n\nCreate a document with content:\n```\nAction: GoogleDocs_CreateDocumentFromText\n{\n  \"title\": \"Q2 Roadmap Summary\",\n  \"text_content\": \"Summary:\\n- Key objectives...\\n- Timeline...\"\n}\n```\n\nGenerate a file picker URL after permission error:\n```\nAction: GoogleDocs_GenerateGoogleFilePickerUrl\n{}\n```\n\n# Best practices \u0026 constraints summary\n- Always fetch document content before making edits that depend on existing text.\n- Use SearchDocuments first to find candidate docs, then a content retrieval tool to read them.\n- Use GoogleDocs_GetDocumentAsDocmd for authoritative content (preserve structure and tabs).\n- Use GoogleDocs_SearchAndRetrieveDocuments when you want a quick Markdown preview and metadata.\n- Use GoogleDocs_InsertTextAtEndOfDocument for appending only.\n- Use GoogleDocs_EditDocument for replacements, deletions, or multi-part edits\u2014make edit_requests explicit.\n- When in doubt about permissions or missing files, get the user to run the file-picker flow (GoogleDocs_GenerateGoogleFilePickerUrl).\n- Keep edits idempotent where possible.\n\nUse this prompt to initialize the ReAct agent. It should now follow the ReAct pattern and call the provided Google Docs tools in the sequences described above to complete user requests.";
// This determines which LLM will be used inside the agent
const agentModel = process.env.OPENAI_MODEL;
if (!agentModel) {
  throw new Error("Missing OPENAI_MODEL. Add it to your .env file.");
}
// This allows LangChain to retain the context of the session
const threadID = "1";
````

Set the following environment variables in a `.env` file:

````bash
ARCADE_API_KEY=your-arcade-api-key
ARCADE_USER_ID=your-arcade-user-id
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-5-mini
````

## Implementing the `tools.ts` module

The `tools.ts` module fetches Arcade tool definitions and converts them to LangChain-compatible tools using Arcade's Zod schema conversion:

### Create the file and import the dependencies

Create a `tools.ts` file, and add import the following. These will allow you to build the helper functions needed to convert Arcade tool definitions into a format that LangChain can execute. Here, you also define which tools will require human-in-the-loop confirmation. This is very useful for tools that may have dangerous or undesired side-effects if the LLM hallucinates the values in the parameters. You will implement the helper functions to require human approval in this module.

````typescript
import { Arcade } from "@arcadeai/arcadejs";
import {
  type ToolExecuteFunctionFactoryInput,
  type ZodTool,
  executeZodTool,
  isAuthorizationRequiredError,
  toZod,
} from "@arcadeai/arcadejs/lib/index";
import { type ToolExecuteFunction } from "@arcadeai/arcadejs/lib/zod/types";
import { tool } from "langchain";
import {
  interrupt,
} from "@langchain/langgraph";
import readline from "node:readline/promises";

// This determines which tools require human in the loop approval to run
const TOOLS_WITH_APPROVAL = ['GoogleDocs_CommentOnDocument', 'GoogleDocs_CreateBlankDocument', 'GoogleDocs_CreateDocumentFromText', 'GoogleDocs_EditDocument', 'GoogleDocs_InsertTextAtEndOfDocument'];
````

### Create a confirmation helper for human in the loop

The first helper that you will write is the `confirm` function, which asks a yes or no question to the user, and returns `true` if theuser replied with `"yes"` and `false` otherwise.

````typescript
// Prompt user for yes/no confirmation
export async function confirm(question: string, rl?: readline.Interface): Promise<boolean> {
  let shouldClose = false;
  let interface_ = rl;

  if (!interface_) {
      interface_ = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
      });
      shouldClose = true;
  }

  const answer = await interface_.question(`${question} (y/n): `);

  if (shouldClose) {
      interface_.close();
  }

  return ["y", "yes"].includes(answer.trim().toLowerCase());
}
````

Tools that require authorization trigger a LangGraph interrupt, which pauses execution until the user completes authorization in their browser.

### Create the execution helper

This is a wrapper around the `executeZodTool` function. Before you execute the tool, however, there are two logical checks to be made:

1. First, if the tool the agent wants to invoke is included in the `TOOLS_WITH_APPROVAL` variable, human-in-the-loop is enforced by calling `interrupt` and passing the necessary data to call the `confirm` helper. LangChain will surface that `interrupt` to the agentic loop, and you will be required to "resolve" the interrupt later on. For now, you can assume that the reponse of the `interrupt` will have enough information to decide whether to execute the tool or not, depending on the human's reponse.
2. Second, if the tool was approved by the human, but it doesn't have the authorization of the integration to run, then you need to present an URL to the user so they can authorize the OAuth flow for this operation. For this, an execution is attempted, that may fail to run if the user is not authorized. When it fails, you interrupt the flow and send the authorization request for the harness to handle. If the user authorizes the tool, the harness will reply with an `{authorized: true}` object, and the system will retry the tool call without interrupting the flow.

````typescript
export function executeOrInterruptTool({
  zodToolSchema,
  toolDefinition,
  client,
  userId,
}: ToolExecuteFunctionFactoryInput): ToolExecuteFunction<any> {
  const { name: toolName } = zodToolSchema;

  return async (input: unknown) => {
    try {

      // If the tool is on the list that enforces human in the loop, we interrupt the flow and ask the user to authorize the tool

      if (TOOLS_WITH_APPROVAL.includes(toolName)) {
        const hitl_response = interrupt({
          authorization_required: false,
          hitl_required: true,
          tool_name: toolName,
          input: input,
        });

        if (!hitl_response.authorized) {
          // If the user didn't approve the tool call, we throw an error, which will be handled by LangChain
          throw new Error(
            `Human in the loop required for tool call ${toolName}, but user didn't approve.`
          );
        }
      }

      // Try to execute the tool
      const result = await executeZodTool({
        zodToolSchema,
        toolDefinition,
        client,
        userId,
      })(input);
      return result;
    } catch (error) {
      // If the tool requires authorization, we interrupt the flow and ask the user to authorize the tool
      if (error instanceof Error && isAuthorizationRequiredError(error)) {
        const response = await client.tools.authorize({
          tool_name: toolName,
          user_id: userId,
        });

        // We interrupt the flow here, and pass everything the handler needs to get the user's authorization
        const interrupt_response = interrupt({
          authorization_required: true,
          authorization_response: response,
          tool_name: toolName,
          url: response.url ?? "",
        });

        // If the user authorized the tool, we retry the tool call without interrupting the flow
        if (interrupt_response.authorized) {
          const result = await executeZodTool({
            zodToolSchema,
            toolDefinition,
            client,
            userId,
          })(input);
          return result;
        } else {
          // If the user didn't authorize the tool, we throw an error, which will be handled by LangChain
          throw new Error(
            `Authorization required for tool call ${toolName}, but user didn't authorize.`
          );
        }
      }
      throw error;
    }
  };
}
````

### Create the tool retrieval helper

The last helper function of this module is the `getTools` helper. This function will take the configurations you defined in the `main.ts` file, and retrieve all of the configured tool definitions from Arcade. Those definitions will then be converted to LangGraph `Function` tools, and will be returned in a format that LangChain can present to the LLM so it can use the tools and pass the arguments correctly. You will pass the `executeOrInterruptTool` helper you wrote in the previous section so all the bindings to the human-in-the-loop and auth handling are programmed when LancChain invokes a tool.


````typescript
// Initialize the Arcade client
export const arcade = new Arcade();

export type GetToolsProps = {
  arcade: Arcade;
  toolkits?: string[];
  tools?: string[];
  userId: string;
  limit?: number;
}


export async function getTools({
  arcade,
  toolkits = [],
  tools = [],
  userId,
  limit = 100,
}: GetToolsProps) {

  if (toolkits.length === 0 && tools.length === 0) {
      throw new Error("At least one tool or toolkit must be provided");
  }

  // Todo(Mateo): Add pagination support
  const from_toolkits = await Promise.all(toolkits.map(async (tkitName) => {
      const definitions = await arcade.tools.list({
          toolkit: tkitName,
          limit: limit
      });
      return definitions.items;
  }));

  const from_tools = await Promise.all(tools.map(async (toolName) => {
      return await arcade.tools.get(toolName);
  }));

  const all_tools = [...from_toolkits.flat(), ...from_tools];
  const unique_tools = Array.from(
      new Map(all_tools.map(tool => [tool.qualified_name, tool])).values()
  );

  const arcadeTools = toZod({
    tools: unique_tools,
    client: arcade,
    executeFactory: executeOrInterruptTool,
    userId: userId,
  });

  // Convert Arcade tools to LangGraph tools
  const langchainTools = arcadeTools.map(({ name, description, execute, parameters }) =>
    (tool as Function)(execute, {
      name,
      description,
      schema: parameters,
    })
  );

  return langchainTools;
}
````

## Building the Agent

Back on the `main.ts` file, you can now call the helper functions you wrote to build the agent.

### Retrieve the configured tools

Use the `getTools` helper you wrote to retrieve the tools from Arcade in LangChain format:

````typescript
const tools = await getTools({
  arcade,
  toolkits: toolkits,
  tools: isolatedTools,
  userId: arcadeUserID,
  limit: toolLimit,
});
````

### Write an interrupt handler

When LangChain is interrupted, it will emit an event in the stream that you will need to handle and resolve based on the user's behavior. For a human-in-the-loop interrupt, you will call the `confirm` helper you wrote earlier, and indicate to the harness whether the human approved the specific tool call or not. For an auth interrupt, you will present the OAuth URL to the user, and wait for them to finishe the OAuth dance before resolving the interrupt with `{authorized: true}` or `{authorized: false}` if an error occurred:

````typescript
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
````

### Create an Agent instance

Here you create the agent using the `createAgent` function. You pass the system prompt, the model, the tools, and the checkpointer. When the agent runs, it will automatically use the helper function you wrote earlier to handle tool calls and authorization requests.

````typescript
const agent = createAgent({
  systemPrompt: systemPrompt,
  model: agentModel,
  tools: tools,
  checkpointer: new MemorySaver(),
});
````

### Write the invoke helper

This last helper function handles the streaming of the agent’s response, and captures the interrupts. When the system detects an interrupt, it adds the interrupt to the `interrupts` array, and the flow interrupts. If there are no interrupts, it will just stream the agent’s to your console.

````typescript
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
````

### Write the main function

Finally, write the main function that will call the agent and handle the user input.

Here the `config` object configures the `thread_id`, which tells the agent to store the state of the conversation into that specific thread. Like any typical agent loop, you:

1. Capture the user input
2. Stream the agent's response
3. Handle any authorization interrupts
4. Resume the agent after authorization
5. Handle any errors
6. Exit the loop if the user wants to quit

````typescript
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
````

## Running the Agent

### Run the agent

```bash
bun run main.ts
```

You should see the agent responding to your prompts like any model, as well as handling any tool calls and authorization requests.

## Next Steps

- Clone the [repository](https://github.com/arcade-agents/ts-langchain-GoogleDocs) and run it
- Add more toolkits to the `toolkits` array to expand capabilities
- Customize the `systemPrompt` to specialize the agent's behavior
- Explore the [Arcade documentation](https://docs.arcade.dev) for available toolkits

