# `get_user_role` — ERPNext Endpoint Spec

## Endpoint

```
GET /api/method/proman_edge.api.auth.get_user_role
Headers: Authorization: token {api_key}:{api_secret}
```

## Expected Response

```json
{
  "message": {
    "username": "satheesh",
    "full_name": "Satheesh Kumar",
    "email": "satheesh@proman.in",
    "role": "Sales Head",
    "role_slug": "sales-head",
    "company": "PISPL",
    "division": "Aggregate"
  }
}
```

## Role to Slug Mapping

| ERPNext Role | role_slug |
|---|---|
| Sales Head | `sales-head` |
| Manufacturing Head | `manufacturing-head` |
| Finance Head | `finance-head` |
| Engineering Head | `engineering-head` |
| Procurement Head | `procurement-head` |
| Managing Director | `md` |

## Python Method

File: `proman_edge/api/auth.py`

```python
import frappe

@frappe.whitelist()
def get_user_role():
    user = frappe.session.user
    user_doc = frappe.get_doc("User", user)

    role_map = {
        "Sales Head":         "sales-head",
        "Manufacturing Head": "manufacturing-head",
        "Finance Head":       "finance-head",
        "Engineering Head":   "engineering-head",
        "Procurement Head":   "procurement-head",
        "Managing Director":  "md",
    }

    # Priority order: MD first, then others
    priority = [
        "Managing Director",
        "Sales Head",
        "Manufacturing Head",
        "Finance Head",
        "Engineering Head",
        "Procurement Head",
    ]

    matched_role = None
    matched_slug = None
    user_roles = {r.role for r in user_doc.roles}
    for role in priority:
        if role in user_roles:
            matched_role = role
            matched_slug = role_map[role]
            break

    return {
        "username":  user_doc.username,
        "full_name": user_doc.full_name,
        "email":     user_doc.email,
        "role":      matched_role,
        "role_slug": matched_slug,
        "company":   user_doc.get("company") or "",
        "division":  user_doc.get("custom_division") or "",
    }
```

## Notes

- Method must be decorated with `@frappe.whitelist()` so it works with API key auth
- `custom_division` is a custom field on the User DocType — if not yet added, return empty string for now
- If a user has multiple Proman roles, the method returns the **highest priority** role (MD → Sales Head → Manufacturing Head → others)
- Add the method to `proman_edge/api/auth.py` and ensure the file is importable (add `__init__.py` if missing)
