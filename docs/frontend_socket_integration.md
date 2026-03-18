# Frontend Socket.io Integration Guide

This guide explains how to connect to the ShiftSync real-time notification system and handle live updates in your frontend application.

## 1. Installation
Install the required client library for Socket.io:

```bash
npm install socket.io-client
```

## 2. Basic Connection Setup
Create a utility to manage your socket connection.

```javascript
import { io } from "socket.io-client";

const SOCKET_URL = "http://localhost:5000"; // Or your backend base URL

export const socket = io(SOCKET_URL, {
  autoConnect: false, // Recommended to connect manually after login
  withCredentials: true
});
```

## 3. Implementation in React (Recommended)
Below is a pattern for managing the socket lifecycle within your application's state or a custom hook.

### A. Authentication & Room Subscription
After a user logs in, you **must** connect and join relevant rooms.

```javascript
// Once the user is authenticated
useEffect(() => {
  if (user) {
    socket.connect();

    // 1. Join personal room (for private notifications)
    socket.emit("join_location", user.id); // Re-using join_location for simplicity

    // 2. Join location room (for schedule updates)
    if (user.locationId) {
      socket.emit("join_location", user.locationId);
    }
  }

  return () => {
    socket.disconnect(); // Cleanup on logout or unmount
  };
}, [user]);
```

### B. Listening for Events
Use another effect to handle incoming data.

```javascript
useEffect(() => {
  // Listen for personal notifications (Swaps/Drops)
  socket.on("notification", (data) => {
    toast.info(`${data.title}: ${data.message}`);
    // Example: refresh notifications list via state update or refetch
  });

  // Listen for location changes
  socket.on("shift_assigned", ({ shiftId, staffName }) => {
    toast.success(`Check Schedule: ${staffName} assigned to shift`);
  });

  socket.on("schedule_published", ({ locationId }) => {
    alert("The new schedule has been published!");
    // Trigger a schedule refetch here
  });

  return () => {
    socket.off("notification");
    socket.off("shift_assigned");
    socket.off("schedule_published");
  };
}, []);
```

## 4. Troubleshooting
- **CORS Errors**: The backend is configured with `origin: '*Available'`, but ensure your frontend URL is allowed if stricter policies are applied later.
- **Connection Failure**: Check if the server is running on the correct port (default is `5000`).
- **Room Membership**: Remember that room names are prefixed:
  - Personal: `user_${id}`
  - Location: `location_${id}`
