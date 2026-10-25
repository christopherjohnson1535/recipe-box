"""Setup/login -> create -> search -> read -> delete -> restore -> delete, using only the generated client.

Needs a running API: RECIPE_BOX_URL (default http://127.0.0.1:3146). Over plain http the API must run with
COOKIE_SECURE=false, or the client cannot keep the rb_session cookie. On a stack that already has an admin, set
RECIPE_BOX_USER and RECIPE_BOX_PASSWORD to that account.
"""

import os
import uuid

import pytest
from recipe_box_client import AuthenticatedClient
from recipe_box_client.api.auth import get_current_user, login, logout
from recipe_box_client.api.recipes import create_recipe, delete_recipe, get_recipe, list_recipes, restore_recipe
from recipe_box_client.api.setup import create_admin, get_setup_status
from recipe_box_client.errors import UnexpectedStatus
from recipe_box_client.models import Ingredient, LoginBody, RecipeInput, SetupBody

URL = os.environ.get("RECIPE_BOX_URL", "http://127.0.0.1:3146")
USER = os.environ.get("RECIPE_BOX_USER", "sdk-smoke")
PASSWORD = os.environ.get("RECIPE_BOX_PASSWORD", "sdk-smoke-password-123")


@pytest.fixture
def client():
    # The spec's cookie scheme makes the generator ask for a bearer token; an empty one is sent as an empty, ignored
    # Authorization header, and the session cookie in the httpx jar authenticates (docs/SDK.md).
    with AuthenticatedClient(base_url=URL, token="", prefix="", raise_on_unexpected_status=True) as c:
        yield c


def test_recipe_lifecycle(client):
    if get_setup_status.sync(client=client).needs_setup:
        create_admin.sync(client=client, body=SetupBody(username=USER, password=PASSWORD, display_name="SDK smoke"))
        logout.sync_detailed(client=client)  # setup logs in; log out so login below is exercised
    try:
        login.sync(client=client, body=LoginBody(username=USER, password=PASSWORD))
    except UnexpectedStatus as e:
        if e.status_code == 401:
            pytest.fail("login returned 401: set RECIPE_BOX_USER and RECIPE_BOX_PASSWORD to an existing account")
        raise
    try:
        assert get_current_user.sync(client=client).username == USER

        word = "smoke" + uuid.uuid4().hex[:12]
        created = create_recipe.sync(
            client=client,
            body=RecipeInput(
                title=f"Pancakes {word}",
                ingredients=[Ingredient(text="2 cups flour", section=None)],
                steps=[Ingredient(text="Fry until golden.", section=None)],
            ),
        )
        try:
            assert created.title == f"Pancakes {word}"
            found = list_recipes.sync(client=client, q=word)
            assert [r.id for r in found.items] == [created.id]
            assert get_recipe.sync(created.id, client=client).id == created.id
            assert delete_recipe.sync_detailed(created.id, client=client).status_code == 204
            assert restore_recipe.sync(created.id, client=client).id == created.id
        finally:
            delete_recipe.sync_detailed(created.id, client=client)  # clean up (idempotent)
    finally:
        logout.sync_detailed(client=client)
