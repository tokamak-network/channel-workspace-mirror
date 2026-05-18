import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Channel Workspace Mirror and Observer",
  description: "Reusable channel workspace mirror server with public channel observer views",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
