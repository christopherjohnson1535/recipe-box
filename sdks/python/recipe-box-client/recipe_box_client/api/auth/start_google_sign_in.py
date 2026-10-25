from http import HTTPStatus
from typing import Any, cast

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.error_body import ErrorBody
from ...types import UNSET, Response, Unset


def _get_kwargs(
    *,
    next_: str | Unset = UNSET,
    link: str | Unset = UNSET,
) -> dict[str, Any]:

    params: dict[str, Any] = {}

    params["next"] = next_

    params["link"] = link

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/api/auth/google/start",
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
    next_: str | Unset = UNSET,
    link: str | Unset = UNSET,
) -> Response[Any | ErrorBody]:
    """Starts signing in with Google. Open it as a page (a browser navigation), not with `fetch`. With
    `link=1` and a
    session it links a Google account to that member instead; they need not share an email.

    Args:
        next_ (str | Unset):
        link (str | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Any | ErrorBody]
    """

    kwargs = _get_kwargs(
        next_=next_,
        link=link,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: AuthenticatedClient,
    next_: str | Unset = UNSET,
    link: str | Unset = UNSET,
) -> Any | ErrorBody | None:
    """Starts signing in with Google. Open it as a page (a browser navigation), not with `fetch`. With
    `link=1` and a
    session it links a Google account to that member instead; they need not share an email.

    Args:
        next_ (str | Unset):
        link (str | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Any | ErrorBody
    """

    return sync_detailed(
        client=client,
        next_=next_,
        link=link,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient,
    next_: str | Unset = UNSET,
    link: str | Unset = UNSET,
) -> Response[Any | ErrorBody]:
    """Starts signing in with Google. Open it as a page (a browser navigation), not with `fetch`. With
    `link=1` and a
    session it links a Google account to that member instead; they need not share an email.

    Args:
        next_ (str | Unset):
        link (str | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Any | ErrorBody]
    """

    kwargs = _get_kwargs(
        next_=next_,
        link=link,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient,
    next_: str | Unset = UNSET,
    link: str | Unset = UNSET,
) -> Any | ErrorBody | None:
    """Starts signing in with Google. Open it as a page (a browser navigation), not with `fetch`. With
    `link=1` and a
    session it links a Google account to that member instead; they need not share an email.

    Args:
        next_ (str | Unset):
        link (str | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Any | ErrorBody
    """

    return (
        await asyncio_detailed(
            client=client,
            next_=next_,
            link=link,
        )
    ).parsed
