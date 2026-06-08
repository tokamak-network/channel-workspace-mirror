import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Channel Workspace Mirror and Observer",
  description: "Reusable channel workspace mirror server with public channel observer views",
};

const enableVercelAnalytics =
  process.env.ENABLE_VERCEL_ANALYTICS === "true"
  || process.env.NEXT_PUBLIC_ENABLE_VERCEL_ANALYTICS === "true";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        {enableVercelAnalytics ? <Analytics /> : null}
      </body>
    </html>
  );
}
