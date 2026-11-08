import { Suspense } from 'react';
import { ScreeningScreen } from '../../components/screens/screening-screen';
import { Loading } from '../../components/ui';

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <ScreeningScreen />
    </Suspense>
  );
}
