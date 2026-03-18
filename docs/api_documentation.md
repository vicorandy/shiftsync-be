# ShiftSync API Documentation

Welcome to the ShiftSync API documentation. This document provides details on how to consume the available endpoints.

**Base URL**: `http://localhost:8000/api`

---

## Authentication

ShiftSync uses JWT (JSON Web Token) for authentication.

### POST /auth/register
Register a new user and create a staff profile if the role is 'STAFF'.
- **Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "securepassword",
    "name": "John Doe",
    "role": "STAFF" // ADMIN, MANAGER, STAFF
  }
  ```
- **Response**: `201 Created`
  ```json
  { "message": "User created successfully", "userId": "uuid" }
  ```

### POST /auth/login
Authenticate and receive a JWT.
- **Body**: `{ "email": "...", "password": "..." }`
- **Response**: `200 OK`
  ```json
  {
    "token": "jwt_token_here",
    "user": { "id": "...", "email": "...", "name": "...", "role": "...", "staffProfileId": "..." }
  }
  ```

> [!NOTE]
> Include the token in the `Authorization` header for all protected endpoints:
> `Authorization: Bearer <token>`

---

## Staff Management

### GET /staff/me
Get the authenticated staff member's profile.
- **Header**: `Authorization: Bearer <token>`
- **Response**: `200 OK` (StaffProfile with skills, locations, and availabilities)

### POST /staff/availability
Set or update staff availability.
- **Body**:
  ```json
  {
    "dayOfWeek": 1, // 0-6
    "startTime": "09:00",
    "endTime": "17:00",
    "startDate": "2024-03-20", // optional
    "endDate": "2024-03-20", // optional
    "isRecurring": true
  }
  ```

### POST /staff/:id/certify
**Role**: ADMIN, MANAGER
Certify staff for specific skills or locations.
- **Body**: `{ "skillIds": ["uuid"], "locationIds": ["uuid"] }`

---

## Shifts

### GET /shifts
Get shifts for a location and date range.
- **Query Params**: `locationId`, `start` (ISO date), `end` (ISO date)
- **Response**: `200 OK` (Array of Shifts)

### POST /shifts
**Role**: ADMIN, MANAGER
Create a new shift.
- **Body**: `{ "locationId": "...", "startTime": "...", "endTime": "...", "skillId": "...", "headcount": 1 }`

### PUT /shifts/:id
**Role**: ADMIN, MANAGER
Update shift details. Cancels pending swaps on edit.
- **Body**: `{ ...data to update... }`

### POST /shifts/:id/assign
**Role**: ADMIN, MANAGER
Assign staff to a shift. Includes constraint validation.
- **Body**: `{ "staffProfileId": "..." }`

### POST /shifts/publish
**Role**: ADMIN, MANAGER
Publish shifts for a date range at a location.
- **Body**: `{ "locationId": "...", "start": "...", "end": "..." }`

---

## Swaps & Drops

### POST /swaps/request
**Role**: STAFF
Create a swap (to another staff) or drop (open to all) request.
- **Body**: `{ "shiftId": "...", "type": "SWAP", "accepterProfileId": "..." }`

### POST /swaps/:id/accept
**Role**: STAFF
Accept a swap request. Validation ensures qualification.

### POST /swaps/:id/approve
**Role**: ADMIN, MANAGER
Approve or Reject a swap/drop.
- **Body**: `{ "action": "APPROVE", "comment": "..." }`

---

## Locations & Skills

### GET /locations
Get accessible locations based on role.

### POST /locations
**Role**: ADMIN
Create a new location.

### GET /skills
List all skills.

### POST /skills
**Role**: ADMIN
Create a new skill.

---

## Analytics & Reports

### GET /analytics/fairness
**Role**: ADMIN, MANAGER
Distribution report of hours and premium shifts.
- **Query Params**: `locationId`, `start`, `end`

### GET /analytics/on-duty
Live dashboard of staff currently working across all locations.

---

## Admin & Notifications

### GET /admin/notifications
Get user's notifications.

### PATCH /admin/notifications/:id/read
Mark a notification as read.

### GET /admin/audit
**Role**: ADMIN, MANAGER
View system audit logs.
- **Query Params**: `shiftId`, `locationId`, `userId`
