"use client";
import DashboardView from "./DashboardView";
import useDashboardController from "./useDashboardController";

export default function Dashboard() {
  return <DashboardView c={useDashboardController()} />;
}
