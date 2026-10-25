from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define

from ..types import UNSET, Unset

T = TypeVar("T", bound="GoogleExportRequest")


@_attrs_define
class GoogleExportRequest:
    """
    Attributes:
        include_staples (bool | None | Unset): Also send items marked as staples (default false).
    """

    include_staples: bool | None | Unset = UNSET

    def to_dict(self) -> dict[str, Any]:
        include_staples: bool | None | Unset
        if isinstance(self.include_staples, Unset):
            include_staples = UNSET
        else:
            include_staples = self.include_staples

        field_dict: dict[str, Any] = {}

        field_dict.update({})
        if include_staples is not UNSET:
            field_dict["includeStaples"] = include_staples

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)

        def _parse_include_staples(data: object) -> bool | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(bool | None | Unset, data)

        include_staples = _parse_include_staples(d.pop("includeStaples", UNSET))

        google_export_request = cls(
            include_staples=include_staples,
        )

        return google_export_request
