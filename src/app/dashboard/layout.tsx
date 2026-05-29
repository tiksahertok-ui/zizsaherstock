import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard — Portfolio Management",
  description:
    "Manage your Egyptian stock portfolio. Track EGX stocks, gold prices, USD/EGP rates, and performance analytics in real-time.",
  openGraph: {
    title: "Dashboard — EGX Portfolio Tracker",
    description: "Real-time portfolio management for Egyptian stocks and gold.",
    type: "website",
  },
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
