import "./globals.css";

export const metadata = {
  title: "梅花易數三盲互動實驗",
  description: "演講現場用的梅花易數三盲互動、QA、測驗與統計網站"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
