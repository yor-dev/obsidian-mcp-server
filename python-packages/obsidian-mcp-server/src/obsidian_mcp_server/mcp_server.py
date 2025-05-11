import json
from typing import Annotated

from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, Field

from .local_rest_api import Client


class BaseObsidianTool:
    name: str
    description: str

    def __init__(self, client: Client):
        self.client = client

    def __init_subclass__(cls) -> None:
        if not hasattr(cls, "name") or not hasattr(cls, "description"):
            raise ValueError(f"Tool {cls.__name__} must have name and description attributes")

        if not hasattr(cls, "run"):
            raise ValueError(f"Tool {cls.__name__} must implement the run method")

    async def run(self, *args, **kwargs):
        raise NotImplementedError("Subclasses must implement the run method")


class ToolResult(BaseModel):
    success: bool
    data: str | None
    message: str | None = None


class ListFiles(BaseObsidianTool):
    name: str = "list_files"
    description = "List files in a directory"

    async def run(
        self,
        path_to_directory: Annotated[
            str | None,
            Field(description="Path to directory. If None, this method returns data in the root"),
        ] = None,
    ):
        result = await self.client.list_files(path_to_directory=path_to_directory)
        if result.success:
            assert result.data is not None
            return ToolResult(success=True, data=result.data.model_dump_json())
        else:
            return ToolResult(success=False, data=result.model_dump_json())


class ReadFile(BaseObsidianTool):
    name: str = "read_file"
    description = "Read a markdown file"

    async def run(
        self,
        filename: Annotated[str, Field(description="file path from root")],
    ):
        result = await self.client.read_file_as_text(filename=filename)
        if result.success:
            assert result.data is not None
            return ToolResult(success=True, data=result.data.root)
        else:
            return ToolResult(success=False, data=result.model_dump_json())


class WriteFile(BaseObsidianTool):
    name: str = "write_file"
    description = "Write a markdown file. If the file already exists, it will be overwritten."

    async def run(
        self,
        filename: Annotated[str, Field(description="file path from root")],
        content: Annotated[str, Field(description="Content of the file")],
    ):
        result = await self.client.create_or_update_file(filename=filename, content=content)
        if result.success:
            return ToolResult(success=True, data=None)
        else:
            return ToolResult(success=False, data=result.model_dump_json())


class ReplaceInFile(BaseObsidianTool):
    name: str = "replace_in_file"
    description = """"Replace the text that exactly matches old_text with new_text. old_text and new_text must contain at least one complete line of content.
Before using this tool, read the file using the read_file tool to check the content of the file.

## arguements:
- filename: file path from root
- old_text: String to be replaced
- new_text: String to replace with

## example:
original text:
```markdown
Dialy 1
Today is 2023-10-01. I was happy to meet my friend.

Daily 2
Today is 2023-10-02. I was running in the park.
```

old_text="Dialy 1\nToday is 2023-10-01. I was happy to meet my friend."
new_text="Dialy 1\nToday is 2023-10-01. I was happy to meet my friend and I checked my email."

result:
```markdown
Dialy 1
Today is 2023-10-01. I was happy to meet my friend and I checked my email.

Daily 2
Today is 2023-10-02. I was running in the park.
```

"""

    async def run(
        self,
        filename: Annotated[str, Field(description="file path from root")],
        old_text: Annotated[str, Field(description="String to be replaced")],
        new_text: Annotated[str, Field(description="String to replace with")],
    ):
        result = await self.client.read_file_as_text(filename=filename)
        if not result.success:
            return ToolResult(
                success=False, data=None, message="The file does not exist or failed to read."
            )
        else:
            assert result.data is not None
            content = result.data.root

        if old_text not in content:
            return ToolResult(
                success=False,
                data=None,
                message="The old text does not exist in the file.",
            )
        else:
            content = content.replace(old_text, new_text)

        result = await self.client.create_or_update_file(filename=filename, content=content)

        if not result.success:
            return ToolResult(
                success=False,
                data=None,
                message="Failed to write the file.",
            )
        else:
            return ToolResult(success=True, data=json.dumps({"updated_content": content}))


class AppendToFile(BaseObsidianTool):
    name: str = "append_to_file"
    description = "Append text to a markdown file. Before using this tool, read the file using the read_file tool to check the content of the file."

    async def run(
        self,
        filename: Annotated[str, Field(description="file path from root")],
        content: Annotated[str, Field(description="Content to append")],
    ):
        result = await self.client.append_to_file(filename=filename, content=content)

        if result.success:
            read_result = await self.client.read_file_as_text(filename=filename)
            if not read_result.success:
                return ToolResult(
                    success=False, data=None, message="Failed to read the file after appending."
                )
            else:
                assert read_result.data is not None
                return ToolResult(
                    success=True, data=json.dumps({"updated_content": read_result.data.root})
                )
        else:
            return ToolResult(success=False, data=result.model_dump_json())


class DeleteFile(BaseObsidianTool):
    name: str = "delete_file"
    description = "Delete a markdown file"

    def __init__(self, client: Client):
        self.client = client

    async def run(
        self,
        filename: Annotated[str, Field(description="file path from root")],
    ):
        result = await self.client.delete_file(filename=filename)
        if result.success:
            return ToolResult(success=True, data=None)
        else:
            return ToolResult(success=False, data=result.model_dump_json())


class ObsidianMCPServer:
    def __init__(self, obsidian_base_url: str, obsidian_api_key: str):
        self.client = Client(base_url=obsidian_base_url, api_key=obsidian_api_key)
        self.mcp = FastMCP("Obsidian MCP Server")

        self._register_tools(ListFiles(self.client))
        self._register_tools(ReadFile(self.client))
        self._register_tools(WriteFile(self.client))
        self._register_tools(ReplaceInFile(self.client))
        self._register_tools(AppendToFile(self.client))
        self._register_tools(DeleteFile(self.client))

    def run(self):
        return self.mcp.run()

    def _register_tools(self, tool: BaseObsidianTool):
        self.mcp.add_tool(tool.run, name=tool.name, description=tool.description)
