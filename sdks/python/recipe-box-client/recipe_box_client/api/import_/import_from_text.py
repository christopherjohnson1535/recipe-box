from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.error_body import ErrorBody
from ...models.import_text_body import ImportTextBody
from ...models.recipe_draft import RecipeDraft
from ...types import Response


def _get_kwargs(
    *,
    body: ImportTextBody,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}

    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/api/import/text",
    }

    _kwargs["json"] = body.to_dict()

    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> ErrorBody | RecipeDraft | None:
    if response.status_code == 200:
        response_200 = RecipeDraft.from_dict(response.json())

        return response_200

    if response.status_code == 400:
        response_400 = ErrorBody.from_dict(response.json())

        return response_400

    if response.status_code == 401:
        response_401 = ErrorBody.from_dict(response.json())

        return response_401

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
) -> Response[ErrorBody | RecipeDraft]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: AuthenticatedClient,
    body: ImportTextBody,
) -> Response[ErrorBody | RecipeDraft]:
    """Reads a recipe from pasted text with AI (LNK-3/4). Returns a draft; saves nothing and never fetches
    `sourceUrl`.

    Args:
        body (ImportTextBody):  Example: {'sourceUrl': 'https://example.com/recipes/pancakes',
            'text': 'Pancakes\\n2 cups flour\\n2 eggs\\nMix and fry.'}.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorBody | RecipeDraft]
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
    body: ImportTextBody,
) -> ErrorBody | RecipeDraft | None:
    """Reads a recipe from pasted text with AI (LNK-3/4). Returns a draft; saves nothing and never fetches
    `sourceUrl`.

    Args:
        body (ImportTextBody):  Example: {'sourceUrl': 'https://example.com/recipes/pancakes',
            'text': 'Pancakes\\n2 cups flour\\n2 eggs\\nMix and fry.'}.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorBody | RecipeDraft
    """

    return sync_detailed(
        client=client,
        body=body,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient,
    body: ImportTextBody,
) -> Response[ErrorBody | RecipeDraft]:
    """Reads a recipe from pasted text with AI (LNK-3/4). Returns a draft; saves nothing and never fetches
    `sourceUrl`.

    Args:
        body (ImportTextBody):  Example: {'sourceUrl': 'https://example.com/recipes/pancakes',
            'text': 'Pancakes\\n2 cups flour\\n2 eggs\\nMix and fry.'}.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorBody | RecipeDraft]
    """

    kwargs = _get_kwargs(
        body=body,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient,
    body: ImportTextBody,
) -> ErrorBody | RecipeDraft | None:
    """Reads a recipe from pasted text with AI (LNK-3/4). Returns a draft; saves nothing and never fetches
    `sourceUrl`.

    Args:
        body (ImportTextBody):  Example: {'sourceUrl': 'https://example.com/recipes/pancakes',
            'text': 'Pancakes\\n2 cups flour\\n2 eggs\\nMix and fry.'}.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorBody | RecipeDraft
    """

    return (
        await asyncio_detailed(
            client=client,
            body=body,
        )
    ).parsed
