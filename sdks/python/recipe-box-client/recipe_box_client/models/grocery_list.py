from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
    from ..models.grocery_item import GroceryItem
    from ..models.grocery_recipe import GroceryRecipe


T = TypeVar("T", bound="GroceryList")


@_attrs_define
class GroceryList:
    """
    Attributes:
        id (UUID):
        items (list[GroceryItem]): By section in shopping order, then by name. Cleared items are not returned.
        recipes (list[GroceryRecipe]):
        updated_at (datetime.datetime): Changes on every write: refetch when it differs from what you hold.
    """

    id: UUID
    items: list[GroceryItem]
    recipes: list[GroceryRecipe]
    updated_at: datetime.datetime
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        id = str(self.id)

        items = []
        for items_item_data in self.items:
            items_item = items_item_data.to_dict()
            items.append(items_item)

        recipes = []
        for recipes_item_data in self.recipes:
            recipes_item = recipes_item_data.to_dict()
            recipes.append(recipes_item)

        updated_at = self.updated_at.isoformat()

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "id": id,
                "items": items,
                "recipes": recipes,
                "updatedAt": updated_at,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.grocery_item import GroceryItem  # noqa: PLC0415
        from ..models.grocery_recipe import GroceryRecipe  # noqa: PLC0415

        d = dict(src_dict)
        id = UUID(d.pop("id"))

        items = []
        _items = d.pop("items")
        for items_item_data in _items:
            items_item = GroceryItem.from_dict(items_item_data)

            items.append(items_item)

        recipes = []
        _recipes = d.pop("recipes")
        for recipes_item_data in _recipes:
            recipes_item = GroceryRecipe.from_dict(recipes_item_data)

            recipes.append(recipes_item)

        updated_at = datetime.datetime.fromisoformat(d.pop("updatedAt"))

        grocery_list = cls(
            id=id,
            items=items,
            recipes=recipes,
            updated_at=updated_at,
        )

        grocery_list.additional_properties = d
        return grocery_list

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
