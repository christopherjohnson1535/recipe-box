from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.source_type import SourceType

if TYPE_CHECKING:
    from ..models.ingredient import Ingredient


T = TypeVar("T", bound="RecipeDraft")


@_attrs_define
class RecipeDraft:
    """What the import endpoints return; never saved by them. The client POSTs the reviewed draft to `/api/recipes`.

    Attributes:
        cook_minutes (int | None):
        description (str):
        duplicate_of (None | UUID):
        image_id (None | UUID):
        image_url (None | str):
        ingredients (list[Ingredient]):
        notes (str):
        photo_image_ids (list[UUID]):
        prep_minutes (int | None):
        servings (None | str):
        source_name (None | str):
        source_type (SourceType):
        source_url (None | str):
        steps (list[Ingredient]):
        tags (list[str]):
        title (str):
        total_minutes (int | None):
        warnings (list[str]):
    """

    cook_minutes: int | None
    description: str
    duplicate_of: None | UUID
    image_id: None | UUID
    image_url: None | str
    ingredients: list[Ingredient]
    notes: str
    photo_image_ids: list[UUID]
    prep_minutes: int | None
    servings: None | str
    source_name: None | str
    source_type: SourceType
    source_url: None | str
    steps: list[Ingredient]
    tags: list[str]
    title: str
    total_minutes: int | None
    warnings: list[str]
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        cook_minutes: int | None
        cook_minutes = self.cook_minutes

        description = self.description

        duplicate_of: None | str
        if isinstance(self.duplicate_of, UUID):
            duplicate_of = str(self.duplicate_of)
        else:
            duplicate_of = self.duplicate_of

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

        warnings = self.warnings

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "cookMinutes": cook_minutes,
                "description": description,
                "duplicateOf": duplicate_of,
                "imageId": image_id,
                "imageUrl": image_url,
                "ingredients": ingredients,
                "notes": notes,
                "photoImageIds": photo_image_ids,
                "prepMinutes": prep_minutes,
                "servings": servings,
                "sourceName": source_name,
                "sourceType": source_type,
                "sourceUrl": source_url,
                "steps": steps,
                "tags": tags,
                "title": title,
                "totalMinutes": total_minutes,
                "warnings": warnings,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.ingredient import Ingredient  # noqa: PLC0415

        d = dict(src_dict)

        def _parse_cook_minutes(data: object) -> int | None:
            if data is None:
                return data
            return cast(int | None, data)

        cook_minutes = _parse_cook_minutes(d.pop("cookMinutes"))

        description = d.pop("description")

        def _parse_duplicate_of(data: object) -> None | UUID:
            if data is None:
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                duplicate_of_type_0 = UUID(data)

                return duplicate_of_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(None | UUID, data)

        duplicate_of = _parse_duplicate_of(d.pop("duplicateOf"))

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

        warnings = cast(list[str], d.pop("warnings"))

        recipe_draft = cls(
            cook_minutes=cook_minutes,
            description=description,
            duplicate_of=duplicate_of,
            image_id=image_id,
            image_url=image_url,
            ingredients=ingredients,
            notes=notes,
            photo_image_ids=photo_image_ids,
            prep_minutes=prep_minutes,
            servings=servings,
            source_name=source_name,
            source_type=source_type,
            source_url=source_url,
            steps=steps,
            tags=tags,
            title=title,
            total_minutes=total_minutes,
            warnings=warnings,
        )

        recipe_draft.additional_properties = d
        return recipe_draft

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
