from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define

from ..types import UNSET, Unset

T = TypeVar("T", bound="AddGroceryRecipe")


@_attrs_define
class AddGroceryRecipe:
    """
    Attributes:
        recipe_id (UUID):
        scale (float | None | Unset): 0.25 to 10; default 1. Setting it for a recipe already on the list rescales it.
            Default: 1.0.
    """

    recipe_id: UUID
    scale: float | None | Unset = 1.0

    def to_dict(self) -> dict[str, Any]:
        recipe_id = str(self.recipe_id)

        scale: float | None | Unset
        if isinstance(self.scale, Unset):
            scale = UNSET
        else:
            scale = self.scale

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "recipeId": recipe_id,
            }
        )
        if scale is not UNSET:
            field_dict["scale"] = scale

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        recipe_id = UUID(d.pop("recipeId"))

        def _parse_scale(data: object) -> float | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(float | None | Unset, data)

        scale = _parse_scale(d.pop("scale", UNSET))

        add_grocery_recipe = cls(
            recipe_id=recipe_id,
            scale=scale,
        )

        return add_grocery_recipe
