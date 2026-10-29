from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.cook_plan import CookPlan
from ...models.cook_plan_request import CookPlanRequest
from ...models.error_body import ErrorBody
from ...types import Response


def _get_kwargs(
    *,
    body: CookPlanRequest,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}

    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/api/cook/plan",
    }

    _kwargs["json"] = body.to_dict()

    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> CookPlan | ErrorBody | None:
    if response.status_code == 200:
        response_200 = CookPlan.from_dict(response.json())

        return response_200

    if response.status_code == 400:
        response_400 = ErrorBody.from_dict(response.json())

        return response_400

    if response.status_code == 401:
        response_401 = ErrorBody.from_dict(response.json())

        return response_401

    if response.status_code == 404:
        response_404 = ErrorBody.from_dict(response.json())

        return response_404

    if response.status_code == 413:
        response_413 = ErrorBody.from_dict(response.json())

        return response_413

    if response.status_code == 422:
        response_422 = ErrorBody.from_dict(response.json())

        return response_422

    if response.status_code == 429:
        response_429 = ErrorBody.from_dict(response.json())

        return response_429

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
) -> Response[CookPlan | ErrorBody]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: AuthenticatedClient,
    body: CookPlanRequest,
) -> Response[CookPlan | ErrorBody]:
    """Suggests the order to cook the recipes' steps in so they are ready together. Needs an AI provider. A
    suggestion
    that does not add up comes back as the round-robin order (`source: roundRobin`) with a `reason`,
    never as an error.

    Args:
        body (CookPlanRequest): What to plan: the recipes of a cook-together session and,
            optionally, when to serve.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[CookPlan | ErrorBody]
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
    body: CookPlanRequest,
) -> CookPlan | ErrorBody | None:
    """Suggests the order to cook the recipes' steps in so they are ready together. Needs an AI provider. A
    suggestion
    that does not add up comes back as the round-robin order (`source: roundRobin`) with a `reason`,
    never as an error.

    Args:
        body (CookPlanRequest): What to plan: the recipes of a cook-together session and,
            optionally, when to serve.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        CookPlan | ErrorBody
    """

    return sync_detailed(
        client=client,
        body=body,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient,
    body: CookPlanRequest,
) -> Response[CookPlan | ErrorBody]:
    """Suggests the order to cook the recipes' steps in so they are ready together. Needs an AI provider. A
    suggestion
    that does not add up comes back as the round-robin order (`source: roundRobin`) with a `reason`,
    never as an error.

    Args:
        body (CookPlanRequest): What to plan: the recipes of a cook-together session and,
            optionally, when to serve.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[CookPlan | ErrorBody]
    """

    kwargs = _get_kwargs(
        body=body,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient,
    body: CookPlanRequest,
) -> CookPlan | ErrorBody | None:
    """Suggests the order to cook the recipes' steps in so they are ready together. Needs an AI provider. A
    suggestion
    that does not add up comes back as the round-robin order (`source: roundRobin`) with a `reason`,
    never as an error.

    Args:
        body (CookPlanRequest): What to plan: the recipes of a cook-together session and,
            optionally, when to serve.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        CookPlan | ErrorBody
    """

    return (
        await asyncio_detailed(
            client=client,
            body=body,
        )
    ).parsed
