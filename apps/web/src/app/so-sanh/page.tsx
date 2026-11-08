import { Suspense } from 'react';
import { CompareScreen } from '../../components/screens/compare-screen';
import { Loading } from '../../components/ui';

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <CompareScreen />
    </Suspense>
  );
}
