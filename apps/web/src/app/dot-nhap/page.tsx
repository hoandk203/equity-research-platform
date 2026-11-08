import { Suspense } from 'react';
import { ImportsScreen } from '../../components/screens/imports-screen';
import { Loading } from '../../components/ui';

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <ImportsScreen />
    </Suspense>
  );
}
