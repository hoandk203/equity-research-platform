import { Suspense } from 'react';
import { CompaniesScreen } from '../components/screens/companies-screen';
import { Loading } from '../components/ui';

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <CompaniesScreen />
    </Suspense>
  );
}
