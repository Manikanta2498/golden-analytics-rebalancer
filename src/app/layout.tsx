import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { StoreProvider } from "@/components/StoreProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Household Portfolio Rebalancer",
  description:
    "Turn a flat broker CSV into a household allocation view and the exact trades needed to reach your target.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <StoreProvider>
          <AppShell>{children}</AppShell>
        </StoreProvider>
      </body>
    </html>
  );
}
