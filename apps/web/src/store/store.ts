import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';
import { compareBasket, preferences, screeningDraft } from './slices';

export function makeStore() {
  return configureStore({
    reducer: {
      compareBasket: compareBasket.reducer,
      screeningDraft: screeningDraft.reducer,
      preferences: preferences.reducer,
    },
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
