

## Fix: Current Location Marker Disappearing After First Show

### Problem
The user's current location marker shows once then disappears. Two root causes:

1. **Marker lost on map re-initialization** -- Both `OrdersMap` and `AnalyticsMap` add the user marker in an effect that depends on `[userLocation.lat, userLocation.lng]`. When the map is destroyed and recreated (style change, data reload), the marker is removed, but the effect doesn't re-run because the coordinates haven't changed.

2. **OrdersMap has no "Retry location" UI** -- Unlike `AnalyticsMap`, the Orders Map doesn't show a prompt or retry button when geolocation fails or hasn't been granted yet.

### Solution

#### 1. `useGeolocation.ts` -- Add a `timestamp` to force re-renders
Add a `timestamp` field to the state that updates each time location is successfully obtained. This gives consuming components a changing dependency to re-trigger marker placement.

#### 2. `OrdersMap.tsx` -- Fix marker persistence and add retry UI
- Add the map initialization state as a dependency to the user marker effect (use a `mapReady` state counter that increments each time the map finishes loading).
- Add the same "Current location unavailable" card with a "Retry location" button (matching the AnalyticsMap pattern).
- Import `LocateFixed` icon for the retry button.

#### 3. `AnalyticsMap.tsx` -- Fix marker persistence
- Same fix: track a `mapReady` counter, include it as a dependency in the user marker effect so the marker is re-added after map re-initialization.

### Technical Details

**useGeolocation.ts changes:**
- Add `locationTimestamp: number` to the state
- Set it to `Date.now()` on each successful position callback
- Export it so components can use it as an effect dependency

**OrdersMap.tsx changes:**
- Add `mapReady` state (number, starts at 0), increment it in the map's `load` event
- User marker effect depends on `[userLocation.lat, userLocation.lng, mapReady]`
- Add retry location card UI in the bottom-right area (same pattern as AnalyticsMap)

**AnalyticsMap.tsx changes:**
- Add `mapReady` state, increment on map `load` event
- User marker effect depends on `[userLocation.lat, userLocation.lng, mapReady]`
