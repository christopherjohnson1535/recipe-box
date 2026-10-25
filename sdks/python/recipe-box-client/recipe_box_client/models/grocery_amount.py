from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="GroceryAmount")


@_attrs_define
class GroceryAmount:
    """One amount of a grocery item: `quantity` as a cook writes it (`1½`, `2–3`), `unit` in its short form.

    Attributes:
        quantity (None | str):
        unit (None | str):
    """

    quantity: None | str
    unit: None | str
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        quantity: None | str
        quantity = self.quantity

        unit: None | str
        unit = self.unit

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "quantity": quantity,
                "unit": unit,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)

        def _parse_quantity(data: object) -> None | str:
            if data is None:
                return data
            return cast(None | str, data)

        quantity = _parse_quantity(d.pop("quantity"))

        def _parse_unit(data: object) -> None | str:
            if data is None:
                return data
            return cast(None | str, data)

        unit = _parse_unit(d.pop("unit"))

        grocery_amount = cls(
            quantity=quantity,
            unit=unit,
        )

        grocery_amount.additional_properties = d
        return grocery_amount

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
