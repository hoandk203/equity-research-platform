import { Suspense } from 'react';
import { CompanyScreen } from '../../../components/screens/company-screen';
import { Loading } from '../../../components/ui';

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <CompanyScreen />
    </Suspense>
  );
}
