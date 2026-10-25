from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.error_body import ErrorBody
from ...models.import_export_form import ImportExportForm
from ...models.import_summary import ImportSummary
from ...types import Response


def _get_kwargs(
    *,
    body: ImportExportForm,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}

    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/api/import/export",
    }

    _kwargs["files"] = body.to_multipart()

    headers["Content-Type"] = "multipart/form-data; boundary=+++"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> ErrorBody | ImportSummary | None:
    if response.status_code == 200:
        response_200 = ImportSummary.from_dict(response.json())

        return response_200

    if response.status_code == 400:
        response_400 = ErrorBody.from_dict(response.json())

        return response_400

    if response.status_code == 401:
        response_401 = ErrorBody.from_dict(response.json())

        return response_401

    if response.status_code == 403:
        response_403 = ErrorBody.from_dict(response.json())

        return response_403

    if response.status_code == 413:
        response_413 = ErrorBody.from_dict(response.json())

        return response_413

    if response.status_code == 415:
        response_415 = ErrorBody.from_dict(response.json())

        return response_415

    if response.status_code == 500:
        response_500 = ErrorBody.from_dict(response.json())

        return response_500

    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> Response[ErrorBody | ImportSummary]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: AuthenticatedClient,
    body: ImportExportForm,
) -> Response[ErrorBody | ImportSummary]:
    """Restores a backup zip. Admin only.

     A recipe whose id already exists is skipped; every other recipe is added with a new id, owned by the
    caller, and
    its photos are checked and re-encoded like uploads. All or nothing: if anything in the archive is
    wrong, nothing
    is added.

    Args:
        body (ImportExportForm): Multipart body of `POST /api/import/export`.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorBody | ImportSummary]
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
    body: ImportExportForm,
) -> ErrorBody | ImportSummary | None:
    """Restores a backup zip. Admin only.

     A recipe whose id already exists is skipped; every other recipe is added with a new id, owned by the
    caller, and
    its photos are checked and re-encoded like uploads. All or nothing: if anything in the archive is
    wrong, nothing
    is added.

    Args:
        body (ImportExportForm): Multipart body of `POST /api/import/export`.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorBody | ImportSummary
    """

    return sync_detailed(
        client=client,
        body=body,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient,
    body: ImportExportForm,
) -> Response[ErrorBody | ImportSummary]:
    """Restores a backup zip. Admin only.

     A recipe whose id already exists is skipped; every other recipe is added with a new id, owned by the
    caller, and
    its photos are checked and re-encoded like uploads. All or nothing: if anything in the archive is
    wrong, nothing
    is added.

    Args:
        body (ImportExportForm): Multipart body of `POST /api/import/export`.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorBody | ImportSummary]
    """

    kwargs = _get_kwargs(
        body=body,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient,
    body: ImportExportForm,
) -> ErrorBody | ImportSummary | None:
    """Restores a backup zip. Admin only.

     A recipe whose id already exists is skipped; every other recipe is added with a new id, owned by the
    caller, and
    its photos are checked and re-encoded like uploads. All or nothing: if anything in the archive is
    wrong, nothing
    is added.

    Args:
        body (ImportExportForm): Multipart body of `POST /api/import/export`.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorBody | ImportSummary
    """

    return (
        await asyncio_detailed(
            client=client,
            body=body,
        )
    ).parsed
