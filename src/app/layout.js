import "./globals.css";

export const metadata = {
  title: "Knowledge Workspace",
  description:
    "A local document workspace with explicit draft review and version history.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
