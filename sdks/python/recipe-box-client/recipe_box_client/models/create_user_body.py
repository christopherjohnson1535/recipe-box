from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.create_user_body_role import CreateUserBodyRole
from ..types import UNSET, Unset

T = TypeVar("T", bound="CreateUserBody")


@_attrs_define
class CreateUserBody:
    """
    Example:
        {'displayName': 'Alex', 'email': 'alex@example.com', 'password': 'correct horse battery', 'role': 'member',
            'username': 'alex'}

    Attributes:
        display_name (str):
        password (str):
        role (CreateUserBodyRole):
        username (str):
        email (None | str | Unset): The Google address that may sign in as this member (optional; trimmed and lower-
            cased, blank means none).
    """

    display_name: str
    password: str
    role: CreateUserBodyRole
    username: str
    email: None | str | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        display_name = self.display_name

        password = self.password

        role = self.role.value

        username = self.username

        email: None | str | Unset
        if isinstance(self.email, Unset):
            email = UNSET
        else:
            email = self.email

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "displayName": display_name,
                "password": password,
                "role": role,
                "username": username,
            }
        )
        if email is not UNSET:
            field_dict["email"] = email

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        display_name = d.pop("displayName")

        password = d.pop("password")

        role = CreateUserBodyRole(d.pop("role"))

        username = d.pop("username")

        def _parse_email(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        email = _parse_email(d.pop("email", UNSET))

        create_user_body = cls(
            display_name=display_name,
            password=password,
            role=role,
            username=username,
            email=email,
        )

        create_user_body.additional_properties = d
        return create_user_body

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
