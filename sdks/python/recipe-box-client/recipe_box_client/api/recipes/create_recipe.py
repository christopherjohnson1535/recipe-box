from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.error_body import ErrorBody
from ...models.recipe import Recipe
from ...models.recipe_input import RecipeInput
from ...types import Response


def _get_kwargs(
    *,
    body: RecipeInput,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}

    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/api/recipes",
    }

    _kwargs["json"] = body.to_dict()

    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> ErrorBody | Recipe | None:
    if response.status_code == 201:
        response_201 = Recipe.from_dict(response.json())

        return response_201

    if response.status_code == 400:
        response_400 = ErrorBody.from_dict(response.json())

        return response_400

    if response.status_code == 401:
        response_401 = ErrorBody.from_dict(response.json())

        return response_401

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


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[ErrorBody | Recipe]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: AuthenticatedClient,
    body: RecipeInput,
) -> Response[ErrorBody | Recipe]:
    """Saves a new recipe.

    Args:
        body (RecipeInput):  Example: {'cookMinutes': 15, 'description': 'Fluffy weekend
            pancakes.', 'imageId': None, 'ingredients': [{'section': None, 'text': '2 cups flour'},
            {'section': None, 'text': '2 eggs'}], 'notes': '', 'photoImageIds': [], 'prepMinutes': 10,
            'servings': '4', 'sourceName': None, 'sourceType': 'manual', 'sourceUrl': None, 'steps':
            [{'section': None, 'text': 'Mix the batter.'}, {'section': None, 'text': 'Fry until
            golden.'}], 'tags': ['breakfast'], 'title': 'Pancakes', 'totalMinutes': 25}.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorBody | Recipe]
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
    body: RecipeInput,
) -> ErrorBody | Recipe | None:
    """Saves a new recipe.

    Args:
        body (RecipeInput):  Example: {'cookMinutes': 15, 'description': 'Fluffy weekend
            pancakes.', 'imageId': None, 'ingredients': [{'section': None, 'text': '2 cups flour'},
            {'section': None, 'text': '2 eggs'}], 'notes': '', 'photoImageIds': [], 'prepMinutes': 10,
            'servings': '4', 'sourceName': None, 'sourceType': 'manual', 'sourceUrl': None, 'steps':
            [{'section': None, 'text': 'Mix the batter.'}, {'section': None, 'text': 'Fry until
            golden.'}], 'tags': ['breakfast'], 'title': 'Pancakes', 'totalMinutes': 25}.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorBody | Recipe
    """

    return sync_detailed(
        client=client,
        body=body,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient,
    body: RecipeInput,
) -> Response[ErrorBody | Recipe]:
    """Saves a new recipe.

    Args:
        body (RecipeInput):  Example: {'cookMinutes': 15, 'description': 'Fluffy weekend
            pancakes.', 'imageId': None, 'ingredients': [{'section': None, 'text': '2 cups flour'},
            {'section': None, 'text': '2 eggs'}], 'notes': '', 'photoImageIds': [], 'prepMinutes': 10,
            'servings': '4', 'sourceName': None, 'sourceType': 'manual', 'sourceUrl': None, 'steps':
            [{'section': None, 'text': 'Mix the batter.'}, {'section': None, 'text': 'Fry until
            golden.'}], 'tags': ['breakfast'], 'title': 'Pancakes', 'totalMinutes': 25}.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorBody | Recipe]
    """

    kwargs = _get_kwargs(
        body=body,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient,
    body: RecipeInput,
) -> ErrorBody | Recipe | None:
    """Saves a new recipe.

    Args:
        body (RecipeInput):  Example: {'cookMinutes': 15, 'description': 'Fluffy weekend
            pancakes.', 'imageId': None, 'ingredients': [{'section': None, 'text': '2 cups flour'},
            {'section': None, 'text': '2 eggs'}], 'notes': '', 'photoImageIds': [], 'prepMinutes': 10,
            'servings': '4', 'sourceName': None, 'sourceType': 'manual', 'sourceUrl': None, 'steps':
            [{'section': None, 'text': 'Mix the batter.'}, {'section': None, 'text': 'Fry until
            golden.'}], 'tags': ['breakfast'], 'title': 'Pancakes', 'totalMinutes': 25}.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorBody | Recipe
    """

    return (
        await asyncio_detailed(
            client=client,
            body=body,
        )
    ).parsed
