from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="ErrorDetail")


@_attrs_define
class ErrorDetail:
    """
    Attributes:
        code (str): The `code` of an error response (docs/API.md "Errors"). `api_unreachable` and `network` are not in
            it: the
            frontend proxy and browser client make those up. New codes may be added; treat an unknown code as a generic
            error.
        message (str):
        photo_image_ids (list[UUID] | None | Unset): Photo import only: the photos were stored but no draft could be
            made.
    """

    code: str
    message: str
    photo_image_ids: list[UUID] | None | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        code = self.code

        message = self.message

        photo_image_ids: list[str] | None | Unset
        if isinstance(self.photo_image_ids, Unset):
            photo_image_ids = UNSET
        elif isinstance(self.photo_image_ids, list):
            photo_image_ids = []
            for photo_image_ids_type_0_item_data in self.photo_image_ids:
                photo_image_ids_type_0_item = str(photo_image_ids_type_0_item_data)
                photo_image_ids.append(photo_image_ids_type_0_item)

        else:
            photo_image_ids = self.photo_image_ids

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "code": code,
                "message": message,
            }
        )
        if photo_image_ids is not UNSET:
            field_dict["photoImageIds"] = photo_image_ids

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        code = d.pop("code")

        message = d.pop("message")

        def _parse_photo_image_ids(data: object) -> list[UUID] | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, list):
                    raise TypeError()
                photo_image_ids_type_0 = []
                _photo_image_ids_type_0 = data
                for photo_image_ids_type_0_item_data in _photo_image_ids_type_0:
                    photo_image_ids_type_0_item = UUID(photo_image_ids_type_0_item_data)

                    photo_image_ids_type_0.append(photo_image_ids_type_0_item)

                return photo_image_ids_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(list[UUID] | None | Unset, data)

        photo_image_ids = _parse_photo_image_ids(d.pop("photoImageIds", UNSET))

        error_detail = cls(
            code=code,
            message=message,
            photo_image_ids=photo_image_ids,
        )

        error_detail.additional_properties = d
        return error_detail

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
