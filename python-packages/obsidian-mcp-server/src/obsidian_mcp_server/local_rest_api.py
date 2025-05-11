import ssl
from typing import Any, Literal, cast
from urllib.parse import urljoin

import httpx
from pydantic import BaseModel, RootModel, model_validator


class Stat(BaseModel):
    ctime: int
    mtime: int
    size: int


class NoteJson(BaseModel):
    content: str
    frontmatter: dict[str, Any]
    path: str
    stat: Stat
    tags: list[str]


class ListFilesResponse(BaseModel):
    files: list[str]


class EmptyResponse(BaseModel):
    pass


class ReadFileResponse(RootModel[str]):
    pass


class ReadNoteJsonResponse(RootModel[NoteJson]):
    pass


class Result[T: BaseModel](BaseModel):
    success: bool
    url: str | None = None
    status_code: int | None
    data: T | None
    message: str | None = None
    error: str | None = None

    @model_validator(mode="after")
    def _validate(self):
        if self.success:
            assert self.url is not None, "URL must be provided when success is True"
            assert self.status_code is not None, "Status code must be provided when success is True"
        return self


class RequestResponse(BaseModel):
    status: int
    headers: dict[str, str]
    url: str
    method: str
    text: str


class Client:
    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url
        self.api_key = api_key

        ssl_context = ssl.create_default_context()
        ssl_context.check_hostname = False  # disable hostname verification
        ssl_context.verify_mode = ssl.CERT_NONE  # disable certificate verification

        self._headers = {
            "Authorization": f"Bearer {self.api_key}",
        }

    async def _request(self, method: str, path: str, **kwargs):
        url = urljoin(self.base_url, path)

        if "json_body" in kwargs:
            kwargs["json"] = kwargs.pop("json_body")
        elif "text_body" in kwargs:
            kwargs["data"] = kwargs.pop("text_body")

        async with httpx.AsyncClient(verify=False, headers=self._headers) as client:
            response = await client.request(method, url, **kwargs)
            request_response = RequestResponse(
                status=response.status_code,
                headers=dict(response.headers),
                url=url,
                method=method,
                text=response.text,
            )

        return request_response

    async def list_files(self, path_to_directory: str | None = None) -> Result[ListFilesResponse]:
        if path_to_directory is None:
            endpoint = "/vault/"
        else:
            endpoint = f"/vault/{path_to_directory}/"

        _Result = Result[ListFilesResponse]
        try:
            response = await self._request("GET", endpoint)
            if 200 <= response.status < 300:
                return _Result(
                    success=True,
                    url=response.url,
                    status_code=response.status,
                    data=ListFilesResponse.model_validate_json(response.text),
                )
            else:
                return _Result(
                    success=False,
                    url=response.url,
                    status_code=response.status,
                    data=None,
                    message=response.text,
                )

        except Exception as e:
            return _Result(success=False, status_code=None, data=None, error=str(e))

    async def read_file_as_json(self, filename: str) -> Result[ReadFileResponse]:
        result = await self._read_file(filename, accept_json=True)
        result = cast(Result[ReadFileResponse], result)
        return result

    async def read_file_as_text(
        self,
        filename: str,
    ) -> Result[ReadFileResponse]:
        result = await self._read_file(filename, accept_json=False)
        result = cast(Result[ReadFileResponse], result)
        return result

    async def _read_file(self, filename: str, accept_json: bool = False):
        """
        Returns the content of the file.
        If accept_json is True, requests JSON representation (includes frontmatter, tags, etc.).
        Otherwise, requests raw markdown content.
        """
        if not filename:
            raise ValueError("Filename cannot be empty.")
        endpoint = f"/vault/{filename.lstrip('/')}"
        headers = {}

        _Result = Result[ReadFileResponse | ReadNoteJsonResponse]
        try:
            if accept_json:
                headers["Accept"] = "application/vnd.olrapi.note+json"
                response = await self._request("GET", endpoint, headers=headers)
                _Response = ReadNoteJsonResponse
            else:
                headers["Accept"] = "text/markdown"
                response = await self._request("GET", endpoint, headers=headers)
                _Response = ReadFileResponse

            if response.status == 200:
                success = True
                if _Response == ReadFileResponse:
                    data = _Response.model_validate(response.text)
                else:
                    data = _Response.model_validate_json(response.text)
                message = None
            else:
                success = False
                data = None
                message = response.text
            return _Result(
                success=success,
                url=response.url,
                status_code=response.status,
                data=data,
                message=message,
            )

        except Exception as e:
            return _Result(success=False, status_code=None, data=None, error=str(e))

    async def create_or_update_file(
        self,
        filename: str,
        content: str,
        content_type: Literal["text/markdown", "*/*"] = "text/markdown",
    ):
        if not filename:
            raise ValueError("Filename cannot be empty.")
        endpoint = f"/vault/{filename.lstrip('/')}"
        headers = {"Content-Type": content_type}

        _Result = Result[EmptyResponse]
        try:
            response = await self._request("PUT", endpoint, headers=headers, text_body=content)
            if response.status == 204:
                success = True
                data = EmptyResponse()
                message = None
            else:
                success = False
                data = None
                message = response.text
            return _Result(
                success=success,
                url=response.url,
                status_code=response.status,
                data=data,
                message=message,
            )

        except Exception as e:
            return _Result(success=False, status_code=None, data=None, error=str(e))

    async def append_to_file(self, filename: str, content: str):
        if not filename:
            raise ValueError("Filename cannot be empty.")
        endpoint = f"/vault/{filename.lstrip('/')}"
        headers = {"Content-Type": "text/markdown"}

        _Result = Result[EmptyResponse]
        try:
            response = await self._request("POST", endpoint, headers=headers, text_body=content)
            if response.status == 204:
                success = True
                data = EmptyResponse()
                message = None
            else:
                success = False
                data = None
                message = response.text
            return _Result(
                success=success,
                url=response.url,
                status_code=response.status,
                data=data,
                message=message,
            )
        except Exception as e:
            return _Result(success=False, status_code=None, data=None, error=str(e))

    async def delete_file(self, filename: str):
        _Result = Result[EmptyResponse]

        try:
            response = await self._request("DELETE", f"/vault/{filename}")
            if response.status == 204:
                success = True
                data = EmptyResponse()
                message = None
            else:
                success = False
                data = None
                message = response.text
            return _Result(
                success=success,
                url=response.url,
                status_code=response.status,
                data=data,
                message=message,
            )
        except Exception as e:
            return _Result(success=False, status_code=None, data=None, error=str(e))
