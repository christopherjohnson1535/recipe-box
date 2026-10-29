from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define

from ..types import UNSET, Unset

T = TypeVar("T", bound="NewCookLogEntry")


@_attrs_define
class NewCookLogEntry:
    """
    Attributes:
        cooked_on (datetime.date): The cook's own calendar day (`YYYY-MM-DD`); not in the future.
        note (str | Unset): What they would change next time; at most 2,000 characters once trimmed. Default empty.
    """

    cooked_on: datetime.date
    note: str | Unset = UNSET

    def to_dict(self) -> dict[str, Any]:
        cooked_on = self.cooked_on.isoformat()

        note = self.note

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "cookedOn": cooked_on,
            }
        )
        if note is not UNSET:
            field_dict["note"] = note

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        cooked_on = datetime.date.fromisoformat(d.pop("cookedOn"))

        note = d.pop("note", UNSET)

        new_cook_log_entry = cls(
            cooked_on=cooked_on,
            note=note,
        )

        return new_cook_log_entry
