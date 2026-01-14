# An agent that uses GoogleDocs tools provided to perform any task

## Purpose

# AI Agent for Google Docs Management

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

By following these workflows, the agent effectively manages interactions with Google Docs, ensuring a smooth experience for the user.

## MCP Servers

The agent uses tools from these Arcade MCP Servers:

- GoogleDocs

## Human-in-the-Loop Confirmation

The following tools require human confirmation before execution:

- `GoogleDocs_CommentOnDocument`
- `GoogleDocs_EditDocument`
- `GoogleDocs_InsertTextAtEndOfDocument`


## Getting Started

1. Install dependencies:
    ```bash
    bun install
    ```

2. Set your environment variables:

    Copy the `.env.example` file to create a new `.env` file, and fill in the environment variables.
    ```bash
    cp .env.example .env
    ```

3. Run the agent:
    ```bash
    bun run main.ts
    ```