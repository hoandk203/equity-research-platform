import { makeStore } from '../src/store/store';
import { compareBasket, DEFAULT_SCREENING_DRAFT, preferences, screeningDraft } from '../src/store/slices';

describe('redux slices', () => {
  it('keeps at most 3 distinct companies in the compare basket', () => {
    const store = makeStore();
    for (const s of ['FPT', 'HPG', 'VNM', 'MWG']) store.dispatch(compareBasket.actions.toggle(s));
    expect(store.getState().compareBasket.symbols).toEqual(['FPT', 'HPG', 'VNM']);
    store.dispatch(compareBasket.actions.toggle('HPG'));
    expect(store.getState().compareBasket.symbols).toEqual(['FPT', 'VNM']);
    store.dispatch(compareBasket.actions.set(['A', 'A', 'B', 'C', 'D']));
    expect(store.getState().compareBasket.symbols).toEqual(['A', 'B', 'C']);
    store.dispatch(compareBasket.actions.clear());
    expect(store.getState().compareBasket.symbols).toEqual([]);
  });
  it('remembers the screening draft between pages and can reset it', () => {
    const store = makeStore();
    expect(store.getState().screeningDraft).toEqual(DEFAULT_SCREENING_DRAFT);
    const draft = { mode: 'date' as const, year: 2025, date: '2025-06-30', conditions: [{ metric: 'PE', op: '<=' as const, value: 15 }] };
    store.dispatch(screeningDraft.actions.save(draft));
    expect(store.getState().screeningDraft).toEqual(draft);
    store.dispatch(screeningDraft.actions.reset());
    expect(store.getState().screeningDraft).toEqual(DEFAULT_SCREENING_DRAFT);
  });
  it('switches the money display mode', () => {
    const store = makeStore();
    expect(store.getState().preferences.moneyMode).toBe('TY');
    store.dispatch(preferences.actions.setMoneyMode('VND'));
    expect(store.getState().preferences.moneyMode).toBe('VND');
  });
});
