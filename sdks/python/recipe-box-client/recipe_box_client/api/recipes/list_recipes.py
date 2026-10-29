from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.error_body import ErrorBody
from ...models.recipe_page import RecipePage
from ...models.recipe_sort import RecipeSort
from ...types import UNSET, Response, Unset


def _get_kwargs(
    *,
    q: str | Unset = UNSET,
    tag: str | Unset = UNSET,
    favourite: bool | Unset = UNSET,
    sort: RecipeSort | Unset = UNSET,
    limit: int | Unset = UNSET,
    offset: int | Unset = UNSET,
) -> dict[str, Any]:

    params: dict[str, Any] = {}

    params["q"] = q

    params["tag"] = tag

    params["favourite"] = favourite

    json_sort: str | Unset = UNSET
    if not isinstance(sort, Unset):
        json_sort = sort.value

    params["sort"] = json_sort

    params["limit"] = limit

    params["offset"] = offset

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/api/recipes",
        "params": params,
    }

    return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> ErrorBody | RecipePage | None:
    if response.status_code == 200:
        response_200 = RecipePage.from_dict(response.json())

        return response_200

    if response.status_code == 400:
        response_400 = ErrorBody.from_dict(response.json())

        return response_400

    if response.status_code == 401:
        response_401 = ErrorBody.from_dict(response.json())

        return response_401

    if response.status_code == 500:
        response_500 = ErrorBody.from_dict(response.json())

        return response_500

    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> Response[ErrorBody | RecipePage]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: AuthenticatedClient,
    q: str | Unset = UNSET,
    tag: str | Unset = UNSET,
    favourite: bool | Unset = UNSET,
    sort: RecipeSort | Unset = UNSET,
    limit: int | Unset = UNSET,
    offset: int | Unset = UNSET,
) -> Response[ErrorBody | RecipePage]:
    """Live recipes, searchable and sortable.

    Args:
        q (str | Unset):
        tag (str | Unset):
        favourite (bool | Unset):
        sort (RecipeSort | Unset): Sort orders for `GET /api/recipes`; the handler matches the raw
            string, so anything else is a 400.
        limit (int | Unset):
        offset (int | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorBody | RecipePage]
    """

    kwargs = _get_kwargs(
        q=q,
        tag=tag,
        favourite=favourite,
        sort=sort,
        limit=limit,
        offset=offset,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: AuthenticatedClient,
    q: str | Unset = UNSET,
    tag: str | Unset = UNSET,
    favourite: bool | Unset = UNSET,
    sort: RecipeSort | Unset = UNSET,
    limit: int | Unset = UNSET,
    offset: int | Unset = UNSET,
) -> ErrorBody | RecipePage | None:
    """Live recipes, searchable and sortable.

    Args:
        q (str | Unset):
        tag (str | Unset):
        favourite (bool | Unset):
        sort (RecipeSort | Unset): Sort orders for `GET /api/recipes`; the handler matches the raw
            string, so anything else is a 400.
        limit (int | Unset):
        offset (int | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorBody | RecipePage
    """

    return sync_detailed(
        client=client,
        q=q,
        tag=tag,
        favourite=favourite,
        sort=sort,
        limit=limit,
        offset=offset,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient,
    q: str | Unset = UNSET,
    tag: str | Unset = UNSET,
    favourite: bool | Unset = UNSET,
    sort: RecipeSort | Unset = UNSET,
    limit: int | Unset = UNSET,
    offset: int | Unset = UNSET,
) -> Response[ErrorBody | RecipePage]:
    """Live recipes, searchable and sortable.

    Args:
        q (str | Unset):
        tag (str | Unset):
        favourite (bool | Unset):
        sort (RecipeSort | Unset): Sort orders for `GET /api/recipes`; the handler matches the raw
            string, so anything else is a 400.
        limit (int | Unset):
        offset (int | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorBody | RecipePage]
    """

    kwargs = _get_kwargs(
        q=q,
        tag=tag,
        favourite=favourite,
        sort=sort,
        limit=limit,
        offset=offset,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient,
    q: str | Unset = UNSET,
    tag: str | Unset = UNSET,
    favourite: bool | Unset = UNSET,
    sort: RecipeSort | Unset = UNSET,
    limit: int | Unset = UNSET,
    offset: int | Unset = UNSET,
) -> ErrorBody | RecipePage | None:
    """Live recipes, searchable and sortable.

    Args:
        q (str | Unset):
        tag (str | Unset):
        favourite (bool | Unset):
        sort (RecipeSort | Unset): Sort orders for `GET /api/recipes`; the handler matches the raw
            string, so anything else is a 400.
        limit (int | Unset):
        offset (int | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorBody | RecipePage
    """

    return (
        await asyncio_detailed(
            client=client,
            q=q,
            tag=tag,
            favourite=favourite,
            sort=sort,
            limit=limit,
            offset=offset,
        )
    ).parsed
