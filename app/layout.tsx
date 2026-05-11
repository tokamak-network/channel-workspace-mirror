import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Channel Workspace Mirror",
  description: "Reusable channel workspace mirror server",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
