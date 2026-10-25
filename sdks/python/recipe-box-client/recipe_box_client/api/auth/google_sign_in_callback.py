from http import HTTPStatus
from typing import Any, cast

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.error_body import ErrorBody
from ...types import UNSET, Response, Unset


def _get_kwargs(
    *,
    code: str | Unset = UNSET,
    state: str | Unset = UNSET,
    error: str | Unset = UNSET,
) -> dict[str, Any]:

    params: dict[str, Any] = {}

    params["code"] = code

    params["state"] = state

    params["error"] = error

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/api/auth/google/callback",
        "params": params,
    }

    return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Any | ErrorBody | None:
    if response.status_code == 302:
        response_302 = cast(Any, None)
        return response_302

    if response.status_code == 404:
        response_404 = ErrorBody.from_dict(response.json())

        return response_404

    if response.status_code == 500:
        response_500 = ErrorBody.from_dict(response.json())

        return response_500

    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[Any | ErrorBody]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: AuthenticatedClient,
    code: str | Unset = UNSET,
    state: str | Unset = UNSET,
    error: str | Unset = UNSET,
) -> Response[Any | ErrorBody]:
    """Where Google sends the browser back. Always clears `rb_oauth` and ends on a page, never on JSON.

     Signing in: a member gets the session cookie (as the password login does) and lands on `next`; a
    Google account
    that is no member lands on `/login?error=google_not_member` and nothing is created; any other
    failure (a wrong
    or old `state`, a refusal from Google, an unverified email, a bad ID token) on
    `/login?error=google_failed`.
    Linking from Settings (needs the session of the member who started it): `/settings?signin=linked`,
    `/settings?signin=taken` (that Google account belongs to another member) or
    `/settings?signin=error`.

    A malformed query (a repeated `code`) counts as an empty one. Callbacks are throttled per client
    address: after
    repeated failures the address is sent to `/login?error=google_failed` without Google being called,
    for a while.

    Args:
        code (str | Unset):
        state (str | Unset):
        error (str | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Any | ErrorBody]
    """

    kwargs = _get_kwargs(
        code=code,
        state=state,
        error=error,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: AuthenticatedClient,
    code: str | Unset = UNSET,
    state: str | Unset = UNSET,
    error: str | Unset = UNSET,
) -> Any | ErrorBody | None:
    """Where Google sends the browser back. Always clears `rb_oauth` and ends on a page, never on JSON.

     Signing in: a member gets the session cookie (as the password login does) and lands on `next`; a
    Google account
    that is no member lands on `/login?error=google_not_member` and nothing is created; any other
    failure (a wrong
    or old `state`, a refusal from Google, an unverified email, a bad ID token) on
    `/login?error=google_failed`.
    Linking from Settings (needs the session of the member who started it): `/settings?signin=linked`,
    `/settings?signin=taken` (that Google account belongs to another member) or
    `/settings?signin=error`.

    A malformed query (a repeated `code`) counts as an empty one. Callbacks are throttled per client
    address: after
    repeated failures the address is sent to `/login?error=google_failed` without Google being called,
    for a while.

    Args:
        code (str | Unset):
        state (str | Unset):
        error (str | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Any | ErrorBody
    """

    return sync_detailed(
        client=client,
        code=code,
        state=state,
        error=error,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient,
    code: str | Unset = UNSET,
    state: str | Unset = UNSET,
    error: str | Unset = UNSET,
) -> Response[Any | ErrorBody]:
    """Where Google sends the browser back. Always clears `rb_oauth` and ends on a page, never on JSON.

     Signing in: a member gets the session cookie (as the password login does) and lands on `next`; a
    Google account
    that is no member lands on `/login?error=google_not_member` and nothing is created; any other
    failure (a wrong
    or old `state`, a refusal from Google, an unverified email, a bad ID token) on
    `/login?error=google_failed`.
    Linking from Settings (needs the session of the member who started it): `/settings?signin=linked`,
    `/settings?signin=taken` (that Google account belongs to another member) or
    `/settings?signin=error`.

    A malformed query (a repeated `code`) counts as an empty one. Callbacks are throttled per client
    address: after
    repeated failures the address is sent to `/login?error=google_failed` without Google being called,
    for a while.

    Args:
        code (str | Unset):
        state (str | Unset):
        error (str | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Any | ErrorBody]
    """

    kwargs = _get_kwargs(
        code=code,
        state=state,
        error=error,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient,
    code: str | Unset = UNSET,
    state: str | Unset = UNSET,
    error: str | Unset = UNSET,
) -> Any | ErrorBody | None:
    """Where Google sends the browser back. Always clears `rb_oauth` and ends on a page, never on JSON.

     Signing in: a member gets the session cookie (as the password login does) and lands on `next`; a
    Google account
    that is no member lands on `/login?error=google_not_member` and nothing is created; any other
    failure (a wrong
    or old `state`, a refusal from Google, an unverified email, a bad ID token) on
    `/login?error=google_failed`.
    Linking from Settings (needs the session of the member who started it): `/settings?signin=linked`,
    `/settings?signin=taken` (that Google account belongs to another member) or
    `/settings?signin=error`.

    A malformed query (a repeated `code`) counts as an empty one. Callbacks are throttled per client
    address: after
    repeated failures the address is sent to `/login?error=google_failed` without Google being called,
    for a while.

    Args:
        code (str | Unset):
        state (str | Unset):
        error (str | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Any | ErrorBody
    """

    return (
        await asyncio_detailed(
            client=client,
            code=code,
            state=state,
            error=error,
        )
    ).parsed
