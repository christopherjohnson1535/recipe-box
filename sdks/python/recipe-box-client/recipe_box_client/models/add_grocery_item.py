from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define

from ..models.grocery_section import GrocerySection
from ..types import UNSET, Unset

T = TypeVar("T", bound="AddGroceryItem")


@_attrs_define
class AddGroceryItem:
    """
    Attributes:
        text (str): Read like an ingredient line ("2 lb potatoes"); 1 to 200 characters once trimmed.
        section (GrocerySection | None | Unset):
    """

    text: str
    section: GrocerySection | None | Unset = UNSET

    def to_dict(self) -> dict[str, Any]:
        text = self.text

        section: None | str | Unset
        if isinstance(self.section, Unset):
            section = UNSET
        elif isinstance(self.section, GrocerySection):
            section = self.section.value
        else:
            section = self.section

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "text": text,
            }
        )
        if section is not UNSET:
            field_dict["section"] = section

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        text = d.pop("text")

        def _parse_section(data: object) -> GrocerySection | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                section_type_0 = GrocerySection(data)

                return section_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(GrocerySection | None | Unset, data)

        section = _parse_section(d.pop("section", UNSET))

        add_grocery_item = cls(
            text=text,
            section=section,
        )

        return add_grocery_item
