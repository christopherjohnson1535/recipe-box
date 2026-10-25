"""Login -> create -> search -> read -> delete -> restore -> delete, using only the generated client.

Needs a running API: RECIPE_BOX_URL (default http://127.0.0.1:3146). Over plain http the API must run with
COOKIE_SECURE=false, or the client cannot keep the rb_session cookie.
"""

import os
import uuid

from recipe_box_client import AuthenticatedClient
from recipe_box_client.api.auth import get_current_user, login, logout
from recipe_box_client.api.recipes import create_recipe, delete_recipe, get_recipe, list_recipes, restore_recipe
from recipe_box_client.api.setup import create_admin, get_setup_status
from recipe_box_client.models import Ingredient, LoginBody, RecipeInput, SetupBody

URL = os.environ.get("RECIPE_BOX_URL", "http://127.0.0.1:3146")
USER = os.environ.get("RECIPE_BOX_USER", "sdk-smoke")
PASSWORD = os.environ.get("RECIPE_BOX_PASSWORD", "sdk-smoke-password-123")


def test_recipe_lifecycle():
    # The spec's cookie scheme makes the generator ask for a bearer token; the API ignores it, the cookie jar carries the session.
    with AuthenticatedClient(base_url=URL, token="", prefix="", raise_on_unexpected_status=True) as client:
        if get_setup_status.sync(client=client).needs_setup:
            create_admin.sync(client=client, body=SetupBody(username=USER, password=PASSWORD, display_name="SDK smoke"))
        else:
            login.sync(client=client, body=LoginBody(username=USER, password=PASSWORD))
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
        assert created.title == f"Pancakes {word}"

        found = list_recipes.sync(client=client, q=word)
        assert [r.id for r in found.items] == [created.id]
        assert get_recipe.sync(created.id, client=client).id == created.id

        assert delete_recipe.sync_detailed(created.id, client=client).status_code == 204
        assert restore_recipe.sync(created.id, client=client).id == created.id
        assert delete_recipe.sync_detailed(created.id, client=client).status_code == 204  # clean up
        logout.sync_detailed(client=client)
