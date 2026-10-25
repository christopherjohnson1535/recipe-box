from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="Image")


@_attrs_define
class Image:
    """
    Attributes:
        display_url (None | str): The print-style rendition, whatever the household setting says; null if it could not
            be made.
        height (int):
        id (UUID):
        url (str):
        width (int):
    """

    display_url: None | str
    height: int
    id: UUID
    url: str
    width: int
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        display_url: None | str
        display_url = self.display_url

        height = self.height

        id = str(self.id)

        url = self.url

        width = self.width

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "displayUrl": display_url,
                "height": height,
                "id": id,
                "url": url,
                "width": width,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)

        def _parse_display_url(data: object) -> None | str:
            if data is None:
                return data
            return cast(None | str, data)

        display_url = _parse_display_url(d.pop("displayUrl"))

        height = d.pop("height")

        id = UUID(d.pop("id"))

        url = d.pop("url")

        width = d.pop("width")

        image = cls(
            display_url=display_url,
            height=height,
            id=id,
            url=url,
            width=width,
        )

        image.additional_properties = d
        return image

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
