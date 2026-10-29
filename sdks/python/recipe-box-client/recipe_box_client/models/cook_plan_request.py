from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define

from ..types import UNSET, Unset

T = TypeVar("T", bound="CookPlanRequest")


@_attrs_define
class CookPlanRequest:
    """What to plan: the recipes of a cook-together session and, optionally, when to serve.

    Attributes:
        recipe_ids (list[UUID]): Two to four different recipe ids (a repeated id counts once).
        serve_at (datetime.datetime | None | Unset): When everything should be on the table; RFC 3339 with an offset.
            Gives each step of a timed plan its `startAt`.
    """

    recipe_ids: list[UUID]
    serve_at: datetime.datetime | None | Unset = UNSET

    def to_dict(self) -> dict[str, Any]:
        recipe_ids = []
        for recipe_ids_item_data in self.recipe_ids:
            recipe_ids_item = str(recipe_ids_item_data)
            recipe_ids.append(recipe_ids_item)

        serve_at: None | str | Unset
        if isinstance(self.serve_at, Unset):
            serve_at = UNSET
        elif isinstance(self.serve_at, datetime.datetime):
            serve_at = self.serve_at.isoformat()
        else:
            serve_at = self.serve_at

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "recipeIds": recipe_ids,
            }
        )
        if serve_at is not UNSET:
            field_dict["serveAt"] = serve_at

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        recipe_ids = []
        _recipe_ids = d.pop("recipeIds")
        for recipe_ids_item_data in _recipe_ids:
            recipe_ids_item = UUID(recipe_ids_item_data)

            recipe_ids.append(recipe_ids_item)

        def _parse_serve_at(data: object) -> datetime.datetime | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                serve_at_type_0 = datetime.datetime.fromisoformat(data)

                return serve_at_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(datetime.datetime | None | Unset, data)

        serve_at = _parse_serve_at(d.pop("serveAt", UNSET))

        cook_plan_request = cls(
            recipe_ids=recipe_ids,
            serve_at=serve_at,
        )

        return cook_plan_request
