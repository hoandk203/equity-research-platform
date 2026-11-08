import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { MAX_COMPARE_SYMBOLS } from '@erp/contracts';
import type { DraftCondition } from '../lib/screening-url';

/**
 * Client state that travels between pages and that the URL does not carry (docs/14 §6).
 * Server data never goes here (that is React Query's job).
 */

export interface CompareBasketState {
  symbols: string[];
}
export const compareBasket = createSlice({
  name: 'compareBasket',
  initialState: { symbols: [] } as CompareBasketState,
  reducers: {
    toggle(state, action: PayloadAction<string>) {
      const s = action.payload;
      if (state.symbols.includes(s)) state.symbols = state.symbols.filter((x) => x !== s);
      else if (state.symbols.length < MAX_COMPARE_SYMBOLS) state.symbols.push(s);
    },
    set(state, action: PayloadAction<string[]>) {
      state.symbols = [...new Set(action.payload)].slice(0, MAX_COMPARE_SYMBOLS);
    },
    clear(state) {
      state.symbols = [];
    },
  },
});

export interface ScreeningDraftState {
  year: number;
  conditions: DraftCondition[];
}
export const DEFAULT_SCREENING_DRAFT: ScreeningDraftState = {
  year: 2024,
  conditions: [
    { metric: 'NET_MARGIN', op: '>=', value: 10 },
    { metric: 'CURRENT_RATIO', op: '>=', value: 1 },
  ],
};
export const screeningDraft = createSlice({
  name: 'screeningDraft',
  initialState: DEFAULT_SCREENING_DRAFT,
  reducers: {
    save(_state, action: PayloadAction<ScreeningDraftState>) {
      return action.payload;
    },
    reset() {
      return DEFAULT_SCREENING_DRAFT;
    },
  },
});

export interface PreferencesState {
  moneyMode: 'TY' | 'VND';
}
export const preferences = createSlice({
  name: 'preferences',
  initialState: { moneyMode: 'TY' } as PreferencesState,
  reducers: {
    setMoneyMode(state, action: PayloadAction<'TY' | 'VND'>) {
      state.moneyMode = action.payload;
    },
  },
});
