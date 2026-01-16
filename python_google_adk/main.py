from arcadepy import AsyncArcade
from dotenv import load_dotenv
from google.adk import Agent, Runner
from google.adk.artifacts import InMemoryArtifactService
from google.adk.models.lite_llm import LiteLlm
from google.adk.sessions import InMemorySessionService, Session
from google_adk_arcade.tools import get_arcade_tools
from google.genai import types
from human_in_the_loop import auth_tool, confirm_tool_usage

import os

load_dotenv(override=True)


async def main():
    app_name = "my_agent"
    user_id = os.getenv("ARCADE_USER_ID")

    session_service = InMemorySessionService()
    artifact_service = InMemoryArtifactService()
    client = AsyncArcade()

    agent_tools = await get_arcade_tools(
        client, toolkits=["GoogleDocs"]
    )

    for tool in agent_tools:
        await auth_tool(client, tool_name=tool.name, user_id=user_id)

    agent = Agent(
        model=LiteLlm(model=f"openai/{os.environ["OPENAI_MODEL"]}"),
        name="google_agent",
        instruction="# AI Agent for Google Docs Management

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
        description="An agent that uses GoogleDocs tools provided to perform any task",
        tools=agent_tools,
        before_tool_callback=[confirm_tool_usage],
    )

    session = await session_service.create_session(
        app_name=app_name, user_id=user_id, state={
            "user_id": user_id,
        }
    )
    runner = Runner(
        app_name=app_name,
        agent=agent,
        artifact_service=artifact_service,
        session_service=session_service,
    )

    async def run_prompt(session: Session, new_message: str):
        content = types.Content(
            role='user', parts=[types.Part.from_text(text=new_message)]
        )
        async for event in runner.run_async(
            user_id=user_id,
            session_id=session.id,
            new_message=content,
        ):
            if event.content.parts and event.content.parts[0].text:
                print(f'** {event.author}: {event.content.parts[0].text}')

    while True:
        user_input = input("User: ")
        if user_input.lower() == "exit":
            print("Goodbye!")
            break
        await run_prompt(session, user_input)


if __name__ == '__main__':
    import asyncio
    asyncio.run(main())