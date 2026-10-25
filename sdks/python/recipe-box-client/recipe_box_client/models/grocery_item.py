from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.grocery_section import GrocerySection

if TYPE_CHECKING:
    from ..models.grocery_amount import GroceryAmount


T = TypeVar("T", bound="GroceryItem")


@_attrs_define
class GroceryItem:
    """Several amounts mean different units side by side; none means "no amount".

    Attributes:
        amounts (list[GroceryAmount]):
        checked (bool):
        id (UUID):
        manual (bool): Added by hand rather than made from a recipe.
        name (str):
        recipe_ids (list[UUID]):
        section (GrocerySection): A store section, in shopping order.
        staple (bool): Always has it at home: shown, but the client hides it unless asked.
    """

    amounts: list[GroceryAmount]
    checked: bool
    id: UUID
    manual: bool
    name: str
    recipe_ids: list[UUID]
    section: GrocerySection
    staple: bool
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        amounts = []
        for amounts_item_data in self.amounts:
            amounts_item = amounts_item_data.to_dict()
            amounts.append(amounts_item)

        checked = self.checked

        id = str(self.id)

        manual = self.manual

        name = self.name

        recipe_ids = []
        for recipe_ids_item_data in self.recipe_ids:
            recipe_ids_item = str(recipe_ids_item_data)
            recipe_ids.append(recipe_ids_item)

        section = self.section.value

        staple = self.staple

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "amounts": amounts,
                "checked": checked,
                "id": id,
                "manual": manual,
                "name": name,
                "recipeIds": recipe_ids,
                "section": section,
                "staple": staple,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.grocery_amount import GroceryAmount  # noqa: PLC0415

        d = dict(src_dict)
        amounts = []
        _amounts = d.pop("amounts")
        for amounts_item_data in _amounts:
            amounts_item = GroceryAmount.from_dict(amounts_item_data)

            amounts.append(amounts_item)

        checked = d.pop("checked")

        id = UUID(d.pop("id"))

        manual = d.pop("manual")

        name = d.pop("name")

        recipe_ids = []
        _recipe_ids = d.pop("recipeIds")
        for recipe_ids_item_data in _recipe_ids:
            recipe_ids_item = UUID(recipe_ids_item_data)

            recipe_ids.append(recipe_ids_item)

        section = GrocerySection(d.pop("section"))

        staple = d.pop("staple")

        grocery_item = cls(
            amounts=amounts,
            checked=checked,
            id=id,
            manual=manual,
            name=name,
            recipe_ids=recipe_ids,
            section=section,
            staple=staple,
        )

        grocery_item.additional_properties = d
        return grocery_item

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
