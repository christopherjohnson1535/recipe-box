from http import HTTPStatus
from typing import Any
from urllib.parse import quote
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.error_body import ErrorBody
from ...models.update_user_body import UpdateUserBody
from ...models.user import User
from ...types import Response


def _get_kwargs(
    id: UUID,
    *,
    body: UpdateUserBody,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}

    _kwargs: dict[str, Any] = {
        "method": "patch",
        "url": "/api/users/{id}".format(
            id=quote(str(id), safe=""),
        ),
    }

    _kwargs["json"] = body.to_dict()

    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> ErrorBody | User | None:
    if response.status_code == 200:
        response_200 = User.from_dict(response.json())

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

    if response.status_code == 404:
        response_404 = ErrorBody.from_dict(response.json())

        return response_404

    if response.status_code == 409:
        response_409 = ErrorBody.from_dict(response.json())

        return response_409

    if response.status_code == 413:
        response_413 = ErrorBody.from_dict(response.json())

        return response_413

    if response.status_code == 500:
        response_500 = ErrorBody.from_dict(response.json())

        return response_500

    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[ErrorBody | User]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    id: UUID,
    *,
    client: AuthenticatedClient,
    body: UpdateUserBody,
) -> Response[ErrorBody | User]:
    """Sets or clears a member's email, the address a Google account must have verified to sign in as them.
    Admin only.
    Replacing or clearing an email that was set also deletes all of the member's linked Google accounts
    (they were
    matched through the old address); setting a first email, or the same one again, keeps them.

    Args:
        id (UUID):
        body (UpdateUserBody):  Example: {'email': 'alex@example.com'}.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorBody | User]
    """

    kwargs = _get_kwargs(
        id=id,
        body=body,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    id: UUID,
    *,
    client: AuthenticatedClient,
    body: UpdateUserBody,
) -> ErrorBody | User | None:
    """Sets or clears a member's email, the address a Google account must have verified to sign in as them.
    Admin only.
    Replacing or clearing an email that was set also deletes all of the member's linked Google accounts
    (they were
    matched through the old address); setting a first email, or the same one again, keeps them.

    Args:
        id (UUID):
        body (UpdateUserBody):  Example: {'email': 'alex@example.com'}.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorBody | User
    """

    return sync_detailed(
        id=id,
        client=client,
        body=body,
    ).parsed


async def asyncio_detailed(
    id: UUID,
    *,
    client: AuthenticatedClient,
    body: UpdateUserBody,
) -> Response[ErrorBody | User]:
    """Sets or clears a member's email, the address a Google account must have verified to sign in as them.
    Admin only.
    Replacing or clearing an email that was set also deletes all of the member's linked Google accounts
    (they were
    matched through the old address); setting a first email, or the same one again, keeps them.

    Args:
        id (UUID):
        body (UpdateUserBody):  Example: {'email': 'alex@example.com'}.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorBody | User]
    """

    kwargs = _get_kwargs(
        id=id,
        body=body,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    id: UUID,
    *,
    client: AuthenticatedClient,
    body: UpdateUserBody,
) -> ErrorBody | User | None:
    """Sets or clears a member's email, the address a Google account must have verified to sign in as them.
    Admin only.
    Replacing or clearing an email that was set also deletes all of the member's linked Google accounts
    (they were
    matched through the old address); setting a first email, or the same one again, keeps them.

    Args:
        id (UUID):
        body (UpdateUserBody):  Example: {'email': 'alex@example.com'}.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorBody | User
    """

    return (
        await asyncio_detailed(
            id=id,
            client=client,
            body=body,
        )
    ).parsed
