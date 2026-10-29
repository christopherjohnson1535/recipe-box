from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.source_type import SourceType

T = TypeVar("T", bound="RecipeSummary")


@_attrs_define
class RecipeSummary:
    """
    Attributes:
        description (str):
        id (UUID):
        image_display_url (None | str): As on `Recipe`.
        image_url (None | str):
        is_favourite (bool): As on `Recipe`.
        servings (None | str): Free text, as on `Recipe`.
        source_type (SourceType):
        tags (list[str]):
        title (str):
        total_minutes (int | None):
        updated_at (datetime.datetime):
    """

    description: str
    id: UUID
    image_display_url: None | str
    image_url: None | str
    is_favourite: bool
    servings: None | str
    source_type: SourceType
    tags: list[str]
    title: str
    total_minutes: int | None
    updated_at: datetime.datetime
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        description = self.description

        id = str(self.id)

        image_display_url: None | str
        image_display_url = self.image_display_url

        image_url: None | str
        image_url = self.image_url

        is_favourite = self.is_favourite

        servings: None | str
        servings = self.servings

        source_type = self.source_type.value

        tags = self.tags

        title = self.title

        total_minutes: int | None
        total_minutes = self.total_minutes

        updated_at = self.updated_at.isoformat()

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "description": description,
                "id": id,
                "imageDisplayUrl": image_display_url,
                "imageUrl": image_url,
                "isFavourite": is_favourite,
                "servings": servings,
                "sourceType": source_type,
                "tags": tags,
                "title": title,
                "totalMinutes": total_minutes,
                "updatedAt": updated_at,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        description = d.pop("description")

        id = UUID(d.pop("id"))

        def _parse_image_display_url(data: object) -> None | str:
            if data is None:
                return data
            return cast(None | str, data)

        image_display_url = _parse_image_display_url(d.pop("imageDisplayUrl"))

        def _parse_image_url(data: object) -> None | str:
            if data is None:
                return data
            return cast(None | str, data)

        image_url = _parse_image_url(d.pop("imageUrl"))

        is_favourite = d.pop("isFavourite")

        def _parse_servings(data: object) -> None | str:
            if data is None:
                return data
            return cast(None | str, data)

        servings = _parse_servings(d.pop("servings"))

        source_type = SourceType(d.pop("sourceType"))

        tags = cast(list[str], d.pop("tags"))

        title = d.pop("title")

        def _parse_total_minutes(data: object) -> int | None:
            if data is None:
                return data
            return cast(int | None, data)

        total_minutes = _parse_total_minutes(d.pop("totalMinutes"))

        updated_at = datetime.datetime.fromisoformat(d.pop("updatedAt"))

        recipe_summary = cls(
            description=description,
            id=id,
            image_display_url=image_display_url,
            image_url=image_url,
            is_favourite=is_favourite,
            servings=servings,
            source_type=source_type,
            tags=tags,
            title=title,
            total_minutes=total_minutes,
            updated_at=updated_at,
        )

        recipe_summary.additional_properties = d
        return recipe_summary

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
