from agents import (Agent, Runner, AgentHooks, Tool, RunContextWrapper,
                    TResponseInputItem,)
from functools import partial
from arcadepy import AsyncArcade
from agents_arcade import get_arcade_tools
from typing import Any
from human_in_the_loop import (UserDeniedToolCall,
                               confirm_tool_usage,
                               auth_tool)

import globals


class CustomAgentHooks(AgentHooks):
    def __init__(self, display_name: str):
        self.event_counter = 0
        self.display_name = display_name

    async def on_start(self,
                       context: RunContextWrapper,
                       agent: Agent) -> None:
        self.event_counter += 1
        print(f"### ({self.display_name}) {
              self.event_counter}: Agent {agent.name} started")

    async def on_end(self,
                     context: RunContextWrapper,
                     agent: Agent,
                     output: Any) -> None:
        self.event_counter += 1
        print(
            f"### ({self.display_name}) {self.event_counter}: Agent {
                # agent.name} ended with output {output}"
                agent.name} ended"
        )

    async def on_handoff(self,
                         context: RunContextWrapper,
                         agent: Agent,
                         source: Agent) -> None:
        self.event_counter += 1
        print(
            f"### ({self.display_name}) {self.event_counter}: Agent {
                source.name} handed off to {agent.name}"
        )

    async def on_tool_start(self,
                            context: RunContextWrapper,
                            agent: Agent,
                            tool: Tool) -> None:
        self.event_counter += 1
        print(
            f"### ({self.display_name}) {self.event_counter}:"
            f" Agent {agent.name} started tool {tool.name}"
            f" with context: {context.context}"
        )

    async def on_tool_end(self,
                          context: RunContextWrapper,
                          agent: Agent,
                          tool: Tool,
                          result: str) -> None:
        self.event_counter += 1
        print(
            f"### ({self.display_name}) {self.event_counter}: Agent {
                # agent.name} ended tool {tool.name} with result {result}"
                agent.name} ended tool {tool.name}"
        )


async def main():

    context = {
        "user_id": os.getenv("ARCADE_USER_ID"),
    }

    client = AsyncArcade()

    arcade_tools = await get_arcade_tools(
        client, toolkits=["GoogleDocs"]
    )

    for tool in arcade_tools:
        # - human in the loop
        if tool.name in ENFORCE_HUMAN_CONFIRMATION:
            tool.on_invoke_tool = partial(
                confirm_tool_usage,
                tool_name=tool.name,
                callback=tool.on_invoke_tool,
            )
        # - auth
        await auth_tool(client, tool.name, user_id=context["user_id"])

    agent = Agent(
        name="",
        instructions="# AI Agent for Google Docs Management

## Introduction
Welcome to the AI agent designed for efficient management of Google Docs. This agent utilizes various tools to create, edit, comment on, and search for documents within your Google Drive. Its purpose is to streamline your document management tasks, making collaboration and information retrieval easier and more intuitive.

## Instructions
1. The agent will initiate actions based on user prompts related to Google Docs.
2. It will utilize the available tools in a logical sequence to fulfill user requests.
3. The agent will provide feedback on actions taken, including confirmation of document creation, editing, or commenting.
4. When searching for documents, the agent will return relevant outputs based on specified criteria.

## Workflows

### 1. Document Creation
- **Tools Used**:
  - GoogleDocs_CreateBlankDocument
  - GoogleDocs_CreateDocumentFromText
- **Sequence**:
  1. If the user requests a blank document, the agent will use `GoogleDocs_CreateBlankDocument` with the provided title.
  2. If the user provides text content for a new document, the agent will use `GoogleDocs_CreateDocumentFromText`.

### 2. Document Editing
- **Tools Used**:
  - GoogleDocs_EditDocument
  - GoogleDocs_InsertTextAtEndOfDocument
- **Sequence**:
  1. The agent will accept specific edit requests from the user.
  2. It will then execute `GoogleDocs_EditDocument` to apply the changes based on the edit requests.
  3. If the user wants to add text to the end of a document, it will use `GoogleDocs_InsertTextAtEndOfDocument`.

### 3. Document Commenting
- **Tools Used**:
  - GoogleDocs_CommentOnDocument
  - GoogleDocs_ListDocumentComments
- **Sequence**:
  1. To add comments, the agent will use `GoogleDocs_CommentOnDocument` with the document ID and comment text from the user.
  2. If requested, the agent can use `GoogleDocs_ListDocumentComments` to retrieve and display all comments on a specified document.

### 4. Document Search
- **Tools Used**:
  - GoogleDocs_SearchDocuments
  - GoogleDocs_SearchAndRetrieveDocuments
- **Sequence**:
  1. The agent will process search queries using `GoogleDocs_SearchDocuments` to find metadata for documents based on defined keywords.
  2. If the user wants to retrieve content along with metadata, it will then utilize `GoogleDocs_SearchAndRetrieveDocuments`.

### 5. Document Metadata Retrieval
- **Tools Used**:
  - GoogleDocs_GetDocumentMetadata
  - GoogleDocs_GetDocumentAsDocmd
- **Sequence**:
  1. Upon request, the agent will use `GoogleDocs_GetDocumentMetadata` to gather information about a specific document.
  2. If detailed content is needed, it will follow up with `GoogleDocs_GetDocumentAsDocmd`.

### 6. User Information Retrieval
- **Tools Used**:
  - GoogleDocs_WhoAmI
- **Sequence**:
  1. To provide user details, the agent will invoke `GoogleDocs_WhoAmI` to retrieve profile and access information.

By following these workflows, the agent effectively manages interactions with Google Docs, ensuring a smooth experience for the user.",
        model=os.environ["OPENAI_MODEL"],
        tools=arcade_tools,
        hooks=CustomAgentHooks(display_name="")
    )

    # initialize the conversation
    history: list[TResponseInputItem] = []
    # run the loop!
    while True:
        prompt = input("You: ")
        if prompt.lower() == "exit":
            break
        history.append({"role": "user", "content": prompt})
        try:
            result = await Runner.run(
                starting_agent=agent,
                input=history,
                context=context
            )
            history = result.to_input_list()
            print(result.final_output)
        except UserDeniedToolCall as e:
            history.extend([
                {"role": "assistant",
                 "content": f"Please confirm the call to {e.tool_name}"},
                {"role": "user",
                 "content": "I changed my mind, please don't do it!"},
                {"role": "assistant",
                 "content": f"Sure, I cancelled the call to {e.tool_name}."
                 " What else can I do for you today?"
                 },
            ])
            print(history[-1]["content"])

if __name__ == "__main__":
    import asyncio

    asyncio.run(main())