from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define

from ..models.grocery_section import GrocerySection
from ..types import UNSET, Unset

T = TypeVar("T", bound="UpdateGroceryItem")


@_attrs_define
class UpdateGroceryItem:
    """At least one field.

    Attributes:
        checked (bool | None | Unset):
        section (GrocerySection | None | Unset):
        staple (bool | None | Unset):
    """

    checked: bool | None | Unset = UNSET
    section: GrocerySection | None | Unset = UNSET
    staple: bool | None | Unset = UNSET

    def to_dict(self) -> dict[str, Any]:
        checked: bool | None | Unset
        if isinstance(self.checked, Unset):
            checked = UNSET
        else:
            checked = self.checked

        section: None | str | Unset
        if isinstance(self.section, Unset):
            section = UNSET
        elif isinstance(self.section, GrocerySection):
            section = self.section.value
        else:
            section = self.section

        staple: bool | None | Unset
        if isinstance(self.staple, Unset):
            staple = UNSET
        else:
            staple = self.staple

        field_dict: dict[str, Any] = {}

        field_dict.update({})
        if checked is not UNSET:
            field_dict["checked"] = checked
        if section is not UNSET:
            field_dict["section"] = section
        if staple is not UNSET:
            field_dict["staple"] = staple

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)

        def _parse_checked(data: object) -> bool | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(bool | None | Unset, data)

        checked = _parse_checked(d.pop("checked", UNSET))

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

        def _parse_staple(data: object) -> bool | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(bool | None | Unset, data)

        staple = _parse_staple(d.pop("staple", UNSET))

        update_grocery_item = cls(
            checked=checked,
            section=section,
            staple=staple,
        )

        return update_grocery_item
