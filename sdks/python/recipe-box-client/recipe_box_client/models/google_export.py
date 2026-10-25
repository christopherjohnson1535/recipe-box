from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="GoogleExport")


@_attrs_define
class GoogleExport:
    """What was sent to Google Tasks.

    Attributes:
        items (int): Subtasks: the items beneath them.
        sections (int): Parent tasks: the store sections that had something to buy.
        task_list_title (str): The Google Tasks list used (`Groceries`).
    """

    items: int
    sections: int
    task_list_title: str
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        items = self.items

        sections = self.sections

        task_list_title = self.task_list_title

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "items": items,
                "sections": sections,
                "taskListTitle": task_list_title,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        items = d.pop("items")

        sections = d.pop("sections")

        task_list_title = d.pop("taskListTitle")

        google_export = cls(
            items=items,
            sections=sections,
            task_list_title=task_list_title,
        )

        google_export.additional_properties = d
        return google_export

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
