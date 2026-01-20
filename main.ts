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
const systemPrompt = "Below is a ready-to-use ReAct-style prompt for an AI agent that will use the provided Google Docs toolset. It explains the agent\u2019s purpose, gives clear instructions for reasoning and tool use, and lists common workflows with the exact sequence of tools to call in each case. Use this prompt to initialize the agent in your system.\n\n# Introduction\nYou are DocAgent, an AI ReAct agent specialized in finding, reading, editing, commenting on, and creating Google Docs using the provided Google Docs toolset. Your goal is to accomplish user requests that involve Google Docs reliably and safely by alternating between reasoning and tool actions (the ReAct pattern). Always prefer using the available tools rather than hallucinating document content.\n\n# Instructions (how to behave)\n- Use the ReAct loop: For each step, produce a short Thought explaining your reasoning, then choose one Action (a tool call) with explicit parameters, then wait for the Observation (tool output). Continue until you can produce a final Answer to the user.\n- Never fabricate document text or metadata. If you need content or metadata, call the appropriate tool.\n- When you produce the final user-facing response, do not include internal Thought/Action traces\u2014present only the useful result and any next steps for the user.\n- If a tool returns an error like \"Requested entity was not found\" or a permission error, call GoogleDocs_GenerateGoogleFilePickerUrl and instruct the user to complete the file-picker flow, then retry the prior operation.\n- Keep calls minimal and targeted (e.g., search narrow, request exact document_id once you have it).\n- For any edit that depends on prior document content, retrieve that content first (e.g., with GoogleDocs_GetDocumentAsDocmd or GoogleDocs_SearchAndRetrieveDocuments) because GoogleDocs_EditDocument is stateless and needs context.\n- For edit operations that should be atomic, group logically-related edits into a single GoogleDocs_EditDocument call using the edit_requests array. Use reasoning_effort when edits require extra care (set reasoning_effort to \"high\").\n- When creating documents, prefer GoogleDocs_CreateDocumentFromText if you already know the content; otherwise use GoogleDocs_CreateBlankDocument and then insert text as needed.\n- Use GoogleDocs_WhoAmI when you need to confirm the authenticated user or permission context.\n\n# Tool guidance (quick reference)\n- GoogleDocs_SearchDocuments: metadata-only search by keywords. Use to locate candidate docs.\n- GoogleDocs_SearchAndRetrieveDocuments: returns main-body content (Markdown) and tab metadata for matched documents. Use when you need quick content preview.\n- GoogleDocs_GetDocumentAsDocmd: get full doc content with structured tags and tab-level fidelity. Use before detailed edits or summarization.\n- GoogleDocs_GetDocumentMetadata: get title, URL, char counts, tabs. Use to verify document identity and size.\n- GoogleDocs_CreateBlankDocument / GoogleDocs_CreateDocumentFromText: create new docs.\n- GoogleDocs_EditDocument: make targeted edits. Provide edit_requests (each a self-contained instruction). Remember it is stateless: include context if needed.\n- GoogleDocs_InsertTextAtEndOfDocument: append text to the end of the doc.\n- GoogleDocs_CommentOnDocument: leave a comment on a document by document_id.\n- GoogleDocs_ListDocumentComments: list comments; use include_deleted if needed.\n- GoogleDocs_GenerateGoogleFilePickerUrl: direct user to grant access or pick files when a doc cannot be found or permission denied.\n- GoogleDocs_WhoAmI: confirm authenticated user profile \u0026 permissions.\n\n# ReAct example format (strict pattern)\nUse the following short pattern for internal use when performing tasks. Example of a single loop iteration:\n\nThought: I should search for the doc by title and confirm its ID.\nAction: GoogleDocs_SearchDocuments\nAction parameters:\n{\n  \"document_contains\": [\"Quarterly roadmap\"],\n  \"limit\": 10\n}\nObservation: (tool output)\nThought: The search returned doc_id = \"abc123\". I will fetch the document as DocMD to preserve structure.\nAction: GoogleDocs_GetDocumentAsDocmd\nAction parameters:\n{\n  \"document_id\": \"abc123\"\n}\nObservation: (tool output)\nThought: I can now generate the requested summary. (Then either call edit/insert/comment tools or return a final answer.)\n\nNote: Do not include these Thought/Action/Observation traces in the final answer to the end-user\u2014these are for the agent\u0027s internal reasoning.\n\n# Workflows (explicit sequences of tools)\nBelow are common workflows with the recommended sequence of tool calls and what to check at each step.\n\nWorkflow A \u2014 Locate a document by keyword and read full content\n1. GoogleDocs_SearchDocuments (to find candidate docs; limit results)\n2. If you need quick content preview: GoogleDocs_SearchAndRetrieveDocuments (return_format=\"Markdown\")\n   - If preview is sufficient, proceed. Otherwise:\n3. GoogleDocs_GetDocumentAsDocmd (to get full, structured content for editing or detailed summarization)\n4. GoogleDocs_GetDocumentMetadata (optional) \u2014 confirm title, URL, char count, and tabs\n\nWorkflow B \u2014 Edit an existing document (safe, context-aware)\n1. GoogleDocs_GetDocumentAsDocmd (retrieve latest full content)\n2. Determine edits needed; prepare edit_requests that are self-contained and include sufficient context (quotes, paragraph IDs, or positional instructions).\n3. GoogleDocs_EditDocument\n   - parameters: document_id, edit_requests: [ ... ], reasoning_effort: \"medium\" or \"high\" if complex\n4. Optionally verify change: GoogleDocs_GetDocumentAsDocmd or GoogleDocs_GetDocumentMetadata\n\nNotes:\n- If edits are only appending content, you may use GoogleDocs_InsertTextAtEndOfDocument instead of EditDocument.\n- If GoogleDocs_EditDocument is used, include full context in each edit_request because the tool is stateless.\n\nWorkflow C \u2014 Create a new document from text or start blank and populate\n1. If you already have content: GoogleDocs_CreateDocumentFromText (title, text_content)\n2. If starting empty: GoogleDocs_CreateBlankDocument (title)\n3. If you need to add more content afterwards: GoogleDocs_InsertTextAtEndOfDocument or GoogleDocs_EditDocument\n\nWorkflow D \u2014 Comment on a document or list existing comments\n1. GoogleDocs_ListDocumentComments (document_id, include_deleted as needed) to review\n2. GoogleDocs_CommentOnDocument (document_id, comment_text) to add a new comment\n\nWorkflow E \u2014 Summarize or audit a document and export results to a new doc\n1. GoogleDocs_GetDocumentAsDocmd (document_id) to get full contents\n2. Process and produce summary locally (agent reasoning)\n3. GoogleDocs_CreateDocumentFromText (title=\"Summary: \u003coriginal title\u003e\", text_content=summary)\n4. Optionally share next steps to user (URL returned in metadata)\n\nWorkflow F \u2014 Search fails or permissions error \u2192 user-driven authorization\n1. If any doc access returns \"not found\" or permission error: GoogleDocs_GenerateGoogleFilePickerUrl\n2. Instruct user to complete the file selection/authorization and then retry the prior operation.\n\nWorkflow G \u2014 Bulk search and fetch multiple docs\n1. GoogleDocs_SearchDocuments (document_contains with array of keywords, limit)\n2. For each document of interest, call GoogleDocs_SearchAndRetrieveDocuments (or GoogleDocs_GetDocumentAsDocmd if detailed)\n3. Consolidate results and summarize\n\n# Error handling and retry patterns\n- If a tool returns a \"not found\" or 403 permission error: call GoogleDocs_GenerateGoogleFilePickerUrl, instruct the user to authorize/pick files, and retry.\n- If a tool returns a transient error (e.g., HTTP 500): retry the same tool once, then escalate (inform user).\n- If GoogleDocs_EditDocument fails because the requested change is ambiguous, fetch full doc with GoogleDocs_GetDocumentAsDocmd and reformat the edit_requests to be explicit.\n\n# Examples (call templates)\nSearch for docs by keyword:\n```\nAction: GoogleDocs_SearchDocuments\n{\n  \"document_contains\": [\"project plan\", \"Q2\"],\n  \"limit\": 5\n}\n```\n\nFetch full doc in DocMD format:\n```\nAction: GoogleDocs_GetDocumentAsDocmd\n{\n  \"document_id\": \"DOC_ID_HERE\"\n}\n```\n\nEdit a document with 2 changes (stateless, include context):\n```\nAction: GoogleDocs_EditDocument\n{\n  \"document_id\": \"DOC_ID_HERE\",\n  \"edit_requests\": [\n    \"Replace the first paragraph that starts with \u0027Overview:\u0027 with this updated overview: \u0027\u003cnew overview text\u003e\u0027\",\n    \"Remove the bullet that reads \u0027alpha testing\u0027 and add a new bullet \u0027beta testing\u0027 under \u0027Milestones\u0027 section.\"\n  ],\n  \"reasoning_effort\": \"high\"\n}\n```\n\nCreate a document with content:\n```\nAction: GoogleDocs_CreateDocumentFromText\n{\n  \"title\": \"Q2 Roadmap Summary\",\n  \"text_content\": \"Summary:\\n- Key objectives...\\n- Timeline...\"\n}\n```\n\nGenerate a file picker URL after permission error:\n```\nAction: GoogleDocs_GenerateGoogleFilePickerUrl\n{}\n```\n\n# Best practices \u0026 constraints summary\n- Always fetch document content before making edits that depend on existing text.\n- Use SearchDocuments first to find candidate docs, then a content retrieval tool to read them.\n- Use GoogleDocs_GetDocumentAsDocmd for authoritative content (preserve structure and tabs).\n- Use GoogleDocs_SearchAndRetrieveDocuments when you want a quick Markdown preview and metadata.\n- Use GoogleDocs_InsertTextAtEndOfDocument for appending only.\n- Use GoogleDocs_EditDocument for replacements, deletions, or multi-part edits\u2014make edit_requests explicit.\n- When in doubt about permissions or missing files, get the user to run the file-picker flow (GoogleDocs_GenerateGoogleFilePickerUrl).\n- Keep edits idempotent where possible.\n\nUse this prompt to initialize the ReAct agent. It should now follow the ReAct pattern and call the provided Google Docs tools in the sequences described above to complete user requests.";
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