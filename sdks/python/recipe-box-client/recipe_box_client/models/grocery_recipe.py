from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="GroceryRecipe")


@_attrs_define
class GroceryRecipe:
    """
    Attributes:
        image_url (None | str):
        recipe_id (UUID):
        scale (float): The factor the recipe page uses (½× is 0.5).
        servings (None | str): The recipe's servings text scaled by `scale` (`"4-6"` at 0.5 is `"2–3"`).
        title (str):
    """

    image_url: None | str
    recipe_id: UUID
    scale: float
    servings: None | str
    title: str
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        image_url: None | str
        image_url = self.image_url

        recipe_id = str(self.recipe_id)

        scale = self.scale

        servings: None | str
        servings = self.servings

        title = self.title

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "imageUrl": image_url,
                "recipeId": recipe_id,
                "scale": scale,
                "servings": servings,
                "title": title,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)

        def _parse_image_url(data: object) -> None | str:
            if data is None:
                return data
            return cast(None | str, data)

        image_url = _parse_image_url(d.pop("imageUrl"))

        recipe_id = UUID(d.pop("recipeId"))

        scale = d.pop("scale")

        def _parse_servings(data: object) -> None | str:
            if data is None:
                return data
            return cast(None | str, data)

        servings = _parse_servings(d.pop("servings"))

        title = d.pop("title")

        grocery_recipe = cls(
            image_url=image_url,
            recipe_id=recipe_id,
            scale=scale,
            servings=servings,
            title=title,
        )

        grocery_recipe.additional_properties = d
        return grocery_recipe

    @property
    def additional_keys(self) -> list[str]:
        return list(self.additional_properties.keys())

    def __getitem__(self, key: str) -> Any:
        return self.additional_properties[key]

    def __setitem__(self, key: str, value: Any) -> None:
        self.additional_properties[key] = value

    def __delitem__(self, key: str) -> None:
        del self.additional_properties[key]

    def __contains__(self, key: str) -> bool:
        return key in self.additional_properties
