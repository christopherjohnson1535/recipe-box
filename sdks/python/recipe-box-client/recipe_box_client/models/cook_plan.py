from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.cook_plan_source import CookPlanSource

if TYPE_CHECKING:
    from ..models.cook_plan_step import CookPlanStep


T = TypeVar("T", bound="CookPlan")


@_attrs_define
class CookPlan:
    """A suggested order for a cook-together session: every step of every recipe exactly once.

    Attributes:
        reason (None | str): Why the order is round-robin; `null` for an AI plan.
        serve_at (datetime.datetime | None): The requested `serveAt`, or `null`.
        source (CookPlanSource): Where a plan's order came from.
        steps (list[CookPlanStep]):
        total_minutes (int | None): Minutes from the first step until serving; `null` in a round-robin plan.
    """

    reason: None | str
    serve_at: datetime.datetime | None
    source: CookPlanSource
    steps: list[CookPlanStep]
    total_minutes: int | None
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        reason: None | str
        reason = self.reason

        serve_at: None | str
        if isinstance(self.serve_at, datetime.datetime):
            serve_at = self.serve_at.isoformat()
        else:
            serve_at = self.serve_at

        source = self.source.value

        steps = []
        for steps_item_data in self.steps:
            steps_item = steps_item_data.to_dict()
            steps.append(steps_item)

        total_minutes: int | None
        total_minutes = self.total_minutes

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "reason": reason,
                "serveAt": serve_at,
                "source": source,
                "steps": steps,
                "totalMinutes": total_minutes,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.cook_plan_step import CookPlanStep  # noqa: PLC0415

        d = dict(src_dict)

        def _parse_reason(data: object) -> None | str:
            if data is None:
                return data
            return cast(None | str, data)

        reason = _parse_reason(d.pop("reason"))

        def _parse_serve_at(data: object) -> datetime.datetime | None:
            if data is None:
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                serve_at_type_0 = datetime.datetime.fromisoformat(data)

                return serve_at_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(datetime.datetime | None, data)

        serve_at = _parse_serve_at(d.pop("serveAt"))

        source = CookPlanSource(d.pop("source"))

        steps = []
        _steps = d.pop("steps")
        for steps_item_data in _steps:
            steps_item = CookPlanStep.from_dict(steps_item_data)

            steps.append(steps_item)

        def _parse_total_minutes(data: object) -> int | None:
            if data is None:
                return data
            return cast(int | None, data)

        total_minutes = _parse_total_minutes(d.pop("totalMinutes"))

        cook_plan = cls(
            reason=reason,
            serve_at=serve_at,
            source=source,
            steps=steps,
            total_minutes=total_minutes,
        )

        cook_plan.additional_properties = d
        return cook_plan

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
