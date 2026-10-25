from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.user_role import UserRole

T = TypeVar("T", bound="User")


@_attrs_define
class User:
    """
    Attributes:
        created_at (datetime.datetime):
        display_name (str):
        id (UUID):
        role (UserRole):
        username (str):
    """

    created_at: datetime.datetime
    display_name: str
    id: UUID
    role: UserRole
    username: str
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        created_at = self.created_at.isoformat()

        display_name = self.display_name

        id = str(self.id)

        role = self.role.value

        username = self.username

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "createdAt": created_at,
                "displayName": display_name,
                "id": id,
                "role": role,
                "username": username,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        created_at = datetime.datetime.fromisoformat(d.pop("createdAt"))

        display_name = d.pop("displayName")

        id = UUID(d.pop("id"))

        role = UserRole(d.pop("role"))

        username = d.pop("username")

        user = cls(
            created_at=created_at,
            display_name=display_name,
            id=id,
            role=role,
            username=username,
        )

        user.additional_properties = d
        return user

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
