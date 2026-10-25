from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.error_body import ErrorBody
from ...models.google_export import GoogleExport
from ...models.google_export_request import GoogleExportRequest
from ...types import Response


def _get_kwargs(
    *,
    body: GoogleExportRequest,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}

    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/api/grocery/export/google-tasks",
    }

    _kwargs["json"] = body.to_dict()

    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> ErrorBody | GoogleExport | None:
    if response.status_code == 200:
        response_200 = GoogleExport.from_dict(response.json())

        return response_200

    if response.status_code == 400:
        response_400 = ErrorBody.from_dict(response.json())

        return response_400

    if response.status_code == 401:
        response_401 = ErrorBody.from_dict(response.json())

        return response_401

    if response.status_code == 409:
        response_409 = ErrorBody.from_dict(response.json())

        return response_409

    if response.status_code == 413:
        response_413 = ErrorBody.from_dict(response.json())

        return response_413

    if response.status_code == 422:
        response_422 = ErrorBody.from_dict(response.json())

        return response_422

    if response.status_code == 500:
        response_500 = ErrorBody.from_dict(response.json())

        return response_500

    if response.status_code == 502:
        response_502 = ErrorBody.from_dict(response.json())

        return response_502

    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> Response[ErrorBody | GoogleExport]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: AuthenticatedClient,
    body: GoogleExportRequest,
) -> Response[ErrorBody | GoogleExport]:
    """Sends the unticked items to the member's Google Tasks list `Groceries`: one parent task per store
    section, the
    items as subtasks. The list is emptied first, so sending again never duplicates. One send per member
    at a time.

    Args:
        body (GoogleExportRequest):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorBody | GoogleExport]
    """

    kwargs = _get_kwargs(
        body=body,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: AuthenticatedClient,
    body: GoogleExportRequest,
) -> ErrorBody | GoogleExport | None:
    """Sends the unticked items to the member's Google Tasks list `Groceries`: one parent task per store
    section, the
    items as subtasks. The list is emptied first, so sending again never duplicates. One send per member
    at a time.

    Args:
        body (GoogleExportRequest):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorBody | GoogleExport
    """

    return sync_detailed(
        client=client,
        body=body,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient,
    body: GoogleExportRequest,
) -> Response[ErrorBody | GoogleExport]:
    """Sends the unticked items to the member's Google Tasks list `Groceries`: one parent task per store
    section, the
    items as subtasks. The list is emptied first, so sending again never duplicates. One send per member
    at a time.

    Args:
        body (GoogleExportRequest):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorBody | GoogleExport]
    """

    kwargs = _get_kwargs(
        body=body,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient,
    body: GoogleExportRequest,
) -> ErrorBody | GoogleExport | None:
    """Sends the unticked items to the member's Google Tasks list `Groceries`: one parent task per store
    section, the
    items as subtasks. The list is emptied first, so sending again never duplicates. One send per member
    at a time.

    Args:
        body (GoogleExportRequest):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorBody | GoogleExport
    """

    return (
        await asyncio_detailed(
            client=client,
            body=body,
        )
    ).parsed
