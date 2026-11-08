import type { Metadata } from 'next';
import './global.css';
import { Providers } from '../components/providers';
import { AppShell } from '../components/app-shell';

export const metadata: Metadata = {
  title: 'Equity Research Platform',
  description: 'Báo cáo tài chính, chỉ số có truy vết và sàng lọc doanh nghiệp niêm yết Việt Nam',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
