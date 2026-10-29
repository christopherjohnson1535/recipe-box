from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="CookPlanStep")


@_attrs_define
class CookPlanStep:
    """One step of a plan, in the order to do it.

    Attributes:
        note (str): A short tip from the AI (at most 200 characters, one line of plain text), or empty. Untrusted: show
            as text.
        recipe_id (UUID):
        start_at (datetime.datetime | None): The clock time to start, when `serveAt` was given and the plan is timed.
        start_offset_min (int | None): Minutes after the start; `null` in a round-robin plan.
        step_index (int): 0-based index into the recipe's `steps`.
    """

    note: str
    recipe_id: UUID
    start_at: datetime.datetime | None
    start_offset_min: int | None
    step_index: int
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        note = self.note

        recipe_id = str(self.recipe_id)

        start_at: None | str
        if isinstance(self.start_at, datetime.datetime):
            start_at = self.start_at.isoformat()
        else:
            start_at = self.start_at

        start_offset_min: int | None
        start_offset_min = self.start_offset_min

        step_index = self.step_index

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "note": note,
                "recipeId": recipe_id,
                "startAt": start_at,
                "startOffsetMin": start_offset_min,
                "stepIndex": step_index,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        note = d.pop("note")

        recipe_id = UUID(d.pop("recipeId"))

        def _parse_start_at(data: object) -> datetime.datetime | None:
            if data is None:
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                start_at_type_0 = datetime.datetime.fromisoformat(data)

                return start_at_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(datetime.datetime | None, data)

        start_at = _parse_start_at(d.pop("startAt"))

        def _parse_start_offset_min(data: object) -> int | None:
            if data is None:
                return data
            return cast(int | None, data)

        start_offset_min = _parse_start_offset_min(d.pop("startOffsetMin"))

        step_index = d.pop("stepIndex")

        cook_plan_step = cls(
            note=note,
            recipe_id=recipe_id,
            start_at=start_at,
            start_offset_min=start_offset_min,
            step_index=step_index,
        )

        cook_plan_step.additional_properties = d
        return cook_plan_step

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
