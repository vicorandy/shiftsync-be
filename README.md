# ShiftSync Backend

A workforce management system for shift scheduling, compliance tracking, and staff management.

## Getting Started

1. Install dependencies: `npm install`
2. Set up your `.env` file with `DATABASE_URL` and `JWT_SECRET`.
3. Run migrations: `npx prisma migrate dev`
4. Seed the database: `npx prisma db seed`
5. Start the server: `npm start`

## How to Log In

All roles use the same login endpoint: `POST /api/auth/login`.

1. **Endpoint**: `http://localhost:5000/api/auth/login`
2. **Body**:
   ```json
   {
     "email": "user@example.com",
     "password": "password123"
   }
   ```
3. **Response**: A JSON object containing a `token` and the `user` object. Use this token in the `Authorization` header as `Bearer <token>` for all subsequent requests.

---

## Known Limitations

- **Request Limit**: Each staff member is restricted to a maximum of **3 pending** swap or drop requests at any time.
- **Strict Validation**: The 10-hour rest rule and weekly/daily hour limits are strictly enforced by the backend during the swap acceptance phase.
- **Implicit Cancellations**: There is no dedicated "Cancel Swap" endpoint; instead, any manager-led edit to a shift (`PUT /api/shifts/:id`) automatically cancels all associated pending swaps.
- **No Direct Unassign**: To be removed from a shift, staff must use the `DROP` or `SWAP` workflow to ensure continuity of coverage.

---

## Technical Assumptions

- **Role Hierarchy**: `ADMIN` has global access. `MANAGER` is tied to specific locations via the `managedLocations` relation. `STAFF` can only initiate requests for shifts they are currently assigned to.
- **Request Lifecycle**: 
  - `DROP` requests are assumed to be "open" and move directly to `PENDING_APPROVAL`.
  - `SWAP` requests require a target `accepterId` and must be accepted by that user before reaching the manager for approval.
- **Timezones**: All shift times are stored and compared as ISO UTC strings, assuming the client handles local conversion.
- **Real-time**: Real-time notifications are delivered via Socket.io and are not persisted once the client disconnects unless checked via the `GET /api/admin/notifications` endpoint.

---

## Test Credentials

All accounts use the password: **`password123`**

| Role | Email | Assigned Location |
| :--- | :--- | :--- |
| **Admin** | `admin@shiftsync.com` | All Locations |
| **Manager** | `manager@shiftsync.com` | Downtown Café |
| **Staff 1** | `staff1@shiftsync.com` | Downtown Café (Cashier) |
| **Staff 2** | `staff2@shiftsync.com` | Downtown Café, Uptown Bistro (Barista) |

---

## API & Documentation Index

- Detailed Workflow: `docs/shift_swap_workflow.md`
- Frontend Socket Integration: `docs/frontend_socket_integration.md`
- Endpoints (Route Files): `src/routes/*`
