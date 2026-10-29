from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
    from ..models.user_ref import UserRef


T = TypeVar("T", bound="CookLogEntry")


@_attrs_define
class CookLogEntry:
    """One "made it" entry: who cooked the recipe, on which day, and what they would change.

    Attributes:
        cooked_on (datetime.date): The cook's own calendar day (`YYYY-MM-DD`).
        created_at (datetime.datetime):
        id (UUID):
        made_by (None | UserRef):
        note (str): What they would change next time; empty when they left no note.
        recipe_id (UUID):
    """

    cooked_on: datetime.date
    created_at: datetime.datetime
    id: UUID
    made_by: None | UserRef
    note: str
    recipe_id: UUID
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        from ..models.user_ref import UserRef  # noqa: PLC0415

        cooked_on = self.cooked_on.isoformat()

        created_at = self.created_at.isoformat()

        id = str(self.id)

        made_by: dict[str, Any] | None
        if isinstance(self.made_by, UserRef):
            made_by = self.made_by.to_dict()
        else:
            made_by = self.made_by

        note = self.note

        recipe_id = str(self.recipe_id)

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "cookedOn": cooked_on,
                "createdAt": created_at,
                "id": id,
                "madeBy": made_by,
                "note": note,
                "recipeId": recipe_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.user_ref import UserRef  # noqa: PLC0415

        d = dict(src_dict)
        cooked_on = datetime.date.fromisoformat(d.pop("cookedOn"))

        created_at = datetime.datetime.fromisoformat(d.pop("createdAt"))

        id = UUID(d.pop("id"))

        def _parse_made_by(data: object) -> None | UserRef:
            if data is None:
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                made_by_type_0 = UserRef.from_dict(data)

                return made_by_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(None | UserRef, data)

        made_by = _parse_made_by(d.pop("madeBy"))

        note = d.pop("note")

        recipe_id = UUID(d.pop("recipeId"))

        cook_log_entry = cls(
            cooked_on=cooked_on,
            created_at=created_at,
            id=id,
            made_by=made_by,
            note=note,
            recipe_id=recipe_id,
        )

        cook_log_entry.additional_properties = d
        return cook_log_entry

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
