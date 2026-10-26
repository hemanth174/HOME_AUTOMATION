"use client";

import DeviceFleet from "../DeviceFleet";

// Keep the established bookmark working while the admin uses one device-fleet
// implementation and one device-management API contract.
export default function AdminHardwarePage() {
  return <DeviceFleet />;
}
