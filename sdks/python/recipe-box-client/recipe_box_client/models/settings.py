from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define

T = TypeVar("T", bound="Settings")


@_attrs_define
class Settings:
    """
    Attributes:
        plate_treatment (bool): Show recipe photos with the print treatment (`imageDisplayUrl`); the originals are
            always kept.
    """

    plate_treatment: bool

    def to_dict(self) -> dict[str, Any]:
        plate_treatment = self.plate_treatment

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "plateTreatment": plate_treatment,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        plate_treatment = d.pop("plateTreatment")

        settings = cls(
            plate_treatment=plate_treatment,
        )

        return settings
