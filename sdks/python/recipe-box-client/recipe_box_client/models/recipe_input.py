from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.source_type import SourceType
from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.ingredient import Ingredient


T = TypeVar("T", bound="RecipeInput")


@_attrs_define
class RecipeInput:
    """
    Example:
        {'cookMinutes': 15, 'description': 'Fluffy weekend pancakes.', 'imageId': None, 'ingredients': [{'section':
            None, 'text': '2 cups flour'}, {'section': None, 'text': '2 eggs'}], 'notes': '', 'photoImageIds': [],
            'prepMinutes': 10, 'servings': '4', 'sourceName': None, 'sourceType': 'manual', 'sourceUrl': None, 'steps':
            [{'section': None, 'text': 'Mix the batter.'}, {'section': None, 'text': 'Fry until golden.'}], 'tags':
            ['breakfast'], 'title': 'Pancakes', 'totalMinutes': 25}

    Attributes:
        title (str):  Default: ''.
        cook_minutes (int | None | Unset):
        description (str | Unset):  Default: ''.
        image_id (None | Unset | UUID):
        ingredients (list[Ingredient] | Unset):
        notes (str | Unset):  Default: ''.
        photo_image_ids (list[UUID] | Unset):
        prep_minutes (int | None | Unset):
        servings (None | str | Unset):
        source_name (None | str | Unset):
        source_type (SourceType | Unset):
        source_url (None | str | Unset):
        steps (list[Ingredient] | Unset):
        tags (list[str] | Unset):
        total_minutes (int | None | Unset):
    """

    title: str = ""
    cook_minutes: int | None | Unset = UNSET
    description: str | Unset = ""
    image_id: None | Unset | UUID = UNSET
    ingredients: list[Ingredient] | Unset = UNSET
    notes: str | Unset = ""
    photo_image_ids: list[UUID] | Unset = UNSET
    prep_minutes: int | None | Unset = UNSET
    servings: None | str | Unset = UNSET
    source_name: None | str | Unset = UNSET
    source_type: SourceType | Unset = UNSET
    source_url: None | str | Unset = UNSET
    steps: list[Ingredient] | Unset = UNSET
    tags: list[str] | Unset = UNSET
    total_minutes: int | None | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        title = self.title

        cook_minutes: int | None | Unset
        if isinstance(self.cook_minutes, Unset):
            cook_minutes = UNSET
        else:
            cook_minutes = self.cook_minutes

        description = self.description

        image_id: None | str | Unset
        if isinstance(self.image_id, Unset):
            image_id = UNSET
        elif isinstance(self.image_id, UUID):
            image_id = str(self.image_id)
        else:
            image_id = self.image_id

        ingredients: list[dict[str, Any]] | Unset = UNSET
        if not isinstance(self.ingredients, Unset):
            ingredients = []
            for ingredients_item_data in self.ingredients:
                ingredients_item = ingredients_item_data.to_dict()
                ingredients.append(ingredients_item)

        notes = self.notes

        photo_image_ids: list[str] | Unset = UNSET
        if not isinstance(self.photo_image_ids, Unset):
            photo_image_ids = []
            for photo_image_ids_item_data in self.photo_image_ids:
                photo_image_ids_item = str(photo_image_ids_item_data)
                photo_image_ids.append(photo_image_ids_item)

        prep_minutes: int | None | Unset
        if isinstance(self.prep_minutes, Unset):
            prep_minutes = UNSET
        else:
            prep_minutes = self.prep_minutes

        servings: None | str | Unset
        if isinstance(self.servings, Unset):
            servings = UNSET
        else:
            servings = self.servings

        source_name: None | str | Unset
        if isinstance(self.source_name, Unset):
            source_name = UNSET
        else:
            source_name = self.source_name

        source_type: str | Unset = UNSET
        if not isinstance(self.source_type, Unset):
            source_type = self.source_type.value

        source_url: None | str | Unset
        if isinstance(self.source_url, Unset):
            source_url = UNSET
        else:
            source_url = self.source_url

        steps: list[dict[str, Any]] | Unset = UNSET
        if not isinstance(self.steps, Unset):
            steps = []
            for steps_item_data in self.steps:
                steps_item = steps_item_data.to_dict()
                steps.append(steps_item)

        tags: list[str] | Unset = UNSET
        if not isinstance(self.tags, Unset):
            tags = self.tags

        total_minutes: int | None | Unset
        if isinstance(self.total_minutes, Unset):
            total_minutes = UNSET
        else:
            total_minutes = self.total_minutes

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "title": title,
            }
        )
        if cook_minutes is not UNSET:
            field_dict["cookMinutes"] = cook_minutes
        if description is not UNSET:
            field_dict["description"] = description
        if image_id is not UNSET:
            field_dict["imageId"] = image_id
        if ingredients is not UNSET:
            field_dict["ingredients"] = ingredients
        if notes is not UNSET:
            field_dict["notes"] = notes
        if photo_image_ids is not UNSET:
            field_dict["photoImageIds"] = photo_image_ids
        if prep_minutes is not UNSET:
            field_dict["prepMinutes"] = prep_minutes
        if servings is not UNSET:
            field_dict["servings"] = servings
        if source_name is not UNSET:
            field_dict["sourceName"] = source_name
        if source_type is not UNSET:
            field_dict["sourceType"] = source_type
        if source_url is not UNSET:
            field_dict["sourceUrl"] = source_url
        if steps is not UNSET:
            field_dict["steps"] = steps
        if tags is not UNSET:
            field_dict["tags"] = tags
        if total_minutes is not UNSET:
            field_dict["totalMinutes"] = total_minutes

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.ingredient import Ingredient  # noqa: PLC0415

        d = dict(src_dict)
        title = d.pop("title")

        def _parse_cook_minutes(data: object) -> int | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(int | None | Unset, data)

        cook_minutes = _parse_cook_minutes(d.pop("cookMinutes", UNSET))

        description = d.pop("description", UNSET)

        def _parse_image_id(data: object) -> None | Unset | UUID:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                image_id_type_0 = UUID(data)

                return image_id_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(None | Unset | UUID, data)

        image_id = _parse_image_id(d.pop("imageId", UNSET))

        _ingredients = d.pop("ingredients", UNSET)
        ingredients: list[Ingredient] | Unset = UNSET
        if _ingredients is not UNSET:
            ingredients = []
            for ingredients_item_data in _ingredients:
                ingredients_item = Ingredient.from_dict(ingredients_item_data)

                ingredients.append(ingredients_item)

        notes = d.pop("notes", UNSET)

        _photo_image_ids = d.pop("photoImageIds", UNSET)
        photo_image_ids: list[UUID] | Unset = UNSET
        if _photo_image_ids is not UNSET:
            photo_image_ids = []
            for photo_image_ids_item_data in _photo_image_ids:
                photo_image_ids_item = UUID(photo_image_ids_item_data)

                photo_image_ids.append(photo_image_ids_item)

        def _parse_prep_minutes(data: object) -> int | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(int | None | Unset, data)

        prep_minutes = _parse_prep_minutes(d.pop("prepMinutes", UNSET))

        def _parse_servings(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        servings = _parse_servings(d.pop("servings", UNSET))

        def _parse_source_name(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        source_name = _parse_source_name(d.pop("sourceName", UNSET))

        _source_type = d.pop("sourceType", UNSET)
        source_type: SourceType | Unset
        if isinstance(_source_type, Unset):
            source_type = UNSET
        else:
            source_type = SourceType(_source_type)

        def _parse_source_url(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        source_url = _parse_source_url(d.pop("sourceUrl", UNSET))

        _steps = d.pop("steps", UNSET)
        steps: list[Ingredient] | Unset = UNSET
        if _steps is not UNSET:
            steps = []
            for steps_item_data in _steps:
                steps_item = Ingredient.from_dict(steps_item_data)

                steps.append(steps_item)

        tags = cast(list[str], d.pop("tags", UNSET))

        def _parse_total_minutes(data: object) -> int | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(int | None | Unset, data)

        total_minutes = _parse_total_minutes(d.pop("totalMinutes", UNSET))

        recipe_input = cls(
            title=title,
            cook_minutes=cook_minutes,
            description=description,
            image_id=image_id,
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
            total_minutes=total_minutes,
        )

        recipe_input.additional_properties = d
        return recipe_input

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
