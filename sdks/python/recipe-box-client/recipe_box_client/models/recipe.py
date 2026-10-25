from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.source_type import SourceType

if TYPE_CHECKING:
    from ..models.ingredient import Ingredient
    from ..models.user_ref import UserRef


T = TypeVar("T", bound="Recipe")


@_attrs_define
class Recipe:
    """
    Attributes:
        cook_minutes (int | None):
        created_at (datetime.datetime):
        created_by (None | UserRef):
        description (str):
        id (UUID):
        image_display_url (None | str): The print-style rendition of the main photo; null when the household setting is
            off or it is not made yet.
        image_id (None | UUID):
        image_url (None | str):
        ingredients (list[Ingredient]):
        notes (str):
        photo_image_ids (list[UUID]):
        photo_urls (list[str]):
        prep_minutes (int | None):
        servings (None | str):
        source_name (None | str):
        source_type (SourceType):
        source_url (None | str):
        steps (list[Ingredient]):
        tags (list[str]):
        title (str):
        total_minutes (int | None):
        updated_at (datetime.datetime):
        updated_by (None | UserRef):
    """

    cook_minutes: int | None
    created_at: datetime.datetime
    created_by: None | UserRef
    description: str
    id: UUID
    image_display_url: None | str
    image_id: None | UUID
    image_url: None | str
    ingredients: list[Ingredient]
    notes: str
    photo_image_ids: list[UUID]
    photo_urls: list[str]
    prep_minutes: int | None
    servings: None | str
    source_name: None | str
    source_type: SourceType
    source_url: None | str
    steps: list[Ingredient]
    tags: list[str]
    title: str
    total_minutes: int | None
    updated_at: datetime.datetime
    updated_by: None | UserRef
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        from ..models.user_ref import UserRef  # noqa: PLC0415

        cook_minutes: int | None
        cook_minutes = self.cook_minutes

        created_at = self.created_at.isoformat()

        created_by: dict[str, Any] | None
        if isinstance(self.created_by, UserRef):
            created_by = self.created_by.to_dict()
        else:
            created_by = self.created_by

        description = self.description

        id = str(self.id)

        image_display_url: None | str
        image_display_url = self.image_display_url

        image_id: None | str
        if isinstance(self.image_id, UUID):
            image_id = str(self.image_id)
        else:
            image_id = self.image_id

        image_url: None | str
        image_url = self.image_url

        ingredients = []
        for ingredients_item_data in self.ingredients:
            ingredients_item = ingredients_item_data.to_dict()
            ingredients.append(ingredients_item)

        notes = self.notes

        photo_image_ids = []
        for photo_image_ids_item_data in self.photo_image_ids:
            photo_image_ids_item = str(photo_image_ids_item_data)
            photo_image_ids.append(photo_image_ids_item)

        photo_urls = self.photo_urls

        prep_minutes: int | None
        prep_minutes = self.prep_minutes

        servings: None | str
        servings = self.servings

        source_name: None | str
        source_name = self.source_name

        source_type = self.source_type.value

        source_url: None | str
        source_url = self.source_url

        steps = []
        for steps_item_data in self.steps:
            steps_item = steps_item_data.to_dict()
            steps.append(steps_item)

        tags = self.tags

        title = self.title

        total_minutes: int | None
        total_minutes = self.total_minutes

        updated_at = self.updated_at.isoformat()

        updated_by: dict[str, Any] | None
        if isinstance(self.updated_by, UserRef):
            updated_by = self.updated_by.to_dict()
        else:
            updated_by = self.updated_by

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "cookMinutes": cook_minutes,
                "createdAt": created_at,
                "createdBy": created_by,
                "description": description,
                "id": id,
                "imageDisplayUrl": image_display_url,
                "imageId": image_id,
                "imageUrl": image_url,
                "ingredients": ingredients,
                "notes": notes,
                "photoImageIds": photo_image_ids,
                "photoUrls": photo_urls,
                "prepMinutes": prep_minutes,
                "servings": servings,
                "sourceName": source_name,
                "sourceType": source_type,
                "sourceUrl": source_url,
                "steps": steps,
                "tags": tags,
                "title": title,
                "totalMinutes": total_minutes,
                "updatedAt": updated_at,
                "updatedBy": updated_by,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.ingredient import Ingredient  # noqa: PLC0415
        from ..models.user_ref import UserRef  # noqa: PLC0415

        d = dict(src_dict)

        def _parse_cook_minutes(data: object) -> int | None:
            if data is None:
                return data
            return cast(int | None, data)

        cook_minutes = _parse_cook_minutes(d.pop("cookMinutes"))

        created_at = datetime.datetime.fromisoformat(d.pop("createdAt"))

        def _parse_created_by(data: object) -> None | UserRef:
            if data is None:
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                created_by_type_0 = UserRef.from_dict(data)

                return created_by_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(None | UserRef, data)

        created_by = _parse_created_by(d.pop("createdBy"))

        description = d.pop("description")

        id = UUID(d.pop("id"))

        def _parse_image_display_url(data: object) -> None | str:
            if data is None:
                return data
            return cast(None | str, data)

        image_display_url = _parse_image_display_url(d.pop("imageDisplayUrl"))

        def _parse_image_id(data: object) -> None | UUID:
            if data is None:
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                image_id_type_0 = UUID(data)

                return image_id_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(None | UUID, data)

        image_id = _parse_image_id(d.pop("imageId"))

        def _parse_image_url(data: object) -> None | str:
            if data is None:
                return data
            return cast(None | str, data)

        image_url = _parse_image_url(d.pop("imageUrl"))

        ingredients = []
        _ingredients = d.pop("ingredients")
        for ingredients_item_data in _ingredients:
            ingredients_item = Ingredient.from_dict(ingredients_item_data)

            ingredients.append(ingredients_item)

        notes = d.pop("notes")

        photo_image_ids = []
        _photo_image_ids = d.pop("photoImageIds")
        for photo_image_ids_item_data in _photo_image_ids:
            photo_image_ids_item = UUID(photo_image_ids_item_data)

            photo_image_ids.append(photo_image_ids_item)

        photo_urls = cast(list[str], d.pop("photoUrls"))

        def _parse_prep_minutes(data: object) -> int | None:
            if data is None:
                return data
            return cast(int | None, data)

        prep_minutes = _parse_prep_minutes(d.pop("prepMinutes"))

        def _parse_servings(data: object) -> None | str:
            if data is None:
                return data
            return cast(None | str, data)

        servings = _parse_servings(d.pop("servings"))

        def _parse_source_name(data: object) -> None | str:
            if data is None:
                return data
            return cast(None | str, data)

        source_name = _parse_source_name(d.pop("sourceName"))

        source_type = SourceType(d.pop("sourceType"))

        def _parse_source_url(data: object) -> None | str:
            if data is None:
                return data
            return cast(None | str, data)

        source_url = _parse_source_url(d.pop("sourceUrl"))

        steps = []
        _steps = d.pop("steps")
        for steps_item_data in _steps:
            steps_item = Ingredient.from_dict(steps_item_data)

            steps.append(steps_item)

        tags = cast(list[str], d.pop("tags"))

        title = d.pop("title")

        def _parse_total_minutes(data: object) -> int | None:
            if data is None:
                return data
            return cast(int | None, data)

        total_minutes = _parse_total_minutes(d.pop("totalMinutes"))

        updated_at = datetime.datetime.fromisoformat(d.pop("updatedAt"))

        def _parse_updated_by(data: object) -> None | UserRef:
            if data is None:
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                updated_by_type_0 = UserRef.from_dict(data)

                return updated_by_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(None | UserRef, data)

        updated_by = _parse_updated_by(d.pop("updatedBy"))

        recipe = cls(
            cook_minutes=cook_minutes,
            created_at=created_at,
            created_by=created_by,
            description=description,
            id=id,
            image_display_url=image_display_url,
            image_id=image_id,
            image_url=image_url,
            ingredients=ingredients,
            notes=notes,
            photo_image_ids=photo_image_ids,
            photo_urls=photo_urls,
            prep_minutes=prep_minutes,
            servings=servings,
            source_name=source_name,
            source_type=source_type,
            source_url=source_url,
            steps=steps,
            tags=tags,
            title=title,
            total_minutes=total_minutes,
            updated_at=updated_at,
            updated_by=updated_by,
        )

        recipe.additional_properties = d
        return recipe

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
