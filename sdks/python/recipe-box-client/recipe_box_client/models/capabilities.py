from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.ai_provider import AiProvider

T = TypeVar("T", bound="Capabilities")


@_attrs_define
class Capabilities:
    """
    Attributes:
        ai (bool):
        provider (AiProvider): Mirrors the values `AI_PROVIDER` accepts (checked in `Config::from_env`).
    """

    ai: bool
    provider: AiProvider
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        ai = self.ai

        provider = self.provider.value

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "ai": ai,
                "provider": provider,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        ai = d.pop("ai")

        provider = AiProvider(d.pop("provider"))

        capabilities = cls(
            ai=ai,
            provider=provider,
        )

        capabilities.additional_properties = d
        return capabilities

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
